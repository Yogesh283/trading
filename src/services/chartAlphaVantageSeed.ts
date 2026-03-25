import { FOREX_SYMBOLS } from "../config/symbols";
import { getChartCandles, saveChartCandle } from "../db/appDb";
import { fetchAlphaVantageFXDaily, splitForexPairForAlphaVantage } from "./alphaVantageFx";
import { logger } from "../utils/logger";

/**
 * When DB has almost no 5m candles, seed from Alpha Vantage `FX_DAILY` (one row per calendar day).
 * Uses `timeframe_sec=300` so the 5m chart has coarse third-party OHLC (live ticks still refine intraday).
 *
 * Respects free-tier limits: at most a few symbols per process start.
 */
const SEED_TIMEFRAME_SEC = 300;
const MAX_SYMBOLS_PER_START = 3;
const MIN_EXISTING_ROWS_SKIP = 8;

export async function seedChartCandlesFromAlphaVantageIfSparse(apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) return;

  let used = 0;
  for (const sym of FOREX_SYMBOLS) {
    if (used >= MAX_SYMBOLS_PER_START) break;

    const pair = splitForexPairForAlphaVantage(sym);
    if (!pair) continue;

    const existing = await getChartCandles(sym, SEED_TIMEFRAME_SEC, MIN_EXISTING_ROWS_SKIP + 2);
    if (existing.length >= MIN_EXISTING_ROWS_SKIP) {
      continue;
    }

    let bars: Awaited<ReturnType<typeof fetchAlphaVantageFXDaily>>;
    try {
      bars = await fetchAlphaVantageFXDaily(pair.from, pair.to, key);
    } catch (e) {
      logger.warn({ e, sym }, "Alpha Vantage FX_DAILY: skip symbol");
      continue;
    }
    if (bars.length < 5) {
      logger.info({ sym, bars: bars.length }, "Alpha Vantage: too few daily rows — skip");
      continue;
    }

    for (const b of bars) {
      await saveChartCandle({
        symbol: sym,
        timeframe_sec: SEED_TIMEFRAME_SEC,
        bucket_start_ms: b.bucketStartMs,
        open_price: b.open,
        high_price: b.high,
        low_price: b.low,
        close_price: b.close
      });
    }
    used += 1;
    logger.info({ sym, rows: bars.length }, "Alpha Vantage: seeded FX_DAILY into chart_candles (5m TF, daily bars)");
  }
}
