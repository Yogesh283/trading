import type { MarketTick } from "./api";

export interface CandlePoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function numPrice(t: MarketTick): number {
  const p = typeof t.price === "number" ? t.price : Number(t.price);
  return Number.isFinite(p) && p > 0 ? p : NaN;
}

/**
 * Drop ticks whose price is a clear outlier vs the rest of the bucket (bad DB row, mixed scale, etc.).
 * Without this, one bogus high/low stretches the Y-axis and real candles look like flat hairlines.
 */
function ticksForBucketAggregation(sortedTicks: MarketTick[]): MarketTick[] {
  const valid = sortedTicks.filter((t) => Number.isFinite(numPrice(t)));
  if (valid.length === 0) {
    return sortedTicks;
  }
  if (valid.length === 2) {
    const a = numPrice(valid[0]!);
    const b = numPrice(valid[1]!);
    const rel = Math.abs(a - b) / Math.min(a, b);
    if (rel > 0.025) {
      const mid = (a + b) / 2;
      return [
        { ...valid[0]!, price: mid },
        { ...valid[1]!, price: mid }
      ];
    }
    return valid;
  }
  if (valid.length < 2) {
    return valid;
  }
  const prices = valid.map((t) => numPrice(t));
  const sorted = [...prices].sort((x, y) => x - y);
  const n = sorted.length;
  const q1 = sorted[Math.floor((n - 1) * 0.25)]!;
  const q3 = sorted[Math.floor((n - 1) * 0.75)]!;
  const iqr = q3 - q1;
  if (!Number.isFinite(iqr) || iqr <= 0) {
    return valid;
  }
  const lo = q1 - 3 * iqr;
  const hi = q3 + 3 * iqr;
  const kept = valid.filter((t) => {
    const p = numPrice(t);
    return p >= lo && p <= hi;
  });
  if (kept.length >= Math.max(2, Math.ceil(valid.length * 0.4))) {
    return kept.sort((a, b) => a.timestamp - b.timestamp);
  }
  return valid;
}

/**
 * Unix ms when the current candle period ends (UTC wall-clock aligned via epoch buckets).
 * Same formula as server `binaryCandleExpiresAtMs` — chart countdown and binary expiry stay in sync.
 */
export function candlePeriodEndMs(nowMs: number, intervalSeconds: number): number {
  const bucketMs = intervalSeconds * 1000;
  return Math.floor(nowMs / bucketMs) * bucketMs + bucketMs;
}

/** Start of the chart candle bucket containing `tsMs` (same alignment as `buildCandles`). */
export function candleBucketStartMs(tsMs: number, intervalSeconds: number): number {
  const bucketMs = intervalSeconds * 1000;
  return Math.floor(tsMs / bucketMs) * bucketMs;
}

/** Max bars on chart — keeps TradingView-like density (avoids 10k+ flat dojis killing the look). */
export const CHART_MAX_CANDLES = 1200;

/**
 * Build OHLC candles: one bar per `intervalSeconds` aligned to UTC wall buckets (same idea as TradingView UTC forex).
 * 5s/10s/60/180/300 → 5s through 5m bars (aligned to UTC buckets).
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
    const rawSorted = [...byBucket.get(bucket)!].sort((a, b) => a.timestamp - b.timestamp);
    const list = ticksForBucketAggregation(rawSorted);
    const prices = list.map((t) => numPrice(t)).filter((p) => Number.isFinite(p));
    if (prices.length === 0) {
      continue;
    }
    const open = numPrice(list[0]!);
    const close = numPrice(list[list.length - 1]!);
    const raw: CandlePoint = {
      timestamp: bucket,
      open,
      high: Math.max(...prices),
      low: Math.min(...prices),
      close
    };
    agg.set(bucket, clampChartCandleBar(raw, intervalSeconds));
  }

  const sortedBuckets = Array.from(agg.keys()).sort((a, b) => a - b);
  if (sortedBuckets.length === 0) {
    return [];
  }
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

/**
 * Any timeframe: mixed stale + live ticks (or bad DB rows) can create absurd H/L vs body ("barcode").
 * On 1m/3m/5m, `body * 4` alone allowed a full DB→live gap in one bar (tall spike); add a hard range cap.
 */
export function clampChartCandleBar(c: CandlePoint, intervalSeconds: number): CandlePoint {
  const { open, close, high, low } = c;
  const range = high - low;
  if (!Number.isFinite(range) || range <= 0) {
    return c;
  }
  const mid = (high + low) / 2;
  const body = Math.abs(open - close);
  const tfEff = Math.max(5, intervalSeconds);
  const sqrtScale = Math.min(14, Math.sqrt(tfEff / 5));
  const relWick = mid * 0.0004 * sqrtScale;
  /** Do not let a fake open→close gap justify a multi‑percent bar (XAU / seeded DB vs live). */
  const bodyAllow = Math.min(body * 3 + mid * 1e-8, mid * 0.0022 * sqrtScale);
  const hardMaxRange = mid * Math.min(0.009, 0.00028 * sqrtScale * sqrtScale + 0.00035 * sqrtScale);
  const maxReasonable = Math.min(Math.max(relWick, bodyAllow, 1e-6), hardMaxRange);
  if (range <= maxReasonable) {
    return c;
  }
  /** Open/close can still span the whole gap (e.g. seeded DB vs live); shrink to a doji at last price. */
  const p = close;
  const eps = Math.max(mid * 0.00002, 1e-6);
  return { ...c, open: p, high: p + eps, low: p - eps, close: p };
}

/**
 * DB holds closed bars; live ticks rebuild OHLC via `buildCandles`.
 * Merge by bucket timestamp: apply DB first, then **overwrite** with live for the same `timestamp`
 * so tick-built bars win for the visible window without prefix/`mergeStart` edge cases dropping history.
 */
export function mergeDbClosedWithLiveCandles(
  closedAscending: CandlePoint[],
  liveFromTicks: CandlePoint[]
): CandlePoint[] {
  if (liveFromTicks.length === 0) {
    return closedAscending;
  }
  const byTs = new Map<number, CandlePoint>();
  const put = (c: CandlePoint, force = false) => {
    const ts = Number(c.timestamp);
    if (!Number.isFinite(ts)) {
      return;
    }
    const o = Number(c.open);
    const h = Number(c.high);
    const l = Number(c.low);
    const cl = Number(c.close);
    if (![o, h, l, cl].every(Number.isFinite)) {
      return;
    }
    if (!force && byTs.has(ts)) {
      return;
    }
    byTs.set(ts, { timestamp: ts, open: o, high: h, low: l, close: cl });
  };
  for (const c of closedAscending) {
    put(c, false);
  }
  for (const c of liveFromTicks) {
    put(c, true);
  }
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
}

/** When there are no ticks yet, extend stored closed bars with flat placeholders up to the current bucket. */
export function extendClosedCandlesToNow(closed: CandlePoint[], timeframeSec: number, nowMs: number): CandlePoint[] {
  if (closed.length === 0) {
    return [];
  }
  const tfMs = timeframeSec * 1000;
  const last = closed[closed.length - 1]!;
  const nowBucket = Math.floor(nowMs / tfMs) * tfMs;
  const lastBucket = last.timestamp;
  if (nowBucket <= lastBucket) {
    return closed;
  }
  let lc = last.close;
  const out = [...closed];
  for (let t = lastBucket + tfMs; t <= nowBucket; t += tfMs) {
    out.push({ timestamp: t, open: lc, high: lc, low: lc, close: lc });
    lc = lc;
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
