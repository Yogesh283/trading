import crypto from "node:crypto";
import { dbGet, dbRun, dbAll, initAppDb } from "../db/appDb";
import { applyLedger, getWalletBalance } from "./walletStore";
import { distributeInvestmentStakeLevelIncome, getLevelIncomeRecipientIds } from "./referralService";
import { getInvestmentMonthlyRoiFraction } from "./investmentRoiConfigService";
import { getEffectiveInvestmentRoiUplinePercents } from "./investmentRoiLevelService";
import { INVESTMENT_LOCK_HOURS } from "../config/investment";
import { LEVEL_INCOME_DEPTH } from "../config/referral";
import { logger } from "../utils/logger";

export type UserInvestmentRow = {
  user_id: string;
  principal: number;
  locked_until: string | null;
  last_yield_date: string | null;
  last_monthly_yield_ym: string | null;
};

function lockMs(): number {
  return INVESTMENT_LOCK_HOURS * 60 * 60 * 1000;
}

export async function getOrCreateInvestment(userId: string): Promise<UserInvestmentRow> {
  await initAppDb();
  let row = await dbGet<UserInvestmentRow>(
    "SELECT user_id, principal, locked_until, last_yield_date, last_monthly_yield_ym FROM user_investments WHERE user_id = ?",
    [userId]
  );
  if (!row) {
    await dbRun(
      "INSERT INTO user_investments (user_id, principal, locked_until, last_yield_date, last_monthly_yield_ym) VALUES (?, 0, NULL, NULL, NULL)",
      [userId]
    );
    row = {
      user_id: userId,
      principal: 0,
      locked_until: null,
      last_yield_date: null,
      last_monthly_yield_ym: null
    };
  }
  return {
    ...row,
    principal: Number(row.principal) || 0,
    last_monthly_yield_ym: row.last_monthly_yield_ym ?? null
  };
}

function isoPlusHours(h: number): string {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

export async function investFromWallet(userId: string, amount: number): Promise<UserInvestmentRow> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }
  const bal = await getWalletBalance(userId);
  if (bal + 1e-9 < amount) {
    throw new Error("Insufficient live wallet balance");
  }

  const ref = `inv-${crypto.randomUUID()}`;
  await applyLedger(userId, -amount, "investment_deposit", ref);
  void distributeInvestmentStakeLevelIncome(userId, amount, ref).catch((e) =>
    logger.warn({ e, userId, ref }, "Investment stake level income failed")
  );

  const cur = await getOrCreateInvestment(userId);
  const newPrincipal = Number((cur.principal + amount).toFixed(8));
  const lockedUntil = isoPlusHours(INVESTMENT_LOCK_HOURS);

  await dbRun(
    "UPDATE user_investments SET principal = ?, locked_until = ? WHERE user_id = ?",
    [newPrincipal, lockedUntil, userId]
  );

  return getOrCreateInvestment(userId);
}

export async function withdrawToWallet(userId: string, amount: number): Promise<UserInvestmentRow> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }
  const cur = await getOrCreateInvestment(userId);
  if (cur.principal + 1e-9 < amount) {
    throw new Error("Insufficient invested balance");
  }

  const unlockAt = cur.locked_until ? new Date(cur.locked_until).getTime() : 0;
  if (unlockAt > Date.now()) {
    const hrs = Math.ceil((unlockAt - Date.now()) / (60 * 60 * 1000));
    throw new Error(`Funds unlock in about ${hrs}h (24h lock after each investment).`);
  }

  const ref = `invw-${crypto.randomUUID()}`;
  await applyLedger(userId, amount, "investment_withdrawal", ref);

  const newPrincipal = Number((cur.principal - amount).toFixed(8));
  if (newPrincipal <= 1e-6) {
    await dbRun(
      "UPDATE user_investments SET principal = 0, locked_until = NULL, last_yield_date = NULL, last_monthly_yield_ym = NULL WHERE user_id = ?",
      [userId]
    );
  } else {
    await dbRun("UPDATE user_investments SET principal = ? WHERE user_id = ?", [newPrincipal, userId]);
  }

  return getOrCreateInvestment(userId);
}

