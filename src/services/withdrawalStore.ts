import crypto from "node:crypto";
import { dbAll, dbGet, dbRun, initAppDb } from "../db/appDb";

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

export async function listAllWithdrawals(): Promise<WithdrawalRow[]> {
  await ensureWithdrawalsReady();
  return dbAll<WithdrawalRow>("SELECT * FROM withdrawals ORDER BY created_at DESC");
}
