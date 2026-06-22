import { EventEmitter } from "node:events";
import { env } from "../config/env";
import { FOREX_PAIRS, FOREX_SYMBOLS } from "../config/symbols";
import {
  fetchGoldUsdSpot,
  fetchRetailSpotFxMatrix,
  fetchTraderMadeLive
} from "./forexExternalRates";
import { logger } from "../utils/logger";
import { isOtcWeekendLockWindow } from "../utils/xauIstWeekend";

export interface ForexTick {
  symbol: string;
  price: number;
  timestamp: number;
  source: "forex";
}

/** Cap in-memory tick history per symbol (live + heartbeat). */
const HISTORY_MAX_TICKS_PER_SYMBOL = 72_000;

/** Each 1s heartbeat closes this fraction of (anchor − chart) so API jumps spread over ~2–4s. */
const CHART_HEARTBEAT_STEP = 0.42;
/** Micro-wiggle when `FOREX_PULSE_VOLATILITY=0` — visible 1s candle motion. */
const CHART_HEARTBEAT_WIGGLE = 1.0;

function streamPulseMs(): number {
  return env.FOREX_STREAM_PULSE_MS;
}

function pulseVolScale(): number {
  return env.FOREX_PULSE_VOLATILITY;
}

/** Live ECB / TraderMade / Yahoo quotes when configured; simulated only if FOREX_SIMULATED_ONLY or API down. */
export class ForexFeed extends EventEmitter {
  private readonly latest = new Map<string, ForexTick>();
  private readonly history = new Map<string, ForexTick[]>();
  /** Real API quote — trades, settlement, spot badge. */
  private readonly anchor = new Map<string, number>();
  /** Smoothed price streamed to chart ticks (~1/s). */
  private readonly chartPrice = new Map<string, number>();
  private simTimer: ReturnType<typeof setInterval> | null = null;
  private externalTimer: ReturnType<typeof setInterval> | null = null;
  /** Per-second chart stream between API polls (smooth step toward anchor). */
  private streamPulseTimer: ReturnType<typeof setInterval> | null = null;
  /** Simulated wick only for symbols missing from the last external batch. */
  private gapSimTimer: ReturnType<typeof setInterval> | null = null;
  private gapSymbols = new Set<string>();
  private pendingExternalRetry: ReturnType<typeof setTimeout> | null = null;
  /** True after first successful external batch — prices come from API, not random walk. */
  private liveMarketActive = false;
  private liveAnchored = false;

  start() {
    if (this.simTimer || this.externalTimer) {
      return;
    }
    this.seedInitialQuotes();

    if (env.FOREX_SIMULATED_ONLY) {
      this.simTimer = setInterval(() => this.emitSimulatedTick(), streamPulseMs());
      logger.info({ pairs: FOREX_PAIRS.length }, "Forex feed: simulated only (FOREX_SIMULATED_ONLY)");
      return;
    }

    this.simTimer = setInterval(() => this.emitSimulatedTick(), streamPulseMs());
    logger.info(
      { pairs: FOREX_PAIRS.length, traderMade: Boolean(env.TRADERMADE_KEY?.trim()) },
      "Forex feed: loading world market quotes (brief sim until first API success)"
    );

    const apiKey = env.TRADERMADE_KEY?.trim();
    if (apiKey) {
      void this.bootstrapExternal(
        async () => {
          const m = await fetchTraderMadeLive(apiKey, FOREX_SYMBOLS);
          const gold = await fetchGoldUsdSpot();
          if (gold != null) {
            m.set("XAUUSD", gold);
          }
          return m;
        },
        env.TRADERMADE_LIVE_POLL_MS,
        "tradermade",
        env.TRADERMADE_STREAM_PULSE_MS
      );
    } else {
      void this.bootstrapExternal(
        async () => {
          const m = await fetchRetailSpotFxMatrix();
          const gold = await fetchGoldUsdSpot();
          if (gold != null) {
            m.set("XAUUSD", gold);
          }
          return m;
        },
        env.FOREX_RETAIL_POLL_MS,
        "yahoo-frankfurter",
        streamPulseMs()
      );
    }
  }

  stop() {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    if (this.streamPulseTimer) {
      clearInterval(this.streamPulseTimer);
      this.streamPulseTimer = null;
    }
    if (this.externalTimer) {
      clearInterval(this.externalTimer);
      this.externalTimer = null;
    }
    if (this.gapSimTimer) {
      clearInterval(this.gapSimTimer);
      this.gapSimTimer = null;
    }
    if (this.pendingExternalRetry) {
      clearTimeout(this.pendingExternalRetry);
      this.pendingExternalRetry = null;
    }
    this.gapSymbols.clear();
    this.anchor.clear();
    this.chartPrice.clear();
    this.liveMarketActive = false;
    this.liveAnchored = false;
  }