/** UTC calendar month `YYYY-MM`. */
export function utcMonthYm(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

export function isFirstDayUtc(d = new Date()): boolean {
  return d.getUTCDate() === 1;
}

/**
 * Once per calendar month (UTC), on the 1st: gross = principal × monthly_roi.
 * Investor gets gross × (1 − sum of admin upline %). Each upline level i gets gross × level_i % (referral chain).
 */
export async function runInvestmentMonthlyYield(): Promise<{
  paid: number;
  users: number;
  skipped?: string;
  monthYm?: string;
}> {
  await initAppDb();
  const now = new Date();
  if (!isFirstDayUtc(now)) {
    return { paid: 0, users: 0, skipped: "not_first_utc" };
  }

  const ym = utcMonthYm(now);
  const roi = await getInvestmentMonthlyRoiFraction();
  const byLevel = await getEffectiveInvestmentRoiUplinePercents();
  let configuredUplineSum = 0;
  for (let lv = 1; lv <= LEVEL_INCOME_DEPTH; lv++) {
    configuredUplineSum += byLevel.get(lv) ?? 0;
  }
  if (configuredUplineSum > 1 + 1e-6) {
    logger.error(
      { sum: configuredUplineSum },
      "investment_roi_level_distribution sum > 1 — fix admin settings; skipping monthly yield run"
    );
    return { paid: 0, users: 0, skipped: "invalid_upline_roi_sum", monthYm: ym };
  }

  const rows = await dbAll<UserInvestmentRow>(
    "SELECT user_id, principal, locked_until, last_yield_date, last_monthly_yield_ym FROM user_investments WHERE principal > 0.0000001"
  );

  let paid = 0;
  let users = 0;

  for (const row of rows) {
    const prevYm = String(row.last_monthly_yield_ym ?? "").trim();
    if (prevYm === ym) {
      continue;
    }

    const principal = Number(row.principal);
    const gross = Number((principal * roi).toFixed(8));
    const yieldRef = `inv-yield-${ym}-${row.user_id}`;

    if (gross <= 0) {
      await dbRun("UPDATE user_investments SET last_monthly_yield_ym = ? WHERE user_id = ?", [ym, row.user_id]);
      continue;
    }

    try {
      const recipients = await getLevelIncomeRecipientIds(row.user_id);
      let paidUpline = 0;
      let level = 1;
      for (const uid of recipients) {
        const frac = byLevel.get(level) ?? 0;
        if (frac > 0) {
          const amt = Number((gross * frac).toFixed(6));
          if (amt > 0) {
            await applyLedger(uid, amt, "level_income_roi", `${yieldRef}-L${level}`);
            paidUpline += amt;
          }
        }
        level += 1;
      }
      const configuredUplineTotal = Number((gross * configuredUplineSum).toFixed(6));
      const orphanUpline = Number(Math.max(0, configuredUplineTotal - paidUpline).toFixed(6));
      const baseInvestor = Number((gross * (1 - configuredUplineSum)).toFixed(6));
      const investorNet = Number((baseInvestor + orphanUpline).toFixed(6));
      if (investorNet > 0) {
        await applyLedger(row.user_id, investorNet, "investment_yield", yieldRef);
      }
      await dbRun("UPDATE user_investments SET last_monthly_yield_ym = ?, last_yield_date = ? WHERE user_id = ?", [
        ym,
        now.toISOString().slice(0, 10),
        row.user_id
      ]);
      paid += gross;
      users += 1;
    } catch (e) {
      logger.warn({ e, userId: row.user_id }, "investment_yield monthly failed");
    }
  }

  logger.info({ monthYm: ym, users, totalPaid: paid, roi }, "Investment monthly yield run (1st UTC)");
  return { paid, users, monthYm: ym };
}

/** @deprecated Use runInvestmentMonthlyYield — kept for external scripts that still import the old name. */
export async function runInvestmentDailyYield() {
  return runInvestmentMonthlyYield();
}

export function investmentSnapshot(
  row: UserInvestmentRow,
  liveBalance: number,
  monthlyRoiFraction: number,
  uplineFractionSumOfGross: number
) {
  const unlockAt = row.locked_until ? new Date(row.locked_until).getTime() : 0;
  const locked = unlockAt > Date.now();
  const estGross = row.principal * monthlyRoiFraction;
  const retain = Math.max(0, 1 - Math.min(uplineFractionSumOfGross, 1));
  const estMonthly = estGross * retain;
  const uplineCapped = Math.min(uplineFractionSumOfGross, 1);

  return {
    principal: row.principal,
    lockedUntil: row.locked_until,
    locked,
    secondsUntilUnlock: locked ? Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000)) : 0,
    liveWalletBalance: liveBalance,
    monthlyYieldPercent: monthlyRoiFraction * 100,
    /** @deprecated Daily accrual removed — same as monthly % for compatibility. */
    dailyYieldPercent: 0,
    /** Your estimated share of the gross monthly pool (after upline split). */
    estimatedMonthlyIncome: Number(estMonthly.toFixed(6)),
    /** Gross pool = principal × monthly % (before upline split). */
    estimatedMonthlyGrossYield: Number(estGross.toFixed(6)),
    /** Sum of admin-configured upline shares of gross (0–1). */
    uplinePercentOfMonthlyGrossSum: Number(uplineCapped.toFixed(8)),
    /** Your fraction of gross (1 − upline sum, capped). */
    investorNetFractionOfGross: Number(retain.toFixed(8)),
    /** @deprecated Use estimatedMonthlyIncome */
    estimatedDailyIncome: 0,
    lastYieldDate: row.last_yield_date,
    lastMonthlyYieldYm: row.last_monthly_yield_ym,
    payoutDayUtc: 1,
    explanation: `${(monthlyRoiFraction * 100).toFixed(2)}% of principal per month is the gross pool, credited on the 1st (UTC). You keep about ${(retain * 100).toFixed(2)}% of that pool; up to 5 upline levels share the rest per admin “Investment ROI” settings (not the betting referral table). After each add, funds lock ${INVESTMENT_LOCK_HOURS}h before withdrawal.`
  };
}
