import {
  isOtcWeekendLockWindow,
  isXauUsdSymbol,
  shouldShowMarketLock
} from "./xauChartLock";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

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

export function otcLockWindowBounds(nowMs: number): { lockStartMs: number; lockEndMs: number } | null {
  if (!isOtcWeekendLockWindow(new Date(nowMs))) {
    return null;
  }
  const { y, m, d, wd } = istParts(nowMs);
  const satDay = wd === 0 ? d - 1 : d;
  const lockStartMs = istWallToUtcMs(y, m, satDay, 0, 0, 0);
  const lockEndMs = lockStartMs + 2 * 24 * 60 * 60 * 1000;
  return { lockStartMs, lockEndMs };
}

function otcLockWindowBefore(nowMs: number): { lockStartMs: number; lockEndMs: number } | null {
  if (isOtcWeekendLockWindow(new Date(nowMs))) {
    return null;
  }
  const { y, m, d, wd } = istParts(nowMs);
  const daysSinceMonday = wd === 0 ? 6 : wd - 1;
  const lockEndMs = istWallToUtcMs(y, m, d - daysSinceMonday, 0, 0, 0);
  const lockStartMs = lockEndMs - 2 * 24 * 60 * 60 * 1000;
  return { lockStartMs, lockEndMs };
}

export function effectiveBinaryExpiryAt(
  expiryAt: number,
  _symbol: string,
  nowMs: number = Date.now()
): number {
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

export function isChartMarketOff(
  symbol: string,
  lastActivityMs: number,
  nowMs: number = Date.now()
): boolean {
  return shouldShowMarketLock(symbol, lastActivityMs, nowMs);
}

/** @deprecated Use isChartMarketOff */
export const isXauChartMarketOff = isChartMarketOff;

export function binaryCountdownSec(
  expiryAt: number,
  symbol: string,
  nowMs: number = Date.now(),
  lastActivityMs = 0
): number {
  const effective = effectiveBinaryExpiryAt(expiryAt, symbol, nowMs);

  if (isOtcWeekendLockWindow(new Date(nowMs))) {
    const bounds = otcLockWindowBounds(nowMs);
    if (bounds && expiryAt > bounds.lockStartMs) {
      return Math.max(0, Math.ceil((effective - bounds.lockEndMs) / 1000));
    }
  }

  if (
    isXauUsdSymbol(symbol) &&
    lastActivityMs > 0 &&
    shouldShowMarketLock(symbol, lastActivityMs, nowMs) &&
    !isOtcWeekendLockWindow(new Date(nowMs)) &&
    expiryAt > lastActivityMs
  ) {
    return Math.max(0, Math.ceil((expiryAt - lastActivityMs) / 1000));
  }

  return Math.max(0, Math.ceil((effective - nowMs) / 1000));
}
