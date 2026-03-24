/** Must match server default `INR_PER_USDT` (see `src/config/funds.ts`). */
export const INR_PER_USDT = 95;

/** Match `src/config/demo.ts` default for UI fallbacks before account loads. */
export const DEFAULT_DEMO_BALANCE_INR = 10_000;

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
