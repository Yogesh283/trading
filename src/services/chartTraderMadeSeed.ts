import { FOREX_SYMBOLS } from "../config/symbols";
import { saveChartCandle } from "../db/appDb";
import { fetchTraderMadeHistoricalDay } from "./forexExternalRates";
import { logger } from "../utils/logger";

/**
 * One-time-ish seed: TraderMade `/historical` often returns hourly bars on lower tiers.
 * If median gap is ~1 minute, we persist as `timeframe_sec=60` so the chart has third-party OHLC.
 * 5s/10s bars still come from live ticks + `onForexTickForCandles` (needs dense stream pulse).
 */
export async function seedChartCandlesFromTraderMadeIfSparse(apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const symbols = FOREX_SYMBOLS.slice(0, 12);

  for (const sym of symbols) {
    let bars: Awaited<ReturnType<typeof fetchTraderMadeHistoricalDay>>;
    try {
      bars = await fetchTraderMadeHistoricalDay(key, sym, yesterday);
    } catch (e) {
      logger.warn({ e, sym }, "TraderMade historical: skip symbol");
      continue;
    }
    if (bars.length < 5) {
      continue;
    }
    const gaps: number[] = [];
    for (let i = 1; i < Math.min(bars.length, 30); i++) {
      gaps.push(bars[i]!.bucketStartMs - bars[i - 1]!.bucketStartMs);
    }
    gaps.sort((a, b) => a - b);
    const med = gaps[Math.floor(gaps.length / 2)] ?? 0;
    if (med < 45_000 || med > 120_000) {
      logger.info({ sym, med, bars: bars.length }, "TraderMade historical: not ~1m spacing — skip DB seed");
      continue;
    }
    for (const b of bars) {
      await saveChartCandle({
        symbol: sym,
        timeframe_sec: 60,
        bucket_start_ms: b.bucketStartMs,
        open_price: b.open,
        high_price: b.high,
        low_price: b.low,
        close_price: b.close
      });
    }
    logger.info({ sym, rows: bars.length }, "TraderMade: seeded 1m OHLC into chart_candles");
  }
}
