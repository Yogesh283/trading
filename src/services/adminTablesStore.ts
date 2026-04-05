/**
 * Read-only admin lists for all app DB tables (no passwords).
 * Caps heavy tables so the admin UI stays responsive.
 */
import { dbAll, dbGet, initAppDb, isMysqlMode } from "../db/appDb";
import { logger } from "../utils/logger";
import { formatAdminMobile } from "../utils/adminMobile";
import { getDepositAdminRowById } from "./depositStore";
import { getWithdrawalAdminRowById } from "./withdrawalStore";

const TXN_CAP = 25_000;
const TICKS_CAP = 8_000;

function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("no such table") || msg.includes("doesn't exist") || msg.includes("Unknown table");
}

export async function listWalletsForAdmin(): Promise<Record<string, unknown>[]> {
  await initAppDb();
  const rows = await dbAll<{
    user_id: string;
    balance: number;
    demo_balance: number;
    updated_at: string;
    phone_country_code: string | null;
    phone_local: string | null;
  }>(
    `SELECT w.user_id, w.balance, w.demo_balance, w.updated_at,
            u.phone_country_code, u.phone_local
     FROM wallets w
     LEFT JOIN users u ON u.id = w.user_id
     ORDER BY w.updated_at DESC`
  );
  return rows.map((r) => ({
    id: r.user_id,
    user_id: r.user_id,
    balance: Number(r.balance),
    demo_balance: Number(r.demo_balance),
    updated_at: r.updated_at,
    user_mobile: formatAdminMobile(r.phone_country_code, r.phone_local)
  }));
}

export async function listTransactionsForAdmin(): Promise<Record<string, unknown>[]> {
  await initAppDb();
  try {
    const rows = await dbAll<{
      id: string;
      user_id: string;
      txn_type: string;
      amount: number;
      before_balance: number;
      after_balance: number;
      reference_id: string | null;
      created_at: string;
      phone_country_code: string | null;
      phone_local: string | null;
    }>(
      `SELECT t.id, t.user_id, t.txn_type, t.amount, t.before_balance, t.after_balance, t.reference_id, t.created_at,
              u.phone_country_code, u.phone_local
       FROM transactions t
       LEFT JOIN users u ON u.id = t.user_id
       ORDER BY t.created_at DESC LIMIT ?`,
      [TXN_CAP]
    );
    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      txn_type: r.txn_type,
      amount: Number(r.amount),
      before_balance: Number(r.before_balance),
      after_balance: Number(r.after_balance),
      reference_id: r.reference_id,
      created_at: r.created_at,
      user_mobile: formatAdminMobile(r.phone_country_code, r.phone_local)
    }));
  } catch (err) {
    if (isMissingTableError(err)) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "transactions table missing — admin list empty");
      return [];
    }
    throw err;
  }
}

