import crypto from "node:crypto";
import mysql from "mysql2/promise";
import {
  DEFAULT_DEMO_BALANCE_INR,
  DEMO_MIGRATE_LEGACY_BALANCE,
  LEGACY_DEMO_BALANCE_INR
} from "../config/demo";
import { DEMO_CHALLENGE_REWARD_INR, DEMO_CHALLENGE_TARGET_INR } from "../config/demoChallenge";
import { dbAll, dbGet, dbRun, acquireMysqlConnection, initAppDb, isMysqlMode } from "../db/appDb";
import { getIstDateKey } from "../utils/istDate";

/** Demo balance must be below this (INR) before daily demo funds can be claimed. */
export const DEMO_FUNDS_CLAIM_MAX_BALANCE_INR = 1;

const BONUS_TO_LIVE_THRESHOLD_INR = 100_000;
const BONUS_TO_LIVE_REWARD_INR = 10;
const BONUS_TO_LIVE_TRANSFER_TXN_TYPE = "bonus_to_live_transfer";

export type TransactionRow = {
  id: string;
  user_id: string;
  txn_type: string;
  amount: number;
  before_balance: number;
  after_balance: number;
  reference_id: string | null;
  created_at: string;
};

const userQueues = new Map<string, Promise<unknown>>();

type WalletQueueLane = "live" | "bonus" | "demo";

/** Serialize wallet mutations per lane (bonus withdraw does not wait on live/demo lanes). */
export function withWalletLane<T>(
  userId: string,
  lane: WalletQueueLane,
  fn: () => Promise<T>
): Promise<T> {
  return enqueue(userId, fn, lane);
}

function enqueue<T>(userId: string, fn: () => Promise<T>, lane: WalletQueueLane = "live"): Promise<T> {
  const key = `${userId}:${lane}`;
  const prev = userQueues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => fn()) as Promise<T>;
  userQueues.set(key, next);
  next.finally(() => {
    if (userQueues.get(key) === next) userQueues.delete(key);
  });
  return next;
}

export async function ensureWallet(userId: string): Promise<void> {
  await initAppDb();
  const userRow = await dbGet<{ id: string }>(
    isMysqlMode() ? "SELECT id FROM users WHERE id = ? LIMIT 1" : "SELECT id FROM users WHERE id = ?",
    [userId]
  );
  if (!userRow) {
    throw new Error("User must exist in users table — register or add user in DB first");
  }
  const row = await dbGet<{ c: number }>(
    isMysqlMode()
      ? "SELECT 1 AS c FROM wallets WHERE user_id = ? LIMIT 1"
      : "SELECT 1 AS c FROM wallets WHERE user_id = ?",
    [userId]
  );
  if (row) return;
  const now = new Date().toISOString();
  const todayIst = getIstDateKey();
  await dbRun(
    "INSERT INTO wallets (user_id, balance, demo_balance, locked_bonus_inr, demo_funds_last_claimed_date, demo_funds_claims_used, updated_at) VALUES (?, 0, ?, 0, ?, 1, ?)",
    [userId, DEFAULT_DEMO_BALANCE_INR, todayIst, now]
  );
}

export type DemoFundsDailyStatus = {
  daily_amount_inr: number;
  /** 1 per day + 1 extra per direct referral joined today (IST). */
  claims_allowed_today: number;
  claims_used_today: number;
  claims_remaining_today: number;
  direct_joined_today: number;
  /** @deprecated use claims_remaining_today === 0 */
  claimed_today: boolean;
  can_claim_today: boolean;
  last_claimed_date: string | null;
};

const DEMO_FUNDS_BASE_CLAIMS_PER_DAY = 1;

/** Legacy registration set `demo_funds_last_claimed_date` without bumping `demo_funds_claims_used`. */
function claimsUsedForIstDay(storedDay: string | null, today: string, rawClaimsUsed: number): number {
  if (storedDay !== today) return 0;
  const n = Math.max(0, rawClaimsUsed);
  return n === 0 ? 1 : n;
}

/**
 * New IST day + demo balance used up (below ₹1): reset daily claim bucket so user can claim fresh demo funds.
 * Rule: use today's demo funds to ₹0 → next calendar day (IST) → new ₹10,000 claim.
 */
