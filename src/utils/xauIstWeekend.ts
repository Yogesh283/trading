/**
 * XAU/USD only: spot-style retail gold is treated as closed Sat–Sun in IST (same rule as frontend `xauChartLock`).
 * Other forex pairs keep updating.
 */

const IST = "Asia/Kolkata";

export function isXauUsdSymbol(symbol: string): boolean {
  return symbol.trim().toUpperCase() === "XAUUSD";
}

/** Saturday or Sunday in Asia/Kolkata. */
export function isXauIstWeeklyLockWindow(nowMs: number = Date.now()): boolean {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: IST, weekday: "short" }).format(new Date(nowMs));
  return wd === "Sat" || wd === "Sun";
}
