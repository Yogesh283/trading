/** Nominal monthly yield on invested principal (e.g. 0.10 = 10% per month). */
export const INVESTMENT_MONTHLY_YIELD = 0.1;
/** Days used to spread monthly yield into daily cron payouts (10% / 30 ≈ 0.333% per day). */
export const INVESTMENT_YIELD_DAYS = 30;
/** Hours invested funds stay locked after each add before withdrawal allowed. */
export const INVESTMENT_LOCK_HOURS = 24;

export function dailyYieldFraction(): number {
  return INVESTMENT_MONTHLY_YIELD / INVESTMENT_YIELD_DAYS;
}