  snapshot(): ForexTick[] {
    return [...this.latest.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  getHistory(symbol?: string, limit = 500): ForexTick[] {
    const cap = Math.min(limit, HISTORY_MAX_TICKS_PER_SYMBOL);
    if (symbol) {
      const list = this.history.get(symbol.toUpperCase()) ?? [];
      return list.slice(-cap);
    }
    const out: ForexTick[] = [];
    for (const list of this.history.values()) {
      out.push(...list.slice(-cap));
    }
    return out.sort((a, b) => a.timestamp - b.timestamp);
  }

  getTick(symbol: string) {
    const tick = this.latest.get(symbol.toUpperCase());
    if (!tick) {
      return undefined;
    }
    return this.quoteTick(tick.symbol, tick);
  }

  private quoteTick(sym: string, tick: ForexTick): ForexTick {
    const anchor = this.anchor.get(sym);
    if (anchor == null) {
      return tick;
    }
    return { ...tick, price: this.roundPrice(sym, anchor) };
  }

  private chartWiggleScale(): number {
    const vs = pulseVolScale();
    return vs > 0 ? vs * 1.35 : CHART_HEARTBEAT_WIGGLE;
  }

  private minChartStep(symbol: string, price: number): number {
    const sym = symbol.toUpperCase();
    if (sym === "XAUUSD" || price >= 1000) {
      return 0.02;
    }
    if (price >= 20 || sym.includes("JPY")) {
      return 0.002;
    }
    if (price >= 1) {
      return 0.00002;
    }
    return 0.000002;
  }

  /** Next chart-stream price: step toward anchor + wiggle so forming candles move every second. */
  private stepChartPrice(symbol: string, anchor: number): number {
    const sym = symbol.toUpperCase();
    const prev = this.chartPrice.get(sym) ?? anchor;
    const vol = this.volatilityForSymbol(sym, anchor);
    const wiggle = this.chartWiggleScale();
    const toward = (anchor - prev) * CHART_HEARTBEAT_STEP;
    const noise = (Math.random() - 0.5) * 2 * vol * wiggle * anchor;
    let next = prev + toward + noise;
    const band = vol * anchor * Math.max(4, wiggle * 6);
    next = Math.min(anchor + band, Math.max(anchor - band, next));
    next = this.roundPrice(sym, next);
    const minStep = this.minChartStep(sym, anchor);
    const prevR = this.roundPrice(sym, prev);
    if (next === prevR && minStep > 0) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      next = this.roundPrice(sym, prevR + dir * minStep);
    }
    this.chartPrice.set(sym, next);
    return next;
  }

  private roundPrice(symbol: string, raw: number): number {
    const next = raw;
    const sym = symbol.toUpperCase();
    if (next >= 1000) {
      return Number(next.toFixed(2));
    }
    const decimals =
      sym === "XAUUSD" || next >= 20 || (next >= 1 && symbol.includes("JPY")) ? 3 : next >= 5 ? 4 : 5;
    return Number(next.toFixed(decimals));
  }

  private pushTick(symbol: string, price: number, timestamp: number) {
    const sym = symbol.toUpperCase();
    if (isOtcWeekendLockWindow(timestamp)) {
      return;
    }
    const p = this.roundPrice(sym, price);
    const tick: ForexTick = { symbol: sym, price: p, timestamp, source: "forex" };
    this.latest.set(sym, tick);
    const buf = this.history.get(sym) ?? [];
    buf.push(tick);
    if (buf.length > HISTORY_MAX_TICKS_PER_SYMBOL) {
      buf.shift();
    }
    this.history.set(sym, buf);
    this.emit("tick", tick);
  }

  /** One placeholder tick per pair until the first real API quote (no fake random-walk history). */
  private seedInitialQuotes() {
    const now = Date.now();
    for (const p of FOREX_PAIRS) {
      const price = this.roundPrice(p.symbol, p.base);
      const tick: ForexTick = { symbol: p.symbol, price, timestamp: now, source: "forex" };
      this.latest.set(p.symbol, tick);
      this.history.set(p.symbol, [tick]);
    }
  }

  private volatilityForSymbol(symbol: string, prev: number): number {
    return symbol === "XAUUSD"
      ? 0.00006
      : symbol.includes("JPY") || (symbol.startsWith("USD") && prev > 50)
        ? 0.00012
        : 0.00008;
  }

  /** Demo / pre-API only — not used after live market connects. */
  private emitSimulatedTick() {
    if (this.liveMarketActive) {
      return;
    }
    const now = Date.now();
    const volScale = pulseVolScale();
    for (const p of FOREX_PAIRS) {
      const prev = this.latest.get(p.symbol)?.price ?? p.base;
      const vol = this.volatilityForSymbol(p.symbol, prev) * (volScale > 0 ? volScale * 1.35 : 1);
      const drift = (Math.random() - 0.5) * 2 * vol;
      let next = prev * (1 + drift);
      const min = p.base * 0.985;
      const max = p.base * 1.015;
      next = Math.min(max, Math.max(min, next));
      this.pushTick(p.symbol, next, now);
    }
  }

  /**
   * Live mode: one chart tick per second — smooth step toward the real API anchor (not a 3–5s lump jump).
   * Binary settle / open-trade entry still use `anchor` via `getTick()`.
   */
  private emitLiveHeartbeat() {
    const now = Date.now();
    for (const p of FOREX_PAIRS) {
      if (this.gapSymbols.has(p.symbol)) {
        continue;
      }
      const anchor = this.anchor.get(p.symbol) ?? this.latest.get(p.symbol)?.price;
      if (anchor == null || !Number.isFinite(anchor)) {
        continue;
      }
      const display = this.stepChartPrice(p.symbol, anchor);
      this.pushTick(p.symbol, display, now);
    }
  }

  private emitGapSimulatedTick() {
    const now = Date.now();
    const volScale = pulseVolScale();
    for (const p of FOREX_PAIRS) {
      if (!this.gapSymbols.has(p.symbol)) {
        continue;
      }
      const prev = this.latest.get(p.symbol)?.price ?? p.base;
      const vol = this.volatilityForSymbol(p.symbol, prev) * (volScale > 0 ? volScale * 1.35 : 1);
      const drift = (Math.random() - 0.5) * 2 * vol;
      let next = prev * (1 + drift);
      const min = p.base * 0.985;
      const max = p.base * 1.015;
      next = Math.min(max, Math.max(min, next));
      this.pushTick(p.symbol, next, now);
    }
  }

  private applyExternalPrices(map: Map<string, number>) {
    const now = Date.now();

    if (!this.liveAnchored && map.size > 0) {
      this.liveAnchored = true;
      for (const sym of FOREX_SYMBOLS) {
        const raw = map.get(sym);
        if (raw == null || !Number.isFinite(raw) || raw <= 0) {
          continue;
        }
        const s = sym.toUpperCase();
        const p = this.roundPrice(s, raw);
        this.anchor.set(s, p);
        this.chartPrice.set(s, p);
        const tick: ForexTick = { symbol: s, price: p, timestamp: now, source: "forex" };
        this.latest.set(s, tick);
        this.history.set(s, [tick]);
      }
      logger.info({ quotes: map.size }, "Forex: anchored to world market — cleared simulated backfill");
    }

    for (const [sym, raw] of map) {
      if (!Number.isFinite(raw) || raw <= 0) {
        continue;
      }
      const s = sym.toUpperCase();
      const p = this.roundPrice(s, raw);
      this.anchor.set(s, p);
      if (!this.liveMarketActive) {
        this.chartPrice.set(s, p);
        this.pushTick(s, p, now);
      }
    }

    const missing = FOREX_SYMBOLS.filter((s) => !map.has(s));
    if (missing.length === 0) {
      if (this.gapSimTimer) {
        clearInterval(this.gapSimTimer);
        this.gapSimTimer = null;
      }
      this.gapSymbols.clear();
      return;
    }
    this.gapSymbols = new Set(missing);
    if (!this.gapSimTimer && pulseVolScale() > 0) {
      this.gapSimTimer = setInterval(() => this.emitGapSimulatedTick(), streamPulseMs());
    }
    logger.warn({ missing }, "Forex live: some pairs missing from feed");
  }

  private async bootstrapExternal(
    fetcher: () => Promise<Map<string, number>>,
    intervalMs: number,
    name: string,
    heartbeatMs: number = env.FOREX_STREAM_PULSE_MS
  ) {
    try {
      const map = await fetcher();
      const need = Math.max(3, Math.floor(FOREX_SYMBOLS.length * 0.4));
      if (map.size < need) {
        throw new Error(`Too few quotes (${map.size}/${FOREX_SYMBOLS.length})`);
      }
      this.applyExternalPrices(map);
      this.liveMarketActive = true;
      if (this.pendingExternalRetry) {
        clearTimeout(this.pendingExternalRetry);
        this.pendingExternalRetry = null;
      }
      if (this.simTimer) {
        clearInterval(this.simTimer);
        this.simTimer = null;
      }
      if (this.streamPulseTimer) {
        clearInterval(this.streamPulseTimer);
        this.streamPulseTimer = null;
      }
      this.streamPulseTimer = setInterval(() => this.emitLiveHeartbeat(), heartbeatMs);
      logger.info(
        { source: name, quotes: map.size, heartbeatMs, pollMs: intervalMs, syntheticVol: pulseVolScale() },
        "Forex world market live — chart ticks/sec smooth toward API anchor; trades settle on anchor"
      );
      this.externalTimer = setInterval(() => {
        void fetcher()
          .then((m) => {
            if (m.size > 0) {
              this.applyExternalPrices(m);
            }
          })
          .catch((e) => logger.warn({ e, name }, "Forex live poll failed"));
      }, intervalMs);
    } catch (e) {
      logger.warn({ e, name }, "Forex live bootstrap failed; retry in 30s (simulated meanwhile)");
      if (this.pendingExternalRetry) {
        clearTimeout(this.pendingExternalRetry);
      }
      this.pendingExternalRetry = setTimeout(() => {
        this.pendingExternalRetry = null;
        if (!this.externalTimer) {
          void this.bootstrapExternal(fetcher, intervalMs, name, heartbeatMs);
        }
      }, 30_000);
    }
  }
}