async function syncDemoFundsIstDayRollover(
  userId: string,
  demoBalance: number,
  storedClaimDay: string | null
): Promise<void> {
  const today = getIstDateKey();
  const stored = String(storedClaimDay ?? "").trim() || null;
  if (!stored || stored === today) return;
  if (demoBalance + 1e-9 >= DEMO_FUNDS_CLAIM_MAX_BALANCE_INR) return;
  const now = new Date().toISOString();
  await dbRun(
    "UPDATE wallets SET demo_funds_claims_used = 0, demo_funds_last_claimed_date = NULL, updated_at = ? WHERE user_id = ?",
    [now, userId]
  );
}

async function readDemoFundsClaimBucket(userId: string): Promise<{ claimDay: string | null; claimsUsed: number }> {
  const today = getIstDateKey();
  const row = await dbGet<{
    demo_funds_last_claimed_date: string | null;
    demo_funds_claims_used: number | null;
  }>(
    "SELECT demo_funds_last_claimed_date, COALESCE(demo_funds_claims_used, 0) AS demo_funds_claims_used FROM wallets WHERE user_id = ?",
    [userId]
  );
  const storedDay = String(row?.demo_funds_last_claimed_date ?? "").trim() || null;
  if (storedDay !== today) {
    return { claimDay: null, claimsUsed: 0 };
  }
  return {
    claimDay: storedDay,
    claimsUsed: claimsUsedForIstDay(storedDay, today, Number(row?.demo_funds_claims_used ?? 0))
  };
}

async function getDemoFundsClaimsAllowedToday(userId: string): Promise<{
  directJoinedToday: number;
  claimsAllowed: number;
}> {
  const { countDirectReferralsJoinedToday } = await import("./authService");
  const directJoinedToday = await countDirectReferralsJoinedToday(userId);
  return { directJoinedToday, claimsAllowed: DEMO_FUNDS_BASE_CLAIMS_PER_DAY + directJoinedToday };
}

export async function getDemoFundsDailyStatus(userId: string): Promise<DemoFundsDailyStatus> {
  await initAppDb();
  await ensureWallet(userId);
  const today = getIstDateKey();
  const { directJoinedToday, claimsAllowed } = await getDemoFundsClaimsAllowedToday(userId);
  const row = await dbGet<{ demo_balance: number; demo_funds_last_claimed_date: string | null }>(
    "SELECT COALESCE(demo_balance, 0) AS demo_balance, demo_funds_last_claimed_date FROM wallets WHERE user_id = ?",
    [userId]
  );
  const demo = Number(row?.demo_balance ?? 0);
  await syncDemoFundsIstDayRollover(userId, demo, String(row?.demo_funds_last_claimed_date ?? "").trim() || null);
  const bucketAfterRollover = await readDemoFundsClaimBucket(userId);
  const claimsUsedAfterRollover = bucketAfterRollover.claimsUsed;
  const claimsRemaining = Math.max(0, claimsAllowed - claimsUsedAfterRollover);
  const canClaimToday = claimsRemaining > 0 && demo + 1e-9 < DEMO_FUNDS_CLAIM_MAX_BALANCE_INR;
  return {
    daily_amount_inr: DEFAULT_DEMO_BALANCE_INR,
    claims_allowed_today: claimsAllowed,
    claims_used_today: claimsUsedAfterRollover,
    claims_remaining_today: claimsRemaining,
    direct_joined_today: directJoinedToday,
    claimed_today: claimsRemaining <= 0,
    can_claim_today: canClaimToday,
    last_claimed_date: claimsUsedAfterRollover > 0 ? today : null
  };
}

