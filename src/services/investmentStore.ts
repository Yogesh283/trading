import crypto from "node:crypto";
import { dbGet, dbRun, dbAll, initAppDb, isMysqlMode } from "../db/appDb";
import { applyLedger, getWalletBalance } from "./walletStore";
import { distributeInvestmentStakeLevelIncome } from "./referralService";
import {
  dailyYieldFraction,
  INVESTMENT_LOCK_HOURS,
  INVESTMENT_MONTHLY_YIELD,
  INVESTMENT_YIELD_DAYS
} from "../config/investment";
import { logger } from "../utils/logger";

export type UserInvestmentRow = {
  user_id: string;
  principal: number;
  locked_until: string | null;
  last_yield_date: string | null;
};

function lockMs(): number {
  return INVESTMENT_LOCK_HOURS * 60 * 60 * 1000;
}

export async function getOrCreateInvestment(userId: string): Promise<UserInvestmentRow> {
  await initAppDb();
  let row = await dbGet<UserInvestmentRow>(
    "SELECT user_id, principal, locked_until, last_yield_date FROM user_investments WHERE user_id = ?",
    [userId]
  );
  if (!row) {
    await dbRun(
      "INSERT INTO user_investments (user_id, principal, locked_until, last_yield_date) VALUES (?, 0, NULL, NULL)",
      [userId]
    );
    row = {
      user_id: userId,
      principal: 0,
      locked_until: null,
      last_yield_date: null
    };
  }
  return {
    ...row,
    principal: Number(row.principal) || 0
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
      "UPDATE user_investments SET principal = 0, locked_until = NULL, last_yield_date = NULL WHERE user_id = ?",
      [userId]
    );
  } else {
    await dbRun("UPDATE user_investments SET principal = ? WHERE user_id = ?", [newPrincipal, userId]);
  }

  return getOrCreateInvestment(userId);
}

/** UTC date YYYY-MM-DD */
export function utcDateString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Pays one day's yield on current principal. Idempotent per user per UTC day.
 * Withdrawn principal no longer earns (only rows with principal > 0).
 */
export async function runInvestmentDailyYield(): Promise<{ paid: number; users: number }> {
  await initAppDb();
  const today = utcDateString();
  const frac = dailyYieldFraction();

  const rows = await dbAll<UserInvestmentRow>(
    "SELECT user_id, principal, locked_until, last_yield_date FROM user_investments WHERE principal > 0.0000001"
  );

  let paid = 0;
  let users = 0;

  for (const row of rows) {
    if (row.last_yield_date === today) {
      continue;
    }

    const principal = Number(row.principal);
    const income = Number((principal * frac).toFixed(6));
    if (income <= 0) {
      await dbRun("UPDATE user_investments SET last_yield_date = ? WHERE user_id = ?", [today, row.user_id]);
      continue;
    }

    try {
      await applyLedger(row.user_id, income, "investment_yield", `inv-yield-${today}-${row.user_id}`);
      await dbRun("UPDATE user_investments SET last_yield_date = ? WHERE user_id = ?", [
        today,
        row.user_id
      ]);
      paid += income;
      users += 1;
    } catch (e) {
      logger.warn({ e, userId: row.user_id }, "investment_yield failed");
    }
  }

  logger.info({ today, users, totalPaid: paid }, "Investment daily yield run");
  return { paid, users };
}

export function investmentSnapshot(row: UserInvestmentRow, liveBalance: number) {
  const unlockAt = row.locked_until ? new Date(row.locked_until).getTime() : 0;
  const locked = unlockAt > Date.now();
  const dailyPct = (INVESTMENT_MONTHLY_YIELD / INVESTMENT_YIELD_DAYS) * 100;
  const estDaily = row.principal * dailyYieldFraction();

  return {
    principal: row.principal,
    lockedUntil: row.locked_until,
    locked,
    secondsUntilUnlock: locked ? Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000)) : 0,
    liveWalletBalance: liveBalance,
    monthlyYieldPercent: INVESTMENT_MONTHLY_YIELD * 100,
    dailyYieldPercent: dailyPct,
    estimatedDailyIncome: Number(estDaily.toFixed(6)),
    lastYieldDate: row.last_yield_date,
    explanation: `${INVESTMENT_MONTHLY_YIELD * 100}% per month, paid daily (~${dailyPct.toFixed(3)}% of principal per day). After each investment add, funds are locked ${INVESTMENT_LOCK_HOURS}h. Withdrawing ends yield on that amount.`
  };
}
