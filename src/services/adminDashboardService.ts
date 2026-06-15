import { dbAll, dbGet, initAppDb } from "../db/appDb";
import { getIstDateKey } from "../utils/istDate";
import { logger } from "../utils/logger";

function num(v: unknown): number {
  if (v == null) {
    return 0;
  }
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("no such table") ||
    msg.includes("doesn't exist") ||
    msg.includes("Unknown table") ||
    msg.includes("ER_NO_SUCH_TABLE")
  );
}

/** Single numeric column `AS x` (MySQL/mysql2 may return `X`; SUM may be string). */
async function queryNum(sql: string, params: unknown[] = []): Promise<number> {
  try {
    const row = await dbGet<Record<string, unknown>>(sql, params);
    if (!row) {
      return 0;
    }
    const raw = row.x ?? row.X;
    return num(raw);
  } catch (e) {
    if (isMissingTableError(e)) {
      return 0;
    }
    logger.warn({ err: e }, "admin dashboard aggregate query failed");
    return 0;
  }
}

/** UTC midnight boundaries for “today”. */
function utcCalendarDayBoundsIso(): { startIso: string; endIso: string; dateLabel: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    dateLabel: start.toISOString().slice(0, 10)
  };
}

/** IST midnight → next midnight (matches app “aaj”). */
function istCalendarDayBoundsIso(): { startIso: string; endIso: string; dateLabel: string } {
  const dateLabel = getIstDateKey();
  const start = new Date(`${dateLabel}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString(), dateLabel };
}

export type WithdrawalDayReportRow = {
  date: string;
  submittedCount: number;
  submittedUsdt: number;
  completedCount: number;
  completedUsdt: number;
};

export type TodayUserActivityRow = {
  userId: string;
  loggedInToday: boolean;
  tradeCountToday: number;
};

export type AdminDashboardStatsPayload = {
  usersCount: number;
  pendingDepositReviewCount: number;
  pendingDepositReviewUsdt: number;
  pendingWithdrawalsCount: number;
  totalLiveWalletInr: number;
  totalDemoWalletInr: number;
  /** Distinct users with successful login today (UTC). */
  usersLoggedInTodayUtc: number;
  usersLoggedInTodayUtcDate: string;
  usersLoggedInTodayUtcIds: string[];
  usersLoggedInTodayUtcIdsTruncated: boolean;
  /** IST calendar day (YYYY-MM-DD). */
  todayIstDate: string;
  /** Users who logged in today (IST). */
  usersLoggedInTodayIst: number;
  usersLoggedInTodayIstIds: string[];
  usersLoggedInTodayIstIdsTruncated: boolean;
  /** Users with live-wallet binary activity today (IST) in `transactions`. */
  usersTradedTodayIst: number;
  usersTradedTodayIstIds: string[];
  usersTradedTodayIstIdsTruncated: boolean;
  /** Login + live-trade rows for admin table (IST). */
  todayUserActivity: TodayUserActivityRow[];
  todayUserActivityTruncated: boolean;
  totalDepositsCreditedUsdt: number;
  todayDepositsCreditedUsdt: number;
  totalWithdrawalsCompletedUsdt: number;
  todayWithdrawalsCompletedUsdt: number;
  todayCompanyBinaryGrossInr: number;
  todayCompanyReferralCostInr: number;
  todayCompanyNetProfitInr: number;
  withdrawalsLast7Days: WithdrawalDayReportRow[];
};

function utcDayBoundsWithOffset(dayOffset: number): { startIso: string; endIso: string; label: string } {
  const now = new Date();
  const base = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayOffset, 0, 0, 0, 0)
  );
  const next = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + 1, 0, 0, 0, 0));
  return {
    startIso: base.toISOString(),
    endIso: next.toISOString(),
    label: base.toISOString().slice(0, 10)
  };
}

const TODAY_ACTIVITY_CAP = 300;

async function getUsersLoggedInTodayIds(startIso: string, endIso: string): Promise<string[]> {
  try {
    const lim = String(TODAY_ACTIVITY_CAP);
    const rows = await dbAll<{ id: unknown }>(
      `SELECT id FROM users WHERE last_login_at IS NOT NULL AND last_login_at >= ? AND last_login_at < ? ORDER BY last_login_at DESC LIMIT ${lim}`,
      [startIso, endIso]
    );
    return (Array.isArray(rows) ? rows : [])
      .map((r) => String(r?.id ?? "").trim())
      .filter(Boolean);
  } catch (e) {
    logger.warn({ err: e }, "admin dashboard today's login user ids");
    return [];
  }
}

async function getUsersTradedTodayCounts(
  startIso: string,
  endIso: string
): Promise<Map<string, number>> {
  try {
    const lim = String(TODAY_ACTIVITY_CAP);
    const rows = await dbAll<{ user_id: unknown; c: unknown }>(
      `SELECT user_id, COUNT(*) AS c FROM transactions
       WHERE created_at >= ? AND created_at < ?
         AND txn_type IN ('binary_stake', 'binary_settle_win', 'binary_settle_loss')
       GROUP BY user_id
       ORDER BY c DESC
       LIMIT ${lim}`,
      [startIso, endIso]
    );
    const map = new Map<string, number>();
    for (const r of Array.isArray(rows) ? rows : []) {
      const uid = String(r?.user_id ?? "").trim();
      if (!uid) continue;
      map.set(uid, num(r?.c));
    }
    return map;
  } catch (e) {
    logger.warn({ err: e }, "admin dashboard today's trade user counts");
    return new Map();
  }
}

async function countDistinctTradersToday(startIso: string, endIso: string): Promise<number> {
  try {
    const row = await dbGet<{ c: unknown }>(
      `SELECT COUNT(DISTINCT user_id) AS c FROM transactions
       WHERE created_at >= ? AND created_at < ?
         AND txn_type IN ('binary_stake', 'binary_settle_win', 'binary_settle_loss')`,
      [startIso, endIso]
    );
    return num(row?.c);
  } catch (e) {
    logger.warn({ err: e }, "admin dashboard today's trader count");
    return 0;
  }
}

function buildTodayUserActivity(
  loginIds: string[],
  tradeCounts: Map<string, number>,
  loginTotal: number,
  tradeTotal: number
): { rows: TodayUserActivityRow[]; truncated: boolean } {
  const loginSet = new Set(loginIds);
  const ids = new Set<string>([...loginIds, ...tradeCounts.keys()]);
  const rows: TodayUserActivityRow[] = [...ids].map((userId) => ({
    userId,
    loggedInToday: loginSet.has(userId),
    tradeCountToday: tradeCounts.get(userId) ?? 0
  }));
  rows.sort((a, b) => {
    if (b.tradeCountToday !== a.tradeCountToday) {
      return b.tradeCountToday - a.tradeCountToday;
    }
    if (a.loggedInToday !== b.loggedInToday) {
      return a.loggedInToday ? -1 : 1;
    }
    return a.userId.localeCompare(b.userId, undefined, { numeric: true });
  });
  const capped = rows.slice(0, TODAY_ACTIVITY_CAP);
  const truncated =
    loginTotal > loginIds.length || tradeTotal > tradeCounts.size || rows.length > capped.length;
  return { rows: capped, truncated };
}

async function getWithdrawalsLast7DaysReport(): Promise<WithdrawalDayReportRow[]> {
  try {
    const out: WithdrawalDayReportRow[] = [];
    for (let i = 0; i < 7; i++) {
      const { startIso, endIso, label } = utcDayBoundsWithOffset(i);
      const sub = await dbGet<{ c: unknown; s: unknown }>(
        `SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS s FROM withdrawals WHERE created_at >= ? AND created_at < ?`,
        [startIso, endIso]
      );
      const comp = await dbGet<{ c: unknown; s: unknown }>(
        `SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS s FROM withdrawals WHERE status = 'completed' AND updated_at >= ? AND updated_at < ?`,
        [startIso, endIso]
      );
      out.push({
        date: label,
        submittedCount: num(sub?.c),
        submittedUsdt: Number(num(sub?.s).toFixed(6)),
        completedCount: num(comp?.c),
        completedUsdt: Number(num(comp?.s).toFixed(6))
      });
    }
    return out;
  } catch (e) {
    logger.warn({ err: e }, "admin withdrawals last-7-days report");
    return [];
  }
}

/** Single round-trip aggregates for admin home dashboard. */
export async function getAdminDashboardStats(): Promise<AdminDashboardStatsPayload> {
  await initAppDb();

  const u = await dbGet<{ c: unknown }>("SELECT COUNT(*) AS c FROM users");
  const pd = await dbGet<{ c: unknown; s: unknown }>(
    `SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS s FROM deposits WHERE status = 'pending_review'`
  );
  const pw = await dbGet<{ c: unknown }>(
    `SELECT COUNT(*) AS c FROM withdrawals WHERE status IN ('pending', 'processing')`
  );
  const w = await dbGet<{ live: unknown; demo: unknown }>(
    `SELECT COALESCE(SUM(balance), 0) AS live, COALESCE(SUM(demo_balance), 0) AS demo FROM wallets`
  );

  const { startIso, endIso, dateLabel } = utcCalendarDayBoundsIso();
  const logins = await dbGet<{ c: unknown }>(
    `SELECT COUNT(*) AS c FROM users WHERE last_login_at IS NOT NULL AND last_login_at >= ? AND last_login_at < ?`,
    [startIso, endIso]
  );

  const totalDepositsCreditedUsdt = await queryNum(
    `SELECT COALESCE(SUM(amount), 0) AS x FROM deposits WHERE status = 'credited'`
  );
  const todayDepositsCreditedUsdt = await queryNum(
    `SELECT COALESCE(SUM(amount), 0) AS x FROM deposits WHERE status = 'credited' AND updated_at >= ? AND updated_at < ?`,
    [startIso, endIso]
  );

  const totalWithdrawalsCompletedUsdt = Number(
    (
      await queryNum(
        `SELECT COALESCE(SUM(amount), 0) AS x FROM withdrawals WHERE LOWER(TRIM(COALESCE(status, ''))) = 'completed'`
      )
    ).toFixed(6)
  );
  const todayWithdrawalsCompletedUsdt = Number(
    (
      await queryNum(
        `SELECT COALESCE(SUM(amount), 0) AS x FROM withdrawals WHERE LOWER(TRIM(COALESCE(status, ''))) = 'completed' AND updated_at >= ? AND updated_at < ?`,
        [startIso, endIso]
      )
    ).toFixed(6)
  );

  const todayBinaryGross = await queryNum(
    `SELECT COALESCE(SUM(
        CASE
          WHEN w.txn_type = 'binary_settle_win' THEN ABS(s.amount) - w.amount
          ELSE ABS(s.amount)
        END
      ), 0) AS x
     FROM transactions w
     INNER JOIN transactions s
       ON s.reference_id = w.reference_id AND s.user_id = w.user_id AND s.txn_type = 'binary_stake'
     WHERE w.txn_type IN ('binary_settle_win', 'binary_settle_loss')
       AND w.created_at >= ? AND w.created_at < ?`,
    [startIso, endIso]
  );

  const todayReferral = await queryNum(
    `SELECT COALESCE(SUM(amount), 0) AS x FROM transactions
     WHERE txn_type IN ('level_income', 'level_income_staking', 'level_income_roi')
       AND created_at >= ? AND created_at < ?`,
    [startIso, endIso]
  );

  const netProfit = Number((todayBinaryGross - todayReferral).toFixed(4));
  const withdrawalsLast7Days = await getWithdrawalsLast7DaysReport();
  const usersLoggedInTodayUtcIds = await getUsersLoggedInTodayIds(startIso, endIso);
  const loginCount = num(logins?.c);
  const usersLoggedInTodayUtcIdsTruncated = loginCount > usersLoggedInTodayUtcIds.length;

  const ist = istCalendarDayBoundsIso();
  const usersLoggedInTodayIstIds = await getUsersLoggedInTodayIds(ist.startIso, ist.endIso);
  const istLogins = await dbGet<{ c: unknown }>(
    `SELECT COUNT(*) AS c FROM users WHERE last_login_at IS NOT NULL AND last_login_at >= ? AND last_login_at < ?`,
    [ist.startIso, ist.endIso]
  );
  const usersLoggedInTodayIst = num(istLogins?.c);
  const usersLoggedInTodayIstIdsTruncated = usersLoggedInTodayIst > usersLoggedInTodayIstIds.length;

  const tradeCountsIst = await getUsersTradedTodayCounts(ist.startIso, ist.endIso);
  const usersTradedTodayIst = await countDistinctTradersToday(ist.startIso, ist.endIso);
  const usersTradedTodayIstIds = [...tradeCountsIst.keys()];
  const usersTradedTodayIstIdsTruncated = usersTradedTodayIst > usersTradedTodayIstIds.length;
  const { rows: todayUserActivity, truncated: todayUserActivityTruncated } = buildTodayUserActivity(
    usersLoggedInTodayIstIds,
    tradeCountsIst,
    usersLoggedInTodayIst,
    usersTradedTodayIst
  );

  return {
    usersCount: num(u?.c),
    pendingDepositReviewCount: num(pd?.c),
    pendingDepositReviewUsdt: num(pd?.s),
    pendingWithdrawalsCount: num(pw?.c),
    totalLiveWalletInr: num(w?.live),
    totalDemoWalletInr: num(w?.demo),
    usersLoggedInTodayUtc: loginCount,
    usersLoggedInTodayUtcDate: dateLabel,
    usersLoggedInTodayUtcIds,
    usersLoggedInTodayUtcIdsTruncated,
    todayIstDate: ist.dateLabel,
    usersLoggedInTodayIst,
    usersLoggedInTodayIstIds,
    usersLoggedInTodayIstIdsTruncated,
    usersTradedTodayIst,
    usersTradedTodayIstIds,
    usersTradedTodayIstIdsTruncated,
    todayUserActivity,
    todayUserActivityTruncated,
    totalDepositsCreditedUsdt,
    todayDepositsCreditedUsdt,
    totalWithdrawalsCompletedUsdt,
    todayWithdrawalsCompletedUsdt,
    todayCompanyBinaryGrossInr: todayBinaryGross,
    todayCompanyReferralCostInr: todayReferral,
    todayCompanyNetProfitInr: netProfit,
    withdrawalsLast7Days
  };
}
