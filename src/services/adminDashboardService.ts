import { dbGet, initAppDb } from "../db/appDb";

function num(v: unknown): number {
  if (v == null) {
    return 0;
  }
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type AdminDashboardStatsPayload = {
  usersCount: number;
  pendingDepositReviewCount: number;
  pendingDepositReviewUsdt: number;
  pendingWithdrawalsCount: number;
  totalLiveWalletInr: number;
  totalDemoWalletInr: number;
  investorsWithPrincipal: number;
  totalInvestmentPrincipalInr: number;
};

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

  return {
    usersCount: num(u?.c),
    pendingDepositReviewCount: num(pd?.c),
    pendingDepositReviewUsdt: num(pd?.s),
    pendingWithdrawalsCount: num(pw?.c),
    totalLiveWalletInr: num(w?.live),
    totalDemoWalletInr: num(w?.demo),
    investorsWithPrincipal: num(inv?.c),
    totalInvestmentPrincipalInr: num(inv?.p)
  };
}
