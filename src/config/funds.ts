/** Live wallet credits / debits: 1 USDT on-chain ↔ this many INR in app balance. */
export const INR_PER_USDT = Math.max(1, Math.min(50_000, Number(process.env.INR_PER_USDT) || 95));

export function usdtToInrCredit(usdt: number): number {
  if (!Number.isFinite(usdt) || usdt <= 0) return 0;
  return Math.round(usdt * INR_PER_USDT * 100) / 100;
}

/** INR to deduct from wallet when user requests `usdt` USDT withdrawal. */
export function inrDebitForUsdtWithdraw(usdt: number): number {
  return usdtToInrCredit(usdt);
}
