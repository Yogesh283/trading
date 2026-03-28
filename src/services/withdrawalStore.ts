import crypto from "node:crypto";
import { dbAll, dbGet, dbRun, initAppDb, isMysqlMode } from "../db/appDb";
import { formatAdminMobile } from "../utils/adminMobile";

export type WithdrawalStatus = "pending" | "processing" | "completed" | "rejected";

export interface WithdrawalRow {
  id: string;
  user_id: string;
  user_email: string;
  amount: number;
  to_address: string;
  status: WithdrawalStatus;
  created_at: string;
  updated_at: string;
}

export async function ensureWithdrawalsReady() {
  await initAppDb();
}

export async function createWithdrawal(input: {
  userId: string;
  userEmail: string;
  amount: number;
  toAddress: string;
}): Promise<WithdrawalRow> {
  await ensureWithdrawalsReady();
  const id = `wdr-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO withdrawals (id, user_id, user_email, amount, to_address, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [id, input.userId, input.userEmail, input.amount, input.toAddress.toLowerCase(), now, now]
  );
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
