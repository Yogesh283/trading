import { dbAll, dbGet, initAppDb, isMysqlMode } from "../db/appDb";
import { formatAdminMobile } from "../utils/adminMobile";
import { getUserForAdminById, type AdminUserDetailRow } from "./authService";

export type UserSearchHit = { id: string; name: string; email: string; user_mobile: string };

export async function searchUsersForAdmin(query: string): Promise<UserSearchHit[]> {
  const q = String(query ?? "").trim();
  if (q.length < 1) {
    return [];
  }
  await initAppDb();
  const like = `%${q.toLowerCase()}%`;
  const sql = isMysqlMode()
    ? `SELECT id, name, email, phone_country_code, phone_local FROM users
       WHERE LOWER(email) LIKE ? OR LOWER(name) LIKE ? OR LOWER(CAST(id AS CHAR)) LIKE ?
       OR LOWER(CONCAT(COALESCE(phone_country_code,''), COALESCE(phone_local,''))) LIKE ?
       ORDER BY created_at DESC
       LIMIT 25`
    : `SELECT id, name, email, phone_country_code, phone_local FROM users
       WHERE LOWER(email) LIKE ? OR LOWER(name) LIKE ? OR LOWER(CAST(id AS TEXT)) LIKE ?
       OR LOWER(COALESCE(phone_country_code,'') || COALESCE(phone_local,'')) LIKE ?
       ORDER BY created_at DESC
       LIMIT 25`;
  const rows = await dbAll<{
    id: string;
    name: string;
    email: string;
    phone_country_code: string | null;
    phone_local: string | null;
  }>(sql, [like, like, like, like]);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    user_mobile: formatAdminMobile(r.phone_country_code, r.phone_local)
  }));
}

export interface TxnTypeAggregate {
  txn_type: string;
  total: number;
  count: number;
}

export interface WithdrawalStatusAggregate {
  status: string;
  totalUsdt: number;
  count: number;
}

export interface AdminUserInsights {
  user: AdminUserDetailRow;
  deposits: {
    totalCreditedUsdt: number;
    countCredited: number;
    recent: { id: string; amount: number; status: string; created_at: string }[];
  };
  withdrawals: {
    byStatus: WithdrawalStatusAggregate[];
    recent: { id: string; amount: number; status: string; created_at: string }[];
  };
  ledger: {
    byType: TxnTypeAggregate[];
    /** Net live binary PnL (sum of binary_* ledger amounts, INR). */
    binaryNetInr: number;
    totalLevelIncomeInr: number;
    totalBinaryWinsInr: number;
    totalBinaryStakesInr: number;
    recent: {
      id: string;
      txn_type: string;
      amount: number;
      reference_id: string | null;
      created_at: string;
    }[];
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getAdminUserInsights(userIdOrSearch: string): Promise<AdminUserInsights | null> {
  const raw = String(userIdOrSearch ?? "").trim();
  if (!raw) {
    return null;
  }

  await initAppDb();
  const user = await getUserForAdminById(raw);
  if (!user) {
    return null;
  }

  const uid = String(user.id).trim();

  const depRow = await dbGet<{ s: number | string | null; c: number | string | null }>(
    `SELECT COALESCE(SUM(amount), 0) AS s, COUNT(*) AS c FROM deposits WHERE user_id = ? AND status = 'credited'`,
    [uid]
  );

  const depRecent = await dbAll<{ id: string; amount: number; status: string; created_at: string }>(
    `SELECT id, amount, status, created_at FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 40`,
    [uid]
  );

  const wByStatus = await dbAll<{ status: string; s: number | string | null; c: number | string | null }>(
    `SELECT status, COALESCE(SUM(amount), 0) AS s, COUNT(*) AS c FROM withdrawals WHERE user_id = ? GROUP BY status`,
    [uid]
  );

  const wRecent = await dbAll<{ id: string; amount: number; status: string; created_at: string }>(
    `SELECT id, amount, status, created_at FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 40`,
    [uid]
  );

  const txAggRows = await dbAll<{ txn_type: string; total: number | string | null; cnt: number | string | null }>(
    `SELECT txn_type, SUM(amount) AS total, COUNT(*) AS cnt FROM transactions WHERE user_id = ? GROUP BY txn_type`,
    [uid]
  );

  const recentTx = await dbAll<{
    id: string;
    txn_type: string;
    amount: number | string | null;
    reference_id: string | null;
    created_at: string;
  }>(
    `SELECT id, txn_type, amount, reference_id, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 120`,
    [uid]
  );

  const byType: TxnTypeAggregate[] = txAggRows.map((r) => ({
    txn_type: r.txn_type,
    total: num(r.total),
    count: Math.floor(num(r.cnt))
  }));

  const mapType = (t: string) => byType.find((x) => x.txn_type === t)?.total ?? 0;

  const binaryTypes = [
    "binary_stake",
    "binary_stake_reversal",
    "binary_settle_win",
    "binary_settle_loss"
  ];
  let binaryNetInr = 0;
  for (const t of binaryTypes) {
    binaryNetInr += mapType(t);
  }

  return {
    user,
    deposits: {
      totalCreditedUsdt: num(depRow?.s),
      countCredited: Math.floor(num(depRow?.c)),
      recent: depRecent
    },
    withdrawals: {
      byStatus: wByStatus.map((r) => ({
        status: r.status,
        totalUsdt: num(r.s),
        count: Math.floor(num(r.c))
      })),
      recent: wRecent
    },
    ledger: {
      byType,
      binaryNetInr,
      totalLevelIncomeInr: mapType("level_income"),
      totalBinaryWinsInr: mapType("binary_settle_win"),
      totalBinaryStakesInr: mapType("binary_stake"),
      recent: recentTx.map((r) => ({
        id: String(r.id),
        txn_type: r.txn_type,
        amount: num(r.amount),
        reference_id: r.reference_id,
        created_at: r.created_at
      }))
    }
  };
}
