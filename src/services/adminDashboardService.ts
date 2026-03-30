import { dbGet, initAppDb } from "../db/appDb";
import { logger } from "../utils/logger";

function num(v: unknown): number {
  if (v == null) {
    return 0;
  }
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMissingTransactionsTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("no such table") || msg.includes("doesn't exist") || msg.includes("Unknown table");
}

async function queryNum(sql: string, params: unknown[] = []): Promise<number> {
  try {
    const row = await dbGet<{ x: unknown }>(sql, params);
    return num(row?.x);
  } catch (e) {
    if (isMissingTransactionsTable(e)) {
      return 0;
    }
    logger.warn({ err: e }, "admin dashboard aggregate query failed");
    return 0;
  }
}

/** UTC midnight boundaries for “today” (same idea as daily investment yield). */
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

export type WithdrawalDayReportRow = {
  date: string;
  submittedCount: number;
  submittedUsdt: number;
  completedCount: number;
  completedUsdt: number;
};

export type AdminDashboardStatsPayload = {
  usersCount: number;
  pendingDepositReviewCount: number;
  pendingDepositReviewUsdt: number;
  pendingWithdrawalsCount: number;
  totalLiveWalletInr: number;
  totalDemoWalletInr: number;
  investorsWithPrincipal: number;
  totalInvestmentPrincipalInr: number;
  /** Distinct users table rows with `last_login_at` in today’s UTC window (successful logins only). */
  usersLoggedInTodayUtc: number;
  /** YYYY-MM-DD (UTC) for the window above. */
  usersLoggedInTodayUtcDate: string;
  /** All-time USDT credited (deposits row `amount`, status `credited`). */
  totalDepositsCreditedUsdt: number;
  /** USDT credited today (UTC): `updated_at` when status became credited. */
  todayDepositsCreditedUsdt: number;
  /** All-time USDT paid out (withdrawals `amount`, status `completed`). */
  totalWithdrawalsCompletedUsdt: number;
  /** USDT completed today (UTC): `updated_at` when marked completed. */
  todayWithdrawalsCompletedUsdt: number;
  /**
   * Live binary settled today (UTC): per trade, stake kept minus win payout (INR ledger).
   * Loss: full stake; win: stake minus payout (often negative when win multiplier exceeds 1).
   */
  todayCompanyBinaryGrossInr: number;
  /** Referral / level income paid today (UTC), INR — company cost. */
  todayCompanyReferralCostInr: number;
  /** Binary gross minus referral cost (rough P/L; excludes withdrawals, investment yield, etc.). */
  todayCompanyNetProfitInr: number;
  /** UTC calendar days, newest first: submitted = new requests that day; completed = marked completed that day. */
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
  const inv = await dbGet<{ c: unknown; p: unknown }>(
    `SELECT COUNT(*) AS c, COALESCE(SUM(principal), 0) AS p FROM user_investments WHERE principal > 0.0000001`
  );

  const { startIso, endIso, dateLabel } = utcCalendarDayBoundsIso();
  const logins = await dbGet<{ c: unknown }>(
    `SELECT COUNT(*) AS c FROM users WHERE last_login_at IS NOT NULL AND last_login_at >= ? AND last_login_at < ?`,
    [startIso, endIso]
  );

  const totalDep = await dbGet<{ s: unknown }>(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM deposits WHERE status = 'credited'`
  );
  const todayDep = await dbGet<{ s: unknown }>(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM deposits WHERE status = 'credited' AND updated_at >= ? AND updated_at < ?`,
    [startIso, endIso]
  );

  let totalWithdrawalsCompletedUsdt = 0;
  let todayWithdrawalsCompletedUsdt = 0;
  try {
    const totalW = await dbGet<{ s: unknown }>(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM withdrawals WHERE status = 'completed'`
    );
    const todayW = await dbGet<{ s: unknown }>(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM withdrawals WHERE status = 'completed' AND updated_at >= ? AND updated_at < ?`,
      [startIso, endIso]
    );
    totalWithdrawalsCompletedUsdt = Number(num(totalW?.s).toFixed(6));
    todayWithdrawalsCompletedUsdt = Number(num(todayW?.s).toFixed(6));
  } catch (e) {
    logger.warn({ err: e }, "admin withdrawal USDT totals");
  }

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

  return {
    usersCount: num(u?.c),
    pendingDepositReviewCount: num(pd?.c),
    pendingDepositReviewUsdt: num(pd?.s),
    pendingWithdrawalsCount: num(pw?.c),
    totalLiveWalletInr: num(w?.live),
    totalDemoWalletInr: num(w?.demo),
    investorsWithPrincipal: num(inv?.c),
    totalInvestmentPrincipalInr: num(inv?.p),
    usersLoggedInTodayUtc: num(logins?.c),
    usersLoggedInTodayUtcDate: dateLabel,
    totalDepositsCreditedUsdt: num(totalDep?.s),
    todayDepositsCreditedUsdt: num(todayDep?.s),
    totalWithdrawalsCompletedUsdt,
    todayWithdrawalsCompletedUsdt,
    todayCompanyBinaryGrossInr: todayBinaryGross,
    todayCompanyReferralCostInr: todayReferral,
    todayCompanyNetProfitInr: netProfit,
    withdrawalsLast7Days
  };
}
