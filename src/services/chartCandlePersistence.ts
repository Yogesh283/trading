import { TRADE_TIMEFRAMES_SEC } from "../config/timeframes";
import { saveChartCandle, type ChartCandleRow } from "../db/appDb";
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
 * Call on every forex tick (same cadence as WebSocket LivePrice). When a UTC bucket rolls,
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
