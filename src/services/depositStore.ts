import crypto from "node:crypto";
import { dbAll, dbGet, dbRun, initAppDb } from "../db/appDb";

export type DepositStatus = "pending_wallet" | "pending_review" | "tx_sent" | "credited";

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

const SUBMIT_DEPOSIT_MIN_USDT = 1;
const SUBMIT_DEPOSIT_MAX_USDT = 1_000_000;

export async function markDepositTxSent(input: {
  depositId: string;
  userId: string;
  txHash: string;
  fromAddress: string;
  /** Declared USDT sent (optional; stored on row for admin credit). Must be within min/max when set. */
  amountUsdt?: number;
}): Promise<DepositRow | null> {
  await ensureDepositsReady();
  const now = new Date().toISOString();
  const claimed =
    input.amountUsdt != null &&
    Number.isFinite(input.amountUsdt) &&
    input.amountUsdt >= SUBMIT_DEPOSIT_MIN_USDT &&
    input.amountUsdt <= SUBMIT_DEPOSIT_MAX_USDT
      ? input.amountUsdt
      : null;

  const { affectedRows } = claimed != null
    ? await dbRun(
        `UPDATE deposits SET tx_hash = ?, from_address = ?, amount = ?, status = 'pending_review', updated_at = ?
         WHERE id = ? AND user_id = ? AND status = 'pending_wallet'`,
        [
          input.txHash,
          input.fromAddress.toLowerCase(),
          claimed,
          now,
          input.depositId,
          input.userId
        ]
      )
    : await dbRun(
        `UPDATE deposits SET tx_hash = ?, from_address = ?, status = 'pending_review', updated_at = ?
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

export async function getDepositById(id: string): Promise<DepositRow | null> {
  await ensureDepositsReady();
  const row = await dbGet<DepositRow>("SELECT * FROM deposits WHERE id = ?", [id]);
  return row ?? null;
}

/** Set `credited` only if still `pending_review` (after wallet ledger applied). */
export async function markDepositCreditedIfPendingReview(depositId: string): Promise<boolean> {
  await ensureDepositsReady();
  const now = new Date().toISOString();
  const { affectedRows } = await dbRun(
    `UPDATE deposits SET status = 'credited', updated_at = ? WHERE id = ? AND status = 'pending_review'`,
    [now, depositId]
  );
  return affectedRows === 1;
}
