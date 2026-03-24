import type { MarketTick } from "./api";

export interface CandlePoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Unix ms when the current candle period ends (UTC wall-clock aligned via epoch buckets).
 * Same formula as server `binaryCandleExpiresAtMs` — chart countdown and binary expiry stay in sync.
 */
export function candlePeriodEndMs(nowMs: number, intervalSeconds: number): number {
  const bucketMs = intervalSeconds * 1000;
  return Math.floor(nowMs / bucketMs) * bucketMs + bucketMs;
}

/** Max bars on chart — keeps TradingView-like density (avoids 10k+ flat dojis killing the look). */
export const CHART_MAX_CANDLES = 1200;

/**
 * Build OHLC candles: one bar per `intervalSeconds` aligned to UTC wall buckets (same idea as TradingView UTC forex).
 * 5s → new bar every 5s; 60 → every minute; 120/180/300/600 → every 2/3/5/10 minutes.
 * Empty buckets become flat bars (O=H=L=C=last price) so each period is its own candle.
 * Only the last `CHART_MAX_CANDLES` periods are kept so the series stays fast and readable.
 */
export function buildCandles(points: MarketTick[], intervalSeconds = 1, nowMs: number = Date.now()): CandlePoint[] {
  if (points.length === 0) {
    return [];
  }

  const bucketMs = intervalSeconds * 1000;
  const byBucket = new Map<number, MarketTick[]>();
  for (const p of points) {
    const bucket = Math.floor(p.timestamp / bucketMs) * bucketMs;
    const list = byBucket.get(bucket);
    if (list) {
      list.push(p);
    } else {
      byBucket.set(bucket, [p]);
    }
  }

  const agg = new Map<number, CandlePoint>();
  for (const bucket of byBucket.keys()) {
    const list = byBucket.get(bucket)!.sort((a, b) => a.timestamp - b.timestamp);
    const prices = list.map((t) => t.price);
    agg.set(bucket, {
      timestamp: bucket,
      open: list[0].price,
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: list[list.length - 1].price
    });
  }

  const sortedBuckets = Array.from(agg.keys()).sort((a, b) => a - b);
  const firstBucket = sortedBuckets[0]!;
  const lastDataBucket = sortedBuckets[sortedBuckets.length - 1]!;
  const nowBucket = Math.floor(nowMs / bucketMs) * bucketMs;
  const lastBucket = Math.max(lastDataBucket, nowBucket);

  const maxSpanMs = (CHART_MAX_CANDLES - 1) * bucketMs;
  const effectiveFirst = Math.max(firstBucket, lastBucket - maxSpanMs);

  const sortedPoints = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const lastPriceStrictlyBefore = (ms: number): number => {
    for (let i = sortedPoints.length - 1; i >= 0; i--) {
      if (sortedPoints[i].timestamp < ms) {
        return sortedPoints[i].price;
      }
    }
    return sortedPoints[0].price;
  };

  let lastClose = lastPriceStrictlyBefore(effectiveFirst);
  const out: CandlePoint[] = [];

  for (let t = effectiveFirst; t <= lastBucket; t += bucketMs) {
    const c = agg.get(t);
    if (c) {
      out.push(c);
      lastClose = c.close;
    } else {
      out.push({
        timestamp: t,
        open: lastClose,
        high: lastClose,
        low: lastClose,
        close: lastClose
      });
    }
  }

  return out;
}

/** Index of candle bucket for `openedAt` (for trade markers). */
export function globalCandleIndexForOpen(
  allCandles: CandlePoint[],
  openedAt: string,
  intervalSeconds: number
): number {
  if (allCandles.length === 0) return 0;
  const bucketMs = intervalSeconds * 1000;
  const t = new Date(openedAt).getTime();
  const bucket = Math.floor(t / bucketMs) * bucketMs;
  let idx = allCandles.findIndex((c) => c.timestamp === bucket);
  if (idx >= 0) return idx;
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < allCandles.length; i++) {
    const d = Math.abs(allCandles[i].timestamp - bucket);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** EMA(close); first `period-1` values are null; index `period-1` is SMA seed. */
export function computeEmaValues(closes: number[], period: number): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = Array.from({ length: n }, () => null);
  if (n < period) {
    return out;
  }
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
  }
  let ema = sum / period;
  out[period - 1] = ema;
  for (let i = period; i < n; i++) {
    ema = closes[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}
