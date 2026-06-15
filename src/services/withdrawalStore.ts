import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { dbAll, dbGet, dbRun, acquireMysqlConnection, initAppDb, isMysqlMode } from "../db/appDb";
import { formatAdminMobile } from "../utils/adminMobile";
import { evictInMemoryAccountsForUser } from "./authService";

export type WithdrawalStatus = "pending" | "processing" | "completed" | "rejected";

export type WithdrawalWalletSource = "live" | "bonus";

export interface WithdrawalRow {
  id: string;
  user_id: string;
  user_email: string;
  amount: number;
  to_address: string;
  source_wallet: WithdrawalWalletSource;
  status: WithdrawalStatus;
  created_at: string;
  updated_at: string;
}

export async function ensureWithdrawalsReady() {
  await initAppDb();
}

export async function getWithdrawalById(id: string): Promise<WithdrawalRow | null> {
  await ensureWithdrawalsReady();
  const lim = isMysqlMode() ? " LIMIT 1" : "";
  return (
    (await dbGet<WithdrawalRow>(`SELECT * FROM withdrawals WHERE id = ?${lim}`, [String(id).trim()])) ?? null
  );
}

export async function createWithdrawal(input: {
  userId: string;
  userEmail: string;
  amount: number;
  toAddress: string;
  sourceWallet?: WithdrawalWalletSource;
}): Promise<WithdrawalRow> {
  await ensureWithdrawalsReady();
  const id = `wdr-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const source = input.sourceWallet === "bonus" ? "bonus" : "live";
  await dbRun(
    `INSERT INTO withdrawals (id, user_id, user_email, amount, to_address, source_wallet, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [id, input.userId, input.userEmail, input.amount, input.toAddress.toLowerCase(), source, now, now]
  );
  const row = await dbGet<WithdrawalRow>("SELECT * FROM withdrawals WHERE id = ?", [id]);
  if (!row) {
    throw new Error("Failed to create withdrawal");
  }
  return row;
}

/** Debit bonus coins + insert withdrawal row in one short DB transaction (no wallet queue — avoids pool/queue stalls). */
export async function createBonusWithdrawalAtomic(input: {
  userId: string;
  userEmail: string;
  amount: number;
  toAddress: string;
  coinsHold: number;
}): Promise<WithdrawalRow> {
  await ensureWithdrawalsReady();
  const id = `wdr-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const addr = input.toAddress.toLowerCase();
  const coins = Number(input.coinsHold.toFixed(8));

  if (isMysqlMode()) {
    const conn = await acquireMysqlConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        "SELECT COALESCE(bonus_balance_inr, 0) AS b FROM wallets WHERE user_id = ? FOR UPDATE",
        [input.userId]
      );
      const before = Number((rows as mysql.RowDataPacket[])[0]?.b ?? 0);
      if (before + 1e-9 < coins) {
        throw new Error(
          `Insufficient bonus balance — need ${coins.toFixed(2)} coins for ${input.amount} USDT; you have ${before.toFixed(2)} coins.`
        );
      }
      const after = Number((before - coins).toFixed(8));
      await conn.execute("UPDATE wallets SET bonus_balance_inr = ?, updated_at = ? WHERE user_id = ?", [
        after,
        now,
        input.userId
      ]);
      await conn.execute(
        `INSERT INTO withdrawals (id, user_id, user_email, amount, to_address, source_wallet, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'bonus', 'pending', ?, ?)`,
        [id, input.userId, input.userEmail, input.amount, addr, now, now]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback().catch(() => undefined);
      throw e;
    } finally {
      conn.release();
    }
  } else {
    const upd = await dbRun(
      `UPDATE wallets SET bonus_balance_inr = bonus_balance_inr - ?, updated_at = ?
       WHERE user_id = ? AND bonus_balance_inr + 1e-9 >= ?`,
      [coins, now, input.userId, coins]
    );
    if (upd.affectedRows === 0) {
      const row = await dbGet<{ b: number }>(
        "SELECT COALESCE(bonus_balance_inr, 0) AS b FROM wallets WHERE user_id = ?",
        [input.userId]
      );
      const have = Number(row?.b ?? 0);
      throw new Error(
        `Insufficient bonus balance — need ${coins.toFixed(2)} coins for ${input.amount} USDT; you have ${have.toFixed(2)} coins.`
      );
    }
    await dbRun(
      `INSERT INTO withdrawals (id, user_id, user_email, amount, to_address, source_wallet, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'bonus', 'pending', ?, ?)`,
      [id, input.userId, input.userEmail, input.amount, addr, now, now]
    );
  }

  evictInMemoryAccountsForUser(input.userId);
  const row = await dbGet<WithdrawalRow>("SELECT * FROM withdrawals WHERE id = ?", [id]);
  if (!row) {
    throw new Error("Failed to create withdrawal");
  }
  return row;
}

export async function listWithdrawalsForUser(userId: string): Promise<WithdrawalRow[]> {
  await ensureWithdrawalsReady();
  return dbAll<WithdrawalRow>(
    "SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC",
    [userId]
  );
}

export async function listAllWithdrawals(): Promise<Record<string, unknown>[]> {
  await ensureWithdrawalsReady();
  const rows = await dbAll<
    WithdrawalRow & { user_phone_country_code: string | null; user_phone_local: string | null }
  >(
    `SELECT w.*, u.phone_country_code AS user_phone_country_code, u.phone_local AS user_phone_local
     FROM withdrawals w
     LEFT JOIN users u ON u.id = w.user_id
     ORDER BY w.created_at DESC`
  );
  return rows.map((r) => {
    const { user_phone_country_code, user_phone_local, ...rest } = r;
    return {
      ...rest,
      user_phone_country_code,
      user_phone_local,
      user_mobile: formatAdminMobile(user_phone_country_code, user_phone_local)
    };
  });
}

/** Admin getOne — includes user mobile from `users`. */
export async function getWithdrawalAdminRowById(id: string): Promise<Record<string, unknown> | null> {
  await ensureWithdrawalsReady();
  const lim = isMysqlMode() ? " LIMIT 1" : "";
  const row = await dbGet<
    WithdrawalRow & { user_phone_country_code: string | null; user_phone_local: string | null }
  >(
    `SELECT w.*, u.phone_country_code AS user_phone_country_code, u.phone_local AS user_phone_local
     FROM withdrawals w
     LEFT JOIN users u ON u.id = w.user_id
     WHERE w.id = ?${lim}`,
    [id]
  );
  if (!row) {
    return null;
  }
  const { user_phone_country_code, user_phone_local, ...rest } = row;
  return {
    ...rest,
    user_phone_country_code,
    user_phone_local,
    user_mobile: formatAdminMobile(user_phone_country_code, user_phone_local)
  };
}
