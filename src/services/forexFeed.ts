import { EventEmitter } from "node:events";
import { env } from "../config/env";
import { FOREX_PAIRS, FOREX_SYMBOLS } from "../config/symbols";
import {
  fetchFrankfurterUsdMatrix,
  fetchGoldUsdPyth,
  fetchGoldUsdYahoo,
  fetchTraderMadeLive
} from "./forexExternalRates";
import { logger } from "../utils/logger";

export interface ForexTick {
  symbol: string;
  price: number;
  timestamp: number;
  source: "forex";
}

/** ~2.5h at 2 ticks/sec — deep enough for 10m/5m chart history when DB is empty. */
const HISTORY_MAX_TICKS_PER_SYMBOL = 18000;

/** Live ECB / TraderMade quotes when configured; otherwise random-walk demo. */
export class ForexFeed extends EventEmitter {
  private readonly latest = new Map<string, ForexTick>();
  private readonly history = new Map<string, ForexTick[]>();
  private simTimer: ReturnType<typeof setInterval> | null = null;
  private externalTimer: ReturnType<typeof setInterval> | null = null;
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
      this.simTimer = setInterval(() => this.emitSimulatedTick(), 500);
      logger.info({ pairs: FOREX_PAIRS.length }, "Forex feed: simulated only (FOREX_SIMULATED_ONLY)");
      return;
    }

    const apiKey = env.TRADERMADE_KEY?.trim();
    this.simTimer = setInterval(() => this.emitSimulatedTick(), 500);
    logger.info(
      { pairs: FOREX_PAIRS.length, traderMade: Boolean(apiKey) },
      "Forex feed: fetching live rates (simulated until first success)"
    );

    if (apiKey) {
      void this.bootstrapExternal(
        () => fetchTraderMadeLive(apiKey, FOREX_SYMBOLS),
        15_000,
        "tradermade"
      );
    } else {
      void this.bootstrapExternal(
        async () => {
          const m = await fetchFrankfurterUsdMatrix();
          const gold = (await fetchGoldUsdPyth()) ?? (await fetchGoldUsdYahoo());
          if (gold != null) {
            m.set("XAUUSD", gold);
          }
          return m;
        },
        90_000,
        "frankfurter"
      );
    }
  }

  stop() {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
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
    const decimals =
      symbol === "XAUUSD" || next >= 20 || (next >= 1 && symbol.includes("JPY")) ? 3 : next >= 5 ? 4 : 5;
    return Number(next.toFixed(decimals));
  }

  private pushTick(symbol: string, price: number, timestamp: number) {
    const p = this.roundPrice(symbol, price);
    const tick: ForexTick = { symbol, price: p, timestamp, source: "forex" };
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
    const backfillMs = 25 * 60 * 1000;
    const stepMs = 1000;

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

  private emitSimulatedTick() {
    const now = Date.now();
    for (const p of FOREX_PAIRS) {
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
      this.gapSimTimer = setInterval(() => this.emitGapSimulatedTick(), 750);
    }
    logger.warn({ missing }, "Forex live: some pairs missing from feed — simulating gap symbols only");
  }

  private async bootstrapExternal(
    fetcher: () => Promise<Map<string, number>>,
    intervalMs: number,
    name: string
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
      logger.info({ source: name, quotes: map.size }, "Forex live rates active");
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
          void this.bootstrapExternal(fetcher, intervalMs, name);
        }
      }, 30_000);
    }
  }
}