/** Credit demo wallet — 1/day + 1 extra per direct referral joined today (IST). */
export async function claimDailyDemoFunds(userId: string): Promise<{
  demo_balance: number;
  added: number;
  claims_used_today: number;
  claims_allowed_today: number;
  claims_remaining_today: number;
}> {
  return enqueue(
    userId,
    async () => {
    await initAppDb();
    await ensureWallet(userId);
    const today = getIstDateKey();
    const { directJoinedToday, claimsAllowed } = await getDemoFundsClaimsAllowedToday(userId);
    const row = await dbGet<{
      demo_balance: number;
      demo_funds_last_claimed_date: string | null;
      demo_funds_claims_used: number | null;
      demo_hold_zero: number | null;
    }>(
      "SELECT COALESCE(demo_balance, 0) AS demo_balance, demo_funds_last_claimed_date, COALESCE(demo_funds_claims_used, 0) AS demo_funds_claims_used, COALESCE(demo_hold_zero, 0) AS demo_hold_zero FROM wallets WHERE user_id = ?",
      [userId]
    );
    const demo = Number(row?.demo_balance ?? 0);
    const storedDay = String(row?.demo_funds_last_claimed_date ?? "").trim() || null;
    await syncDemoFundsIstDayRollover(userId, demo, storedDay);
    const freshRow = await dbGet<{
      demo_funds_last_claimed_date: string | null;
      demo_funds_claims_used: number | null;
    }>(
      "SELECT demo_funds_last_claimed_date, COALESCE(demo_funds_claims_used, 0) AS demo_funds_claims_used FROM wallets WHERE user_id = ?",
      [userId]
    );
    const storedDayAfterRollover = String(freshRow?.demo_funds_last_claimed_date ?? "").trim();
    let claimsUsed = claimsUsedForIstDay(
      storedDayAfterRollover || null,
      today,
      Number(freshRow?.demo_funds_claims_used ?? 0)
    );
    if (claimsUsed >= claimsAllowed) {
      const atZero = demo + 1e-9 < DEMO_FUNDS_CLAIM_MAX_BALANCE_INR;
      throw new Error(
        atZero
          ? `Today's demo fund claim is used (${claimsUsed}/${claimsAllowed}). Balance is ₹0 — claim fresh demo funds tomorrow (IST). Each direct join today adds +1 extra claim.`
          : `Demo funds limit reached for today (${claimsUsed}/${claimsAllowed}). You get 1 claim plus 1 extra for each direct member who joins today (IST) — you have ${directJoinedToday} direct join(s) today. Use balance below ₹1 first, then try again tomorrow or invite more members.`
      );
    }
    if (demo + 1e-9 >= DEMO_FUNDS_CLAIM_MAX_BALANCE_INR) {
      throw new Error(
        `Use demo balance to ₹0 first. When balance is below ₹${DEMO_FUNDS_CLAIM_MAX_BALANCE_INR}, you can claim again (next IST day if today's claim is already used). Current: ₹${demo.toFixed(2)}.`
      );
    }
    const now = new Date().toISOString();
    const nextBalance = DEFAULT_DEMO_BALANCE_INR;
    claimsUsed += 1;
    await dbRun(
      "UPDATE wallets SET demo_balance = ?, demo_funds_last_claimed_date = ?, demo_funds_claims_used = ?, demo_hold_zero = 0, updated_at = ? WHERE user_id = ?",
      [nextBalance, today, claimsUsed, now, userId]
    );
    const { evictInMemoryAccountsForUser } = await import("./authService");
    evictInMemoryAccountsForUser(userId);
    return {
      demo_balance: nextBalance,
      added: nextBalance,
      claims_used_today: claimsUsed,
      claims_allowed_today: claimsAllowed,
      claims_remaining_today: Math.max(0, claimsAllowed - claimsUsed)
    };
  },
    "demo"
  );
}

export async function getDemoBalanceFromDb(userId: string): Promise<number> {
  await initAppDb();
  const row = await dbGet<{ demo_balance: number }>(
    "SELECT demo_balance FROM wallets WHERE user_id = ?",
    [userId]
  );
  const raw = Number(row?.demo_balance ?? DEFAULT_DEMO_BALANCE_INR);
  if (
    DEMO_MIGRATE_LEGACY_BALANCE &&
    Number.isFinite(raw) &&
    Math.abs(raw - LEGACY_DEMO_BALANCE_INR) < 0.01 &&
    Math.abs(DEFAULT_DEMO_BALANCE_INR - LEGACY_DEMO_BALANCE_INR) > 0.01
  ) {
    const now = new Date().toISOString();
    await dbRun("UPDATE wallets SET demo_balance = ?, updated_at = ? WHERE user_id = ?", [
      DEFAULT_DEMO_BALANCE_INR,
      now,
      userId
    ]);
    const { evictInMemoryAccountsForUser } = await import("./authService");
    evictInMemoryAccountsForUser(userId);
    return DEFAULT_DEMO_BALANCE_INR;
  }
  return raw;
}

