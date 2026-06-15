/** Live wallet credits / debits: 1 USDT on-chain ↔ this many INR in app balance. */
export const INR_PER_USDT = Math.max(1, Math.min(50_000, Number(process.env.INR_PER_USDT) || 100));

/** Minimum live-wallet withdrawal payout (USDT BEP20). */
export const MIN_WITHDRAWAL_USDT = Math.max(
  0.01,
  Math.min(1e6, Number(process.env.MIN_WITHDRAWAL_USDT) || 10)
);

/** Deducted from live wallet (INR) per chart AI insight request (`POST /api/ai/explain-signal`). */
export const AI_CHART_INSIGHT_FEE_INR = Math.max(
  0,
  Math.min(10_000, Number(process.env.AI_CHART_INSIGHT_FEE_INR) || 1)
);

export function usdtToInrCredit(usdt: number): number {
  if (!Number.isFinite(usdt) || usdt <= 0) return 0;
  return Math.round(usdt * INR_PER_USDT * 100) / 100;
}

/** INR to deduct from wallet when user requests `usdt` USDT withdrawal. */
export function inrDebitForUsdtWithdraw(usdt: number): number {
  return usdtToInrCredit(usdt);
}
