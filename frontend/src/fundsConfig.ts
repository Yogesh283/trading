/** Must match server default `INR_PER_USDT` (see `src/config/funds.ts`). */
export const INR_PER_USDT = 100;

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

export function previewInrFromUsdt(usdt: number): number {
  if (!Number.isFinite(usdt) || usdt <= 0) return 0;
  return Math.round(usdt * INR_PER_USDT * 100) / 100;
}
