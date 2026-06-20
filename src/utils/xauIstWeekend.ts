/**
 * OTC platform: spot-style retail gold was XAU-only; now all pairs closed Sat–Sun IST.
 */

const IST = "Asia/Kolkata";

export function isXauUsdSymbol(symbol: string): boolean {
  return symbol.trim().toUpperCase() === "XAUUSD";
}

/** Saturday or Sunday in Asia/Kolkata — all OTC pairs off. */
export function isOtcWeekendLockWindow(nowMs: number = Date.now()): boolean {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: IST, weekday: "short" }).format(new Date(nowMs));
  return wd === "Sat" || wd === "Sun";
}

/** @deprecated Use isOtcWeekendLockWindow */
export function isXauIstWeeklyLockWindow(nowMs: number = Date.now()): boolean {
  return isOtcWeekendLockWindow(nowMs);
}