/** How much of live `balance` is non-withdrawable (demo challenge rewards) vs profit/deposits. */
function nextLockedBonusInr(
  locked: number,
  afterBalance: number,
  delta: number,
  txnType: string
): number {
  let next = Number.isFinite(locked) ? locked : 0;
  if ((txnType === "demo_challenge_reward" || txnType === "demo") && delta > 0) {
    next += delta;
  } else if (delta < 0) {
    next = Math.max(0, next + delta);
  }
  next = Math.min(next, Math.max(0, afterBalance));
  return Number(next.toFixed(8));
}

async function applyLedgerMutationUnqueued(
  userId: string,
  delta: number,
  txnType: string,
  referenceId: string | null
): Promise<{ beforeBalance: number; afterBalance: number }> {
  await ensureWallet(userId);
  const now = new Date().toISOString();
  const txnId = `txn-${crypto.randomUUID()}`;

  if (isMysqlMode()) {
    const conn = await acquireMysqlConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        "SELECT balance, locked_bonus_inr FROM wallets WHERE user_id = ? FOR UPDATE",
        [userId]
      );
      const arr = rows as mysql.RowDataPacket[];
      const before = Number(arr[0]?.balance ?? 0);
      const lockedBefore = Number(arr[0]?.locked_bonus_inr ?? 0);
      const after = Number((before + delta).toFixed(8));
      if (after < -1e-12) {
        await conn.rollback();
        throw new Error("Insufficient balance");
      }
      const lockedAfter = nextLockedBonusInr(lockedBefore, after, delta, txnType);
      await conn.execute(
        "UPDATE wallets SET balance = ?, locked_bonus_inr = ?, updated_at = ? WHERE user_id = ?",
        [after, lockedAfter, now, userId]
      );
      await conn.execute(
        `INSERT INTO transactions (id, user_id, txn_type, amount, before_balance, after_balance, reference_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [txnId, userId, txnType, delta, before, after, referenceId, now]
      );
      await conn.commit();
      return { beforeBalance: before, afterBalance: after };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  const row = await dbGet<{ balance: number; locked_bonus_inr?: number }>(
    "SELECT balance, locked_bonus_inr FROM wallets WHERE user_id = ?",
    [userId]
  );
  const before = Number(row?.balance ?? 0);
  const lockedBefore = Number(row?.locked_bonus_inr ?? 0);
  const after = Number((before + delta).toFixed(8));
  if (after < -1e-12) {
    throw new Error("Insufficient balance");
  }
  const lockedAfter = nextLockedBonusInr(lockedBefore, after, delta, txnType);
  await dbRun("UPDATE wallets SET balance = ?, locked_bonus_inr = ?, updated_at = ? WHERE user_id = ?", [
    after,
    lockedAfter,
    now,
    userId
  ]);
  await dbRun(
    `INSERT INTO transactions (id, user_id, txn_type, amount, before_balance, after_balance, reference_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [txnId, userId, txnType, delta, before, after, referenceId, now]
  );
  return { beforeBalance: before, afterBalance: after };
}

export async function getBonusBalanceFromDb(userId: string): Promise<number> {
  await initAppDb();
  await ensureWallet(userId);
  const row = await dbGet<{
    bonus_balance_inr: number | null;
    demo_balance: number | null;
    demo_challenge_pending: number | null;
    demo_hold_zero: number | null;
  }>(
    "SELECT COALESCE(bonus_balance_inr, 0) AS bonus_balance_inr, COALESCE(demo_balance, 0) AS demo_balance, COALESCE(demo_challenge_pending, 0) AS demo_challenge_pending, COALESCE(demo_hold_zero, 0) AS demo_hold_zero FROM wallets WHERE user_id = ?",
    [userId]
  );
  const bonus = Number(row?.bonus_balance_inr ?? 0);
  const demo = Number(row?.demo_balance ?? 0);
  const pending = Number(row?.demo_challenge_pending ?? 0) === 1;
  const holdZero = Number(row?.demo_hold_zero ?? 0) === 1;
  const looksLikeLegacyDemoCopy =
    bonus > 0.009 &&
    demo > 0.009 &&
    Math.abs(bonus - demo) < 0.01 &&
    !pending &&
    !holdZero;
  if (looksLikeLegacyDemoCopy) {
    const now = new Date().toISOString();
    await dbRun("UPDATE wallets SET bonus_balance_inr = 0, updated_at = ? WHERE user_id = ?", [now, userId]);
    return 0;
  }
  return bonus;
}

/** Credit or debit bonus wallet coins (serialized per user). */
export async function applyBonusBalanceDelta(userId: string, delta: number): Promise<number> {
  return enqueue(
    userId,
    async () => {
    await initAppDb();
    await ensureWallet(userId);
    const row = await dbGet<{ bonus_balance_inr: number }>(
      "SELECT COALESCE(bonus_balance_inr, 0) AS bonus_balance_inr FROM wallets WHERE user_id = ?",
      [userId]
    );
    const before = Number(row?.bonus_balance_inr ?? 0);
    const after = Number((before + delta).toFixed(8));
    if (after < -1e-12) {
      throw new Error("Insufficient bonus balance");
    }
    const now = new Date().toISOString();
    await dbRun("UPDATE wallets SET bonus_balance_inr = ?, updated_at = ? WHERE user_id = ?", [after, now, userId]);
    const { evictInMemoryAccountsForUser } = await import("./authService");
    evictInMemoryAccountsForUser(userId);
    return after;
  },
    "bonus"
  );
}

export async function getWalletChallengeMeta(userId: string): Promise<{
  bonus_balance_inr: number;
  demo_challenge_pending: boolean;
  demo_funds_daily_inr: number;
  demo_funds_claimed_today: boolean;
  demo_funds_can_claim: boolean;
  demo_funds_claims_allowed?: number;
  demo_funds_claims_used?: number;
  demo_funds_claims_remaining?: number;
  demo_funds_direct_joined_today?: number;
}> {
  await initAppDb();
  await ensureWallet(userId);
  const row = await dbGet<{
    bonus_balance_inr: number | null;
    demo_challenge_pending: number | null;
  }>(
    "SELECT COALESCE(bonus_balance_inr, 0) AS bonus_balance_inr, COALESCE(demo_challenge_pending, 0) AS demo_challenge_pending FROM wallets WHERE user_id = ?",
    [userId]
  );
  const daily = await getDemoFundsDailyStatus(userId);
  return {
    bonus_balance_inr: Number(row?.bonus_balance_inr ?? 0),
    demo_challenge_pending: Number(row?.demo_challenge_pending ?? 0) === 1,
    demo_funds_daily_inr: daily.daily_amount_inr,
    demo_funds_claimed_today: daily.claimed_today,
    demo_funds_can_claim: daily.can_claim_today,
    demo_funds_claims_allowed: daily.claims_allowed_today,
    demo_funds_claims_used: daily.claims_used_today,
    demo_funds_claims_remaining: daily.claims_remaining_today,
    demo_funds_direct_joined_today: daily.direct_joined_today
  };
}

/**
 * Persists demo INR. At/above challenge target sets `demo_challenge_pending` (user redeems → bonus wallet).
 * Bust to ₹0 unless `demo_hold_zero` (after redeem). Daily demo funds via `claimDailyDemoFunds`.
 */
export async function saveDemoBalanceToDb(userId: string, demoBalance: number): Promise<number> {
  return enqueue(
    userId,
    async () => {
    await initAppDb();
    await ensureWallet(userId);
    let b = Number(demoBalance.toFixed(2));
    const now = new Date().toISOString();
    const holdRow = await dbGet<{ h: number }>(
      "SELECT COALESCE(demo_hold_zero, 0) AS h FROM wallets WHERE user_id = ?",
      [userId]
    );
    const holdZero = Number(holdRow?.h ?? 0) === 1;
    let demoHoldZeroOut = 0;

    if (b >= DEMO_CHALLENGE_TARGET_INR) {
      await dbRun("UPDATE wallets SET demo_challenge_pending = 1, updated_at = ? WHERE user_id = ?", [
        now,
        userId
      ]);
    }

    if (b <= 0) {
      if (holdZero) {
        b = 0;
        demoHoldZeroOut = 1;
      } else {
        b = 0;
      }
    }

    await dbRun(
      "UPDATE wallets SET demo_balance = ?, demo_hold_zero = ?, updated_at = ? WHERE user_id = ?",
      [b, demoHoldZeroOut, now, userId]
    );
    return b;
  },
    "demo"
  );
}

export async function saveBonusBalanceToDb(userId: string, bonusBalance: number): Promise<number> {
  return enqueue(
    userId,
    async () => {
    await initAppDb();
    await ensureWallet(userId);
    const b = Number(bonusBalance.toFixed(2));
    const now = new Date().toISOString();
    let nextBonus = b;
    if (b >= BONUS_TO_LIVE_THRESHOLD_INR) {
      await applyLedgerMutationUnqueued(
        userId,
        BONUS_TO_LIVE_REWARD_INR,
        BONUS_TO_LIVE_TRANSFER_TXN_TYPE,
        `bonus-balance-gte-${BONUS_TO_LIVE_THRESHOLD_INR}`
      );
      nextBonus = 0;
    }
    await dbRun("UPDATE wallets SET bonus_balance_inr = ?, updated_at = ? WHERE user_id = ?", [nextBonus, now, userId]);
    return nextBonus;
  },
    "bonus"
  );
}

/** Redeem demo challenge: ₹100 (config) to bonus wallet only while DB demo ≥ target (e.g. ₹1,00,000). */
export async function redeemDemoChallengeReward(userId: string): Promise<{
  bonus_balance_inr: number;
  demo_balance: number;
}> {
  return enqueue(
    userId,
    async () => {
    await initAppDb();
    await ensureWallet(userId);
    const reward = DEMO_CHALLENGE_REWARD_INR;
    if (reward <= 1e-9) {
      throw new Error("Challenge reward is disabled");
    }
    const now = new Date().toISOString();
    const target = DEMO_CHALLENGE_TARGET_INR;

    if (isMysqlMode()) {
      const conn = await acquireMysqlConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.execute(
          "SELECT COALESCE(demo_challenge_pending, 0) AS p, COALESCE(bonus_balance_inr, 0) AS bonus, COALESCE(demo_balance, 0) AS demo FROM wallets WHERE user_id = ? FOR UPDATE",
          [userId]
        );
        const arr = rows as mysql.RowDataPacket[];
        if (Number(arr[0]?.p ?? 0) !== 1) {
          await conn.rollback();
          throw new Error("No challenge reward to redeem");
        }
        const demoBal = Number(arr[0]?.demo ?? 0);
        if (demoBal + 1e-9 < target) {
          await conn.rollback();
          throw new Error(
            `Bonus reward unlocks only when demo balance reaches at least ₹${target.toLocaleString("en-IN")}. Grow demo again, then redeem.`
          );
        }
        const newBonus = Number(arr[0]?.bonus ?? 0) + reward;
        await conn.execute(
          `UPDATE wallets SET bonus_balance_inr = ?, demo_balance = 0, demo_challenge_pending = 0, demo_hold_zero = 1, updated_at = ? WHERE user_id = ?`,
          [newBonus, now, userId]
        );
        await conn.commit();
        const { evictInMemoryAccountsForUser } = await import("./authService");
        evictInMemoryAccountsForUser(userId);
        return { bonus_balance_inr: newBonus, demo_balance: 0 };
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }

    const row = await dbGet<{ p: number; bonus: number; demo: number }>(
      "SELECT COALESCE(demo_challenge_pending, 0) AS p, COALESCE(bonus_balance_inr, 0) AS bonus, COALESCE(demo_balance, 0) AS demo FROM wallets WHERE user_id = ?",
      [userId]
    );
    if (Number(row?.p ?? 0) !== 1) {
      throw new Error("No challenge reward to redeem");
    }
    const demoBal = Number(row?.demo ?? 0);
    if (demoBal + 1e-9 < target) {
      throw new Error(
        `Bonus reward unlocks only when demo balance reaches at least ₹${target.toLocaleString("en-IN")}. Grow demo again, then redeem.`
      );
    }
    const newBonus = Number(row?.bonus ?? 0) + reward;
    await dbRun(
      `UPDATE wallets SET bonus_balance_inr = ?, demo_balance = 0, demo_challenge_pending = 0, demo_hold_zero = 1, updated_at = ? WHERE user_id = ?`,
      [newBonus, now, userId]
    );
    const { evictInMemoryAccountsForUser } = await import("./authService");
    evictInMemoryAccountsForUser(userId);
    return { bonus_balance_inr: newBonus, demo_balance: 0 };
  },
    "demo"
  );
}

export async function getWalletBalance(userId: string): Promise<number> {
  await ensureWallet(userId);
  const row = await dbGet<{ balance: number }>("SELECT balance FROM wallets WHERE user_id = ?", [userId]);
  return Number(row?.balance ?? 0);
}

export async function getLiveWalletBreakdown(userId: string): Promise<{
  balance: number;
  locked_bonus_inr: number;
  withdrawable_inr: number;
}> {
  await ensureWallet(userId);
  const row = await dbGet<{ balance: number; locked_bonus_inr?: number }>(
    "SELECT balance, locked_bonus_inr FROM wallets WHERE user_id = ?",
    [userId]
  );
  const balance = Number(row?.balance ?? 0);
  const locked = Math.max(0, Number(row?.locked_bonus_inr ?? 0));
  const withdrawable_inr = Number(Math.max(0, balance - locked).toFixed(8));
  return { balance, locked_bonus_inr: locked, withdrawable_inr };
}

/**
 * Admin: set `wallets.balance` and/or `demo_balance` directly (no ledger transaction rows).
 * `canonicalUserId` must be the real `users.id` / `wallets.user_id`.
 */
export async function setWalletBalancesFromAdmin(
  canonicalUserId: string,
  body: { balance?: number; demo_balance?: number; locked_bonus_inr?: number }
): Promise<void> {
  if (body.balance === undefined && body.demo_balance === undefined && body.locked_bonus_inr === undefined) {
    throw new Error("Provide balance and/or demo_balance and/or locked_bonus_inr");
  }
  await ensureWallet(canonicalUserId);
  const cur = await dbGet<{ balance: number; demo_balance: number; locked_bonus_inr?: number }>(
    "SELECT balance, demo_balance, locked_bonus_inr FROM wallets WHERE user_id = ?",
    [canonicalUserId]
  );
  const newB = body.balance !== undefined ? Number(body.balance) : Number(cur?.balance ?? 0);
  const newD =
    body.demo_balance !== undefined ? Number(body.demo_balance) : Number(cur?.demo_balance ?? DEFAULT_DEMO_BALANCE_INR);
  const curLocked = Math.max(0, Number(cur?.locked_bonus_inr ?? 0));
  let newLocked =
    body.locked_bonus_inr !== undefined ? Number(body.locked_bonus_inr) : curLocked;
  if (!Number.isFinite(newB) || newB < 0) {
    throw new Error("Invalid live balance");
  }
  if (!Number.isFinite(newD) || newD < 0) {
    throw new Error("Invalid demo balance");
  }
  if (!Number.isFinite(newLocked) || newLocked < 0) {
    throw new Error("Invalid locked bonus");
  }
  newLocked = Math.min(newLocked, newB);
  const now = new Date().toISOString();
  await dbRun(
    "UPDATE wallets SET balance = ?, demo_balance = ?, locked_bonus_inr = ?, updated_at = ? WHERE user_id = ?",
    [newB, newD, newLocked, now, canonicalUserId]
  );
}

/**
 * Apply balance delta; logs transactions with before_balance / after_balance.
 */
export async function applyLedger(
  userId: string,
  delta: number,
  txnType: string,
  referenceId: string | null = null
): Promise<{ beforeBalance: number; afterBalance: number }> {
  return enqueue(
    userId,
    () => applyLedgerMutationUnqueued(userId, delta, txnType, referenceId),
    "live"
  );
}

export async function listTransactionsForUser(userId: string, limit = 100): Promise<TransactionRow[]> {
  await initAppDb();
  return dbAll<TransactionRow>(
    "SELECT id, user_id, txn_type, amount, before_balance, after_balance, reference_id, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, limit]
  );
}
