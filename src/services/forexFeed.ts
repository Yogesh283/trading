import { EventEmitter } from "node:events";
import { env } from "../config/env";
import { FOREX_PAIRS, FOREX_SYMBOLS } from "../config/symbols";
import {
  fetchGoldUsdSpot,
  fetchRetailSpotFxMatrix,
  fetchTraderMadeLive
} from "./forexExternalRates";
import { logger } from "../utils/logger";
import { isXauIstWeeklyLockWindow, isXauUsdSymbol } from "../utils/xauIstWeekend";

export interface ForexTick {
  symbol: string;
  price: number;
  timestamp: number;
  source: "forex";
}

/** ~5h window: `HISTORY_MAX * SIM_TICK_MS` (see seedIntradayBackfill). */
const HISTORY_MAX_TICKS_PER_SYMBOL = 72_000;

/** Simulated + stream pulse cadence — higher = snappier live candles / WebSocket (more CPU + WS traffic). */
const SIM_TICK_MS = 250;
/** Between live API polls: synthetic walk at same cadence as sim ticks. */
const STREAM_PULSE_MS = 250;

/** Live ECB / TraderMade quotes when configured; otherwise random-walk demo. */
export class ForexFeed extends EventEmitter {
  private readonly latest = new Map<string, ForexTick>();
  private readonly history = new Map<string, ForexTick[]>();
  private simTimer: ReturnType<typeof setInterval> | null = null;
  private externalTimer: ReturnType<typeof setInterval> | null = null;
  /** 1 Hz price pulse while live external feed is active (without this, quotes only refresh every API poll). */
  private streamPulseTimer: ReturnType<typeof setInterval> | null = null;
  /** Simulated wick only for symbols missing from the last external batch (e.g. XAU if Yahoo fails). */
  private gapSimTimer: ReturnType<typeof setInterval> | null = null;
  private gapSymbols = new Set<string>();
  private pendingExternalRetry: ReturnType<typeof setTimeout> | null = null;