/** React-Admin `getOne` / `getMany` single row: GET /api/admin/ra/:resource/:id */
export async function getAdminRaOne(
  resource: string,
  rawId: string
): Promise<Record<string, unknown> | null> {
  await initAppDb();
  const id = String(rawId ?? "").trim();
  if (!id) {
    return null;
  }

  const mysql = isMysqlMode();
  const trimUserId = mysql
    ? "TRIM(CAST(user_id AS CHAR)) = TRIM(?)"
    : "TRIM(CAST(user_id AS TEXT)) = TRIM(?)";

  switch (resource) {
    case "wallets": {
      const wTrim = trimUserId.replace(/user_id/g, "w.user_id");
      let row: {
        user_id: string | number;
        balance: number | string | null;
        demo_balance: number | string | null;
        updated_at: string;
        phone_country_code: string | null;
        phone_local: string | null;
      } | undefined;
      try {
        row = await dbGet(
          mysql
            ? `SELECT w.user_id, w.balance, w.demo_balance, w.updated_at, u.phone_country_code, u.phone_local
               FROM wallets w
               LEFT JOIN users u ON u.id = w.user_id
               WHERE w.user_id = ? OR ${wTrim} LIMIT 1`
            : `SELECT w.user_id, w.balance, w.demo_balance, w.updated_at, u.phone_country_code, u.phone_local
               FROM wallets w
               LEFT JOIN users u ON u.id = w.user_id
               WHERE w.user_id = ? OR ${wTrim}`,
          [id, id]
        );
      } catch (e) {
        if (isMissingTableError(e)) {
          return null;
        }
        throw e;
      }
      if (!row) {
        return null;
      }
      const uid = String(row.user_id).trim();
      return {
        id: uid,
        user_id: uid,
        balance: Number(row.balance),
        demo_balance: Number(row.demo_balance),
        updated_at: row.updated_at,
        user_mobile: formatAdminMobile(row.phone_country_code, row.phone_local)
      };
    }
    case "transactions": {
      const idSql = mysql
        ? `SELECT t.id, t.user_id, t.txn_type, t.amount, t.before_balance, t.after_balance, t.reference_id, t.created_at,
                  u.phone_country_code, u.phone_local
           FROM transactions t
           LEFT JOIN users u ON u.id = t.user_id
           WHERE t.id = ? OR TRIM(CAST(t.id AS CHAR)) = TRIM(?) LIMIT 1`
        : `SELECT t.id, t.user_id, t.txn_type, t.amount, t.before_balance, t.after_balance, t.reference_id, t.created_at,
                  u.phone_country_code, u.phone_local
           FROM transactions t
           LEFT JOIN users u ON u.id = t.user_id
           WHERE t.id = ? OR TRIM(CAST(t.id AS TEXT)) = TRIM(?)`;
      const row = await dbGet<{
        id: string;
        user_id: string;
        txn_type: string;
        amount: number | string | null;
        before_balance: number | string | null;
        after_balance: number | string | null;
        reference_id: string | null;
        created_at: string;
        phone_country_code: string | null;
        phone_local: string | null;
      }>(idSql, [id, id]);
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        user_id: row.user_id,
        txn_type: row.txn_type,
        amount: Number(row.amount),
        before_balance: Number(row.before_balance),
        after_balance: Number(row.after_balance),
        reference_id: row.reference_id,
        created_at: row.created_at,
        user_mobile: formatAdminMobile(row.phone_country_code, row.phone_local)
      };
    }
    case "deposits": {
      return getDepositAdminRowById(id);
    }
    case "withdrawals": {
      return getWithdrawalAdminRowById(id);
    }
    case "market_ticks": {
      const rows = await listMarketTicksForAdmin();
      return rows.find((r) => String(r.id) === id) ?? null;
    }
    case "support_tickets": {
      let row: {
        id: string;
        user_id: string;
        subject: string;
        body: string;
        status: string;
        created_at: string;
        user_name: string | null;
        user_email: string | null;
        user_phone_country_code: string | null;
        user_phone_local: string | null;
      } | undefined;
      const mysql = isMysqlMode();
      try {
        const sql = mysql
          ? `SELECT t.id, t.user_id, t.subject, t.body, t.status, t.created_at,
                    u.name AS user_name, u.email AS user_email,
                    u.phone_country_code AS user_phone_country_code, u.phone_local AS user_phone_local
             FROM support_tickets t
             LEFT JOIN users u ON u.id = t.user_id
             WHERE t.id = ? LIMIT 1`
          : `SELECT t.id, t.user_id, t.subject, t.body, t.status, t.created_at,
                    u.name AS user_name, u.email AS user_email,
                    u.phone_country_code AS user_phone_country_code, u.phone_local AS user_phone_local
             FROM support_tickets t
             LEFT JOIN users u ON u.id = t.user_id
             WHERE t.id = ?`;
        row = await dbGet(sql, [id]);
      } catch (e) {
        if (isMissingTableError(e)) {
          return null;
        }
        throw e;
      }
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        user_id: row.user_id,
        user_name: row.user_name ?? "—",
        user_email: row.user_email ?? "—",
        user_mobile: formatAdminMobile(row.user_phone_country_code, row.user_phone_local),
        subject: row.subject,
        body: row.body,
        status: row.status,
        created_at: row.created_at
      };
    }
    default:
      return null;
  }
}

const SUPPORT_TICKETS_ADMIN_CAP = 5_000;

export async function listSupportTicketsForAdmin(): Promise<Record<string, unknown>[]> {
  await initAppDb();
  try {
    const rows = await dbAll<{
      id: string;
      user_id: string;
      subject: string;
      body: string;
      status: string;
      created_at: string;
      user_name: string | null;
      user_email: string | null;
      user_phone_country_code: string | null;
      user_phone_local: string | null;
    }>(
      `SELECT t.id, t.user_id, t.subject, t.body, t.status, t.created_at,
              u.name AS user_name, u.email AS user_email,
              u.phone_country_code AS user_phone_country_code, u.phone_local AS user_phone_local
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.user_id
       ORDER BY t.created_at DESC
       LIMIT ?`,
      [SUPPORT_TICKETS_ADMIN_CAP]
    );
    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      user_name: r.user_name ?? "—",
      user_email: r.user_email ?? "—",
      user_mobile: formatAdminMobile(r.user_phone_country_code, r.user_phone_local),
      subject: r.subject,
      body: r.body,
      status: r.status,
      created_at: r.created_at
    }));
  } catch (err) {
    if (isMissingTableError(err)) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "support_tickets table missing — admin list empty"
      );
      return [];
    }
    throw err;
  }
}

export async function listMarketTicksForAdmin(): Promise<Record<string, unknown>[]> {
  await initAppDb();
  const rows = await dbAll<{ symbol: string; price: number; timestamp: number }>(
    "SELECT symbol, price, timestamp FROM market_ticks ORDER BY timestamp DESC LIMIT ?",
    [TICKS_CAP]
  );
  return rows.map((r, i) => ({
    id: `${r.symbol}-${r.timestamp}-${i}`,
    symbol: r.symbol,
    price: Number(r.price),
    timestamp: r.timestamp,
    /** ISO for display / sort in UI */
    tick_at: new Date(r.timestamp).toISOString()
  }));
}
