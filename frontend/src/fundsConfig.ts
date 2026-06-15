/** Must match server `INR_PER_USDT` and `MIN_WITHDRAWAL_USDT` (see `src/config/funds.ts`). */
export const INR_PER_USDT = 100;
export const MIN_WITHDRAWAL_USDT = 10;

/**
 * Match server `DEMO_ACCOUNT_DEFAULT_INR` / `DEMO_START_BALANCE` (`src/config/demo.ts`).
 * Optional: set `VITE_DEMO_ACCOUNT_DEFAULT_INR` in `frontend/.env` so labels match your server.
 */
const viteDemo = Number(import.meta.env.VITE_DEMO_ACCOUNT_DEFAULT_INR);
export const DEFAULT_DEMO_BALANCE_INR =
  Number.isFinite(viteDemo) && viteDemo >= 0 ? Math.min(viteDemo, 1e12) : 10_000;

export function formatInr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(n);
}

export function previewInrFromUsdt(usdt: number, inrPerUsdt = INR_PER_USDT): number {
  if (!Number.isFinite(usdt) || usdt <= 0) return 0;
  return Math.round(usdt * inrPerUsdt * 100) / 100;
}

/** Match server `src/config/bonusWithdrawal.ts` — bonus wallet payout rate. */
export const BONUS_COINS_PER_USDT = 200;
export const BONUS_MIN_WITHDRAW_USDT = MIN_WITHDRAWAL_USDT;
export const BONUS_MIN_WITHDRAW_COINS = BONUS_MIN_WITHDRAW_USDT * BONUS_COINS_PER_USDT;

export function formatCoins(n: number): string {
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)} coins`;
}

export function previewBonusCoinsFromUsdt(usdt: number): number {
  if (!Number.isFinite(usdt) || usdt <= 0) return 0;
  return Math.round(usdt * BONUS_COINS_PER_USDT * 100) / 100;
}