  start() {
    if (this.simTimer || this.externalTimer) {
      return;
    }
    this.seedIntradayBackfill();

    if (env.FOREX_SIMULATED_ONLY) {
      this.simTimer = setInterval(() => this.emitSimulatedTick(), SIM_TICK_MS);
      logger.info({ pairs: FOREX_PAIRS.length }, "Forex feed: simulated only (FOREX_SIMULATED_ONLY)");
      return;
    }

    const apiKey = env.TRADERMADE_KEY?.trim();
    this.simTimer = setInterval(() => this.emitSimulatedTick(), SIM_TICK_MS);
    logger.info(
      { pairs: FOREX_PAIRS.length, traderMade: Boolean(apiKey) },
      "Forex feed: fetching live rates (simulated until first success)"
    );

    if (apiKey) {
      void this.bootstrapExternal(
        async () => {
          const tmSyms = FOREX_SYMBOLS;
          const m = await fetchTraderMadeLive(apiKey, tmSyms);
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
        60_000,
        "yahoo-frankfurter",
        STREAM_PULSE_MS
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
    return this.latest.get(symbol.toUpperCase());
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
    /** XAU/USD only: no new ticks Sat–Sun IST — price stays at last weekday close in memory/WS/DB/candles. */
    if (isXauUsdSymbol(sym) && isXauIstWeeklyLockWindow(timestamp)) {
      return;
    }
    const p = this.roundPrice(sym, price);
    const tick: ForexTick = { symbol: sym, price: p, timestamp, source: "forex" };
    this.latest.set(symbol, tick);
    const buf = this.history.get(symbol) ?? [];
    buf.push(tick);
    if (buf.length > HISTORY_MAX_TICKS_PER_SYMBOL) {
      buf.shift();
    }
    this.history.set(symbol, buf);
    this.emit("tick", tick);
  }

  private seedIntradayBackfill() {
    const now = Date.now();
    const stepMs = SIM_TICK_MS;
    const backfillMs = (HISTORY_MAX_TICKS_PER_SYMBOL - 1) * stepMs;

    for (const p of FOREX_PAIRS) {
      const ticks: ForexTick[] = [];
      let price = p.base * (0.997 + Math.random() * 0.006);
      for (let t = now - backfillMs; t <= now; t += stepMs) {
        const prev = price;
        const vol =
          p.symbol === "XAUUSD"
            ? 0.00006
            : p.symbol.includes("JPY") || (p.symbol.startsWith("USD") && prev > 50)
              ? 0.00012
              : 0.00008;
        const drift = (Math.random() - 0.5) * 2 * vol;
        let next = prev * (1 + drift);
        const min = p.base * 0.985;
        const max = p.base * 1.015;
        next = Math.min(max, Math.max(min, next));
        price = this.roundPrice(p.symbol, next);
        ticks.push({ symbol: p.symbol, price, timestamp: t, source: "forex" });
      }
      const trimmed = ticks.slice(-HISTORY_MAX_TICKS_PER_SYMBOL);
      this.history.set(p.symbol, trimmed);
      const last = trimmed[trimmed.length - 1]!;
      this.latest.set(p.symbol, last);
    }
  }

  private volatilityForSymbol(symbol: string, prev: number): number {
    return symbol === "XAUUSD"
      ? 0.00006
      : symbol.includes("JPY") || (symbol.startsWith("USD") && prev > 50)
        ? 0.00012
        : 0.00008;
  }

  private emitSimulatedTick() {
    const now = Date.now();
    for (const p of FOREX_PAIRS) {
      const prev = this.latest.get(p.symbol)?.price ?? p.base;
      const vol = this.volatilityForSymbol(p.symbol, prev);
      const drift = (Math.random() - 0.5) * 2 * vol;
      let next = prev * (1 + drift);
      const min = p.base * 0.985;
      const max = p.base * 1.015;
      next = Math.min(max, Math.max(min, next));
      this.pushTick(p.symbol, next, now);
    }
  }

  /** Softer walk between live API polls so clients get steady quotes over WebSocket (same cadence as `SIM_TICK_MS`). */
  private emitStreamPulse() {
    const now = Date.now();
    for (const p of FOREX_PAIRS) {
      const prev = this.latest.get(p.symbol)?.price ?? p.base;
      const vol = this.volatilityForSymbol(p.symbol, prev) * 0.42;
      let next = prev;
      for (let attempt = 0; attempt < 4; attempt++) {
        const drift = (Math.random() - 0.5) * 2 * vol;
        let cand = prev * (1 + drift);
        const min = p.base * 0.985;
        const max = p.base * 1.015;
        cand = Math.min(max, Math.max(min, cand));
        const rounded = this.roundPrice(p.symbol, cand);
        if (rounded !== prev) {
          next = rounded;
          break;
        }
      }
      if (next !== prev) {
        this.pushTick(p.symbol, next, now);
      } else {
        /** Same rounded price as last pulse — still emit so WebSocket clients get steady ticks and candles build. */
        this.pushTick(p.symbol, prev, now);
      }
    }
  }

  private emitGapSimulatedTick() {
    const now = Date.now();
    for (const p of FOREX_PAIRS) {
      if (!this.gapSymbols.has(p.symbol)) {
        continue;
      }
      const prev = this.latest.get(p.symbol)?.price ?? p.base;
      const vol =
        p.symbol === "XAUUSD"
          ? 0.00006
          : p.symbol.includes("JPY") || (p.symbol.startsWith("USD") && prev > 50)
            ? 0.00012
            : 0.00008;
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
    for (const [sym, raw] of map) {
      if (!Number.isFinite(raw) || raw <= 0) {
        continue;
      }
      this.pushTick(sym.toUpperCase(), raw, now);
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
    if (!this.gapSimTimer) {
      this.gapSimTimer = setInterval(() => this.emitGapSimulatedTick(), SIM_TICK_MS);
    }
    logger.warn({ missing }, "Forex live: some pairs missing from feed — simulating gap symbols only");
  }

  private async bootstrapExternal(
    fetcher: () => Promise<Map<string, number>>,
    intervalMs: number,
    name: string,
    streamPulseMs: number = STREAM_PULSE_MS
  ) {
    try {
      const map = await fetcher();
      const need = Math.max(3, Math.floor(FOREX_SYMBOLS.length * 0.4));
      if (map.size < need) {
        throw new Error(`Too few quotes (${map.size}/${FOREX_SYMBOLS.length})`);
      }
      this.applyExternalPrices(map);
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
      this.streamPulseTimer = setInterval(() => this.emitStreamPulse(), streamPulseMs);
      logger.info(
        { source: name, quotes: map.size, streamPulseMs, pollMs: intervalMs },
        "Forex live rates active"
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
          void this.bootstrapExternal(fetcher, intervalMs, name, streamPulseMs);
        }
      }, 30_000);
    }
  }
}
