import crypto from "node:crypto";
import { dbAll, dbGet, dbRun, initAppDb } from "../db/appDb";

export type DepositStatus = "pending_wallet" | "tx_sent" | "credited";

export interface DepositRow {
  id: string;
  user_id: string;
  user_email: string;
  amount: number;
  wallet_provider: string;
  admin_to_address: string;
  token_contract: string;
  chain_id: number;
  from_address: string | null;
  tx_hash: string | null;
  status: DepositStatus;
  created_at: string;
  updated_at: string;
}

export async function ensureDepositsReady() {
  await initAppDb();
}

export async function createDepositIntent(input: {
  userId: string;
  userEmail: string;
  amount: number;
  walletProvider: string;
  adminToAddress: string;
  tokenContract: string;
  chainId: number;
}): Promise<DepositRow> {
  await ensureDepositsReady();
  const id = `dep-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO deposits (
      id, user_id, user_email, amount, wallet_provider, admin_to_address,
      token_contract, chain_id, from_address, tx_hash, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'pending_wallet', ?, ?)`,
    [
      id,
      input.userId,
      input.userEmail,
      input.amount,
      input.walletProvider,
      input.adminToAddress.toLowerCase(),
      input.tokenContract.toLowerCase(),
      input.chainId,
      now,
      now
    ]
  );
  const row = await dbGet<DepositRow>("SELECT * FROM deposits WHERE id = ?", [id]);
  if (!row) {
    throw new Error("Failed to create deposit");
  }
  return row;
}

export async function markDepositTxSent(input: {
  depositId: string;
  userId: string;
  txHash: string;
  fromAddress: string;
}): Promise<DepositRow | null> {
  await ensureDepositsReady();
  const now = new Date().toISOString();
  const { affectedRows } = await dbRun(
    `UPDATE deposits SET tx_hash = ?, from_address = ?, status = 'tx_sent', updated_at = ?
     WHERE id = ? AND user_id = ? AND status = 'pending_wallet'`,
    [input.txHash, input.fromAddress.toLowerCase(), now, input.depositId, input.userId]
  );
  if (affectedRows !== 1) {
    return null;
  }
  const row = await dbGet<DepositRow>("SELECT * FROM deposits WHERE id = ? AND user_id = ?", [
    input.depositId,
    input.userId
  ]);
  return row ?? null;
}

export async function listDepositsForUser(userId: string): Promise<DepositRow[]> {
  await ensureDepositsReady();
  return dbAll<DepositRow>(
    "SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC",
    [userId]
  );
}

export async function listAllDeposits(): Promise<DepositRow[]> {
  await ensureDepositsReady();
  return dbAll<DepositRow>("SELECT * FROM deposits ORDER BY created_at DESC");
}

export async function markDepositCredited(depositId: string) {
  await ensureDepositsReady();
  await dbRun(`UPDATE deposits SET status = 'credited', updated_at = ? WHERE id = ?`, [
    new Date().toISOString(),
    depositId
  ]);
}

/** Atomically mark tx_sent deposit as credited; returns amount for wallet credit. */
export async function finalizeDepositCredit(
  depositId: string,
  userId: string
): Promise<number | null> {
  await ensureDepositsReady();
  const row = await dbGet<DepositRow>(
    "SELECT * FROM deposits WHERE id = ? AND user_id = ?",
    [depositId, userId]
  );
  if (!row || row.status !== "tx_sent") {
    return null;
  }
  const now = new Date().toISOString();
  const { affectedRows } = await dbRun(
    `UPDATE deposits SET status = 'credited', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'tx_sent'`,
    [now, depositId, userId]
  );
  if (affectedRows !== 1) {
    return null;
  }
  return row.amount;
}
