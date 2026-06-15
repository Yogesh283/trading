/** Bonus wallet on-chain payout: fixed coin ↔ USDT rate (not live-wallet INR rate). */
export const BONUS_COINS_PER_USDT = Math.max(
  1,
  Math.min(1e6, Number(process.env.BONUS_COINS_PER_USDT) || 200)
);

/** Minimum bonus-wallet withdrawal (USDT BEP20) — same floor as live (10 USDT). */
export const BONUS_MIN_WITHDRAWAL_USDT = Math.max(
  0.01,
  Math.min(1e6, Number(process.env.BONUS_MIN_WITHDRAWAL_USDT) || 10)
);

/** Minimum bonus coins for withdrawal (default 10 USDT × 200 coins/USDT = 2000). */
export const BONUS_MIN_WITHDRAWAL_COINS = Math.max(
  1,
  Math.min(
    1e12,
    Number(process.env.BONUS_MIN_WITHDRAWAL_COINS) || BONUS_MIN_WITHDRAWAL_USDT * BONUS_COINS_PER_USDT
  )
);

export function bonusCoinsForUsdtWithdraw(usdt: number): number {
  if (!Number.isFinite(usdt) || usdt <= 0) return 0;
  return Math.round(usdt * BONUS_COINS_PER_USDT * 100) / 100;
}

export function maxBonusUsdtWithdrawable(coins: number): number {
  if (!Number.isFinite(coins) || coins <= 0) return 0;
  return Math.floor((coins / BONUS_COINS_PER_USDT) * 100) / 100;
}
