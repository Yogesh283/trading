import crypto from "node:crypto";
import mysql from "mysql2/promise";
import {
  DEFAULT_DEMO_BALANCE_INR,
  DEMO_MIGRATE_LEGACY_BALANCE,
  LEGACY_DEMO_BALANCE_INR
} from "../config/demo";
import { DEMO_CHALLENGE_REWARD_INR, DEMO_CHALLENGE_TARGET_INR } from "../config/demoChallenge";
import { dbAll, dbGet, dbRun, getPool, initAppDb, isMysqlMode } from "../db/appDb";

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

function enqueue<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = userQueues.get(userId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => fn()) as Promise<T>;
  userQueues.set(userId, next);
  next.finally(() => {
    if (userQueues.get(userId) === next) userQueues.delete(userId);
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
  await dbRun(
    "INSERT INTO wallets (user_id, balance, demo_balance, locked_bonus_inr, updated_at) VALUES (?, 0, ?, 0, ?)",
    [userId, DEFAULT_DEMO_BALANCE_INR, now]
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
  if (txnType === "demo_challenge_reward" && delta > 0) {
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
    const pool = getPool();
    const conn = await pool.getConnection();
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

/** Persists demo INR; may apply challenge reward, or auto top-up when balance is zero. Returns final stored demo balance. */
export async function saveDemoBalanceToDb(userId: string, demoBalance: number): Promise<number> {
  return enqueue(userId, async () => {
    await initAppDb();
    await ensureWallet(userId);
    let b = Number(demoBalance.toFixed(2));
    let shouldEvict = false;
    if (b >= DEMO_CHALLENGE_TARGET_INR) {
      if (DEMO_CHALLENGE_REWARD_INR > 0) {
        await applyLedgerMutationUnqueued(
          userId,
          DEMO_CHALLENGE_REWARD_INR,
          "demo_challenge_reward",
          null
        );
      }
      b = DEFAULT_DEMO_BALANCE_INR;
      shouldEvict = true;
    } else if (b <= 0) {
      /** Busted to zero: auto set demo back to default starting balance (e.g. ₹10,000). */
      b = DEFAULT_DEMO_BALANCE_INR;
      shouldEvict = true;
    }
    if (shouldEvict) {
      const { evictInMemoryAccountsForUser } = await import("./authService");
      evictInMemoryAccountsForUser(userId);
    }
    const now = new Date().toISOString();
    await dbRun("UPDATE wallets SET demo_balance = ?, updated_at = ? WHERE user_id = ?", [b, now, userId]);
    return b;
  });
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
  return enqueue(userId, () =>
    applyLedgerMutationUnqueued(userId, delta, txnType, referenceId)
  );
}

export async function listTransactionsForUser(userId: string, limit = 100): Promise<TransactionRow[]> {
  await initAppDb();
  return dbAll<TransactionRow>(
    "SELECT id, user_id, txn_type, amount, before_balance, after_balance, reference_id, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, limit]
  );
}
