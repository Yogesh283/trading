import { TRADE_TIMEFRAMES_SEC } from "../config/timeframes";
import { saveChartCandle, upsertChartCandle, type ChartCandleRow } from "../db/appDb";
import { logger } from "../utils/logger";

type OpenBar = {
  bucketStart: number;
  o: number;
  h: number;
  l: number;
  c: number;
};

const openByKey = new Map<string, OpenBar>();

function key(symbol: string, tf: number): string {
  return `${symbol.toUpperCase()}:${tf}`;
}

function flushBar(sym: string, tf: number, b: OpenBar): void {
  const row: ChartCandleRow = {
    symbol: sym,
    timeframe_sec: tf,
    bucket_start_ms: b.bucketStart,
    open_price: b.o,
    high_price: b.h,
    low_price: b.l,
    close_price: b.c
  };
  void saveChartCandle(row).catch((err) => {
    logger.warn({ err, sym, tf, bucket: b.bucketStart }, "chart_candles save failed");
  });
}

/**
 * Call on every forex tick (same cadence as WebSocket LivePrice, ~4/s by default). When a UTC bucket rolls,
 * the previous bar is written to `chart_candles`.
 */
export function onForexTickForCandles(symbol: string, price: number, timestamp: number): void {
  const sym = symbol.trim().toUpperCase();
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp)) {
    return;
  }
  for (const tf of TRADE_TIMEFRAMES_SEC) {
    const tfMs = tf * 1000;
    const bucket = Math.floor(timestamp / tfMs) * tfMs;
    const k = key(sym, tf);
    let b = openByKey.get(k);
    if (!b || b.bucketStart !== bucket) {
      if (b) {
        flushBar(sym, tf, b);
      }
      b = { bucketStart: bucket, o: price, h: price, l: price, c: price };
      openByKey.set(k, b);
    } else {
      b.h = Math.max(b.h, price);
      b.l = Math.min(b.l, price);
      b.c = price;
    }
  }
}

/**
 * When the chart client requests candles (e.g. new symbol/timeframe), merge the latest quote into memory
 * and write the **open** bar for that timeframe to `chart_candles` so history shows immediately from DB.
 */
export async function persistOpenBarBeforeCandlesRead(
  symbol: string,
  timeframeSec: number,
  latest: { price: number; timestamp: number } | null | undefined
): Promise<void> {
  if (!latest || !Number.isFinite(latest.price) || latest.price <= 0 || !Number.isFinite(latest.timestamp)) {
    return;
  }
  const sym = symbol.trim().toUpperCase();
  if (!(TRADE_TIMEFRAMES_SEC as readonly number[]).includes(timeframeSec)) {
    return;
  }
  onForexTickForCandles(sym, latest.price, latest.timestamp);
  const b = openByKey.get(key(sym, timeframeSec));
  if (!b) {
    return;
  }
  const row: ChartCandleRow = {
    symbol: sym,
    timeframe_sec: timeframeSec,
    bucket_start_ms: b.bucketStart,
    open_price: b.o,
    high_price: b.h,
    low_price: b.l,
    close_price: b.c
  };
  try {
    await upsertChartCandle(row);
  } catch (err) {
    logger.warn({ err, sym, timeframeSec, bucket: b.bucketStart }, "chart_candles open-bar upsert failed");
  }
}
