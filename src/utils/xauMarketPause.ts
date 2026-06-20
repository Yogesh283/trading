import { isOtcWeekendLockWindow, isXauUsdSymbol } from "./xauIstWeekend";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
/** Weekday stale feed: no tick for this long → treat as locked (XAU only). */
export const XAU_STALE_MS = 15 * 60 * 1000;

function istParts(nowMs: number): { y: number; m: number; d: number; wd: number } {
  const t = new Date(nowMs + IST_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    wd: t.getUTCDay()
  };
}

function istWallToUtcMs(y: number, m: number, d: number, h = 0, min = 0, sec = 0): number {
  return Date.UTC(y, m - 1, d, h, min, sec) - IST_OFFSET_MS;
}

/** Saturday 00:00 IST … Monday 00:00 IST for the weekend containing `nowMs` (Sat/Sun IST only). */
export function otcLockWindowBounds(nowMs: number): { lockStartMs: number; lockEndMs: number } | null {
  if (!isOtcWeekendLockWindow(nowMs)) {
    return null;
  }
  const { y, m, d, wd } = istParts(nowMs);
  const satDay = wd === 0 ? d - 1 : d;
  const lockStartMs = istWallToUtcMs(y, m, satDay, 0, 0, 0);
  const lockEndMs = lockStartMs + 2 * 24 * 60 * 60 * 1000;
  return { lockStartMs, lockEndMs };
}

/** @deprecated Use otcLockWindowBounds */
export const xauLockWindowBounds = otcLockWindowBounds;

function otcLockWindowBefore(nowMs: number): { lockStartMs: number; lockEndMs: number } | null {
  if (isOtcWeekendLockWindow(nowMs)) {
    return null;
  }
  const { y, m, d, wd } = istParts(nowMs);
  const daysSinceMonday = wd === 0 ? 6 : wd - 1;
  const lockEndMs = istWallToUtcMs(y, m, d - daysSinceMonday, 0, 0, 0);
  const lockStartMs = lockEndMs - 2 * 24 * 60 * 60 * 1000;
  return { lockStartMs, lockEndMs };
}

/** Push expiry through OTC weekend closure so timers pause Sat–Sun IST (all pairs). */
export function effectiveBinaryExpiryAt(
  expiryAt: number,
  _symbol: string,
  nowMs: number = Date.now()
): number {
  if (expiryAt == null) {
    return expiryAt;
  }

  const active = otcLockWindowBounds(nowMs);
  if (active && expiryAt > active.lockStartMs) {
    return active.lockEndMs + (expiryAt - active.lockStartMs);
  }

  const past = otcLockWindowBefore(nowMs);
  if (past && expiryAt > past.lockStartMs && expiryAt <= past.lockEndMs) {
    return past.lockEndMs + (expiryAt - past.lockStartMs);
  }

  return expiryAt;
}

export function isMarketOff(symbol: string, lastActivityMs: number, nowMs: number = Date.now()): boolean {
  if (isOtcWeekendLockWindow(nowMs)) {
    return true;
  }
  if (isXauUsdSymbol(symbol) && lastActivityMs > 0 && nowMs - lastActivityMs > XAU_STALE_MS) {
    return true;
  }
  return false;
}

/** @deprecated Use isMarketOff */
export const isXauMarketOff = isMarketOff;

/** True when an open binary should not auto-settle yet (weekend all pairs, or stale XAU). */
export function isBinaryTradePaused(
  trade: { symbol: string; expiryAt?: number },
  lastActivityMs: number,
  nowMs: number = Date.now()
): boolean {
  if (trade.expiryAt == null) {
    return false;
  }
  if (!isMarketOff(trade.symbol, lastActivityMs, nowMs)) {
    return false;
  }
  if (isOtcWeekendLockWindow(nowMs)) {
    const bounds = otcLockWindowBounds(nowMs);
    return bounds != null && trade.expiryAt > bounds.lockStartMs;
  }
  return isXauUsdSymbol(trade.symbol) && trade.expiryAt > lastActivityMs;
}

/** @deprecated Use isBinaryTradePaused */
export const isXauBinaryTradePaused = isBinaryTradePaused;

/** Seconds left on binary countdown; frozen while OTC market is off. */
export function binaryCountdownSec(
  expiryAt: number,
  symbol: string,
  nowMs: number = Date.now(),
  lastActivityMs = 0
): number {
  const effective = effectiveBinaryExpiryAt(expiryAt, symbol, nowMs);

  if (isOtcWeekendLockWindow(nowMs)) {
    const bounds = otcLockWindowBounds(nowMs);
    if (bounds && expiryAt > bounds.lockStartMs) {
      return Math.max(0, Math.ceil((effective - bounds.lockEndMs) / 1000));
    }
  }

  if (
    isXauUsdSymbol(symbol) &&
    lastActivityMs > 0 &&
    nowMs - lastActivityMs > XAU_STALE_MS &&
    expiryAt > lastActivityMs
  ) {
    return Math.max(0, Math.ceil((expiryAt - lastActivityMs) / 1000));
  }

  return Math.max(0, Math.ceil((effective - nowMs) / 1000));
}
