/** Chart + binary trade candle periods (seconds). Single source for server. */
export const TRADE_TIMEFRAMES_SEC = [5, 10, 60, 180, 300] as const;

/**
 * Unix ms when the current candle CLOSES (aligned to epoch — same buckets as chart `buildCandles`).
 * All binary orders placed during that candle share this expiry so countdown matches the chart timer.
 */
export function binaryCandleExpiresAtMs(nowMs: number, timeframeSec: number): number {
  const bucketMs = timeframeSec * 1000;
  return Math.floor(nowMs / bucketMs) * bucketMs + bucketMs;
}
