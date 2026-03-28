/**
 * XAU/USD: padlock when the chart feed is stale, or on the weekend when the
 * market is closed (Sat–Sun in IST).
 */

const IST = "Asia/Kolkata";

/** Stale feed: no tick/candle update for this long → treat as locked (weekdays). */
const STALE_MS = 15 * 60 * 1000;

export function isXauUsdSymbol(assetTag: string): boolean {
  const s = assetTag.trim().toUpperCase();
  return s === "XAUUSD" || s === "XAU/USD";
}

function istWeekdayShort(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: IST, weekday: "short" }).format(d);
}

/**
 * Weekend closure (Asia/Kolkata): Saturday and Sunday — chart shows locked.
 * Monday–Friday: not locked by this rule (stale-feed rule may still apply).
 */
export function isXauIstWeeklyLockWindow(now: Date = new Date()): boolean {
  const wd = istWeekdayShort(now);
  return wd === "Sat" || wd === "Sun";
}

/**
 * Show padlock when XAU is “off”: weekend (IST), or feed stale vs `lastActivityMs`.
 */
export function shouldShowXauMarketLock(assetTag: string, lastActivityMs: number, now: number = Date.now()): boolean {
  if (!isXauUsdSymbol(assetTag)) {
    return false;
  }
  if (isXauIstWeeklyLockWindow(new Date(now))) {
    return true;
  }
  if (lastActivityMs > 0 && now - lastActivityMs > STALE_MS) {
    return true;
  }
  return false;
}
