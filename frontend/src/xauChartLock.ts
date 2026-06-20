/**
 * OTC platform: Sat–Sun closed in IST (all pairs). XAU also locks on stale feed.
 */

const IST = "Asia/Kolkata";

/** Stale feed: no tick/candle update for this long → treat as locked (weekdays, XAU only). */
const STALE_MS = 15 * 60 * 1000;

export function isXauUsdSymbol(assetTag: string): boolean {
  const s = assetTag.trim().toUpperCase();
  return s === "XAUUSD" || s === "XAU/USD";
}

function istWeekdayShort(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: IST, weekday: "short" }).format(d);
}

/**
 * Weekend closure (Asia/Kolkata): Saturday and Sunday — all OTC markets off.
 * Monday–Friday: open (XAU stale-feed rule may still apply).
 */
export function isOtcWeekendLockWindow(now: Date = new Date()): boolean {
  const wd = istWeekdayShort(now);
  return wd === "Sat" || wd === "Sun";
}

/** @deprecated Use isOtcWeekendLockWindow — same rule, all OTC pairs. */
export function isXauIstWeeklyLockWindow(now: Date = new Date()): boolean {
  return isOtcWeekendLockWindow(now);
}

/**
 * Chart padlock: all pairs off on weekend (IST); XAU also when feed is stale.
 */
export function shouldShowMarketLock(
  assetTag: string,
  lastActivityMs: number,
  now: number = Date.now()
): boolean {
  if (isOtcWeekendLockWindow(new Date(now))) {
    return true;
  }
  if (isXauUsdSymbol(assetTag) && lastActivityMs > 0 && now - lastActivityMs > STALE_MS) {
    return true;
  }
  return false;
}

/** @deprecated Use shouldShowMarketLock */
export function shouldShowXauMarketLock(
  assetTag: string,
  lastActivityMs: number,
  now: number = Date.now()
): boolean {
  return shouldShowMarketLock(assetTag, lastActivityMs, now);
}
