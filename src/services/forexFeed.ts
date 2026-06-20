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
  private simTimer: ReturnType<typeof setInterval> | null = null;
  private externalTimer: ReturnType<typeof setInterval> | null = null;
  /** Re-broadcast last real quote for chart clock (no synthetic price drift). */
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
   * Live mode: re-send the last **real** API price (chart/candle clock only).
   * Up/down on chart + binary settle use the same quote until the next API poll updates it.
   */
  private emitLiveHeartbeat() {
    const now = Date.now();
    for (const p of FOREX_PAIRS) {
      if (this.gapSymbols.has(p.symbol)) {
        continue;
      }
      const last = this.latest.get(p.symbol);
      if (!last) {
        continue;
      }
      this.pushTick(p.symbol, last.price, now);
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
        "Forex world market live — chart/trades follow API quotes (no random walk between polls)"
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
