import { EventEmitter } from "node:events";
import { FOREX_PAIRS } from "../config/symbols";
import { logger } from "../utils/logger";

export interface ForexTick {
  symbol: string;
  price: number;
  timestamp: number;
  source: "forex";
}

const HISTORY_MAX_TICKS_PER_SYMBOL = 7200; // ~1 hour at 2 ticks/sec — enough for many 10m/5m/1m candles

/** Simulated live ticks for top forex pairs (demo / education). */
export class ForexFeed extends EventEmitter {
  private readonly latest = new Map<string, ForexTick>();
  private readonly history = new Map<string, ForexTick[]>();
  private timer: ReturnType<typeof setInterval> | null = null;

  start() {
    if (this.timer) {
      return;
    }
    const now = Date.now();
    for (const p of FOREX_PAIRS) {
      const tick: ForexTick = {
        symbol: p.symbol,
        price: p.base,
        timestamp: now,
        source: "forex"
      };
      this.latest.set(p.symbol, tick);
      this.history.set(p.symbol, [tick]);
    }
    this.timer = setInterval(() => this.emitTick(), 500);
    logger.info({ pairs: FOREX_PAIRS.length }, "Forex feed started (simulated)");
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  snapshot(): ForexTick[] {
    return [...this.latest.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  /** Historical ticks for chart: returns last N ticks for symbol, or per-symbol when no symbol. */
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

  private emitTick() {
    const now = Date.now();
    for (const p of FOREX_PAIRS) {
      const prev = this.latest.get(p.symbol)?.price ?? p.base;
      const vol = p.symbol.includes("JPY") || p.symbol.startsWith("USD") && prev > 50 ? 0.00012 : 0.00008;
      const drift = (Math.random() - 0.5) * 2 * vol;
      let next = prev * (1 + drift);
      const min = p.base * 0.985;
      const max = p.base * 1.015;
      next = Math.min(max, Math.max(min, next));
      const decimals = next >= 20 || (next >= 1 && p.symbol.includes("JPY")) ? 3 : next >= 5 ? 4 : 5;
      const price = Number(next.toFixed(decimals));
      const tick: ForexTick = { symbol: p.symbol, price, timestamp: now, source: "forex" };
      this.latest.set(p.symbol, tick);
      const buf = this.history.get(p.symbol) ?? [];
      buf.push(tick);
      if (buf.length > HISTORY_MAX_TICKS_PER_SYMBOL) {
        buf.shift();
      }
      this.history.set(p.symbol, buf);
      this.emit("tick", tick);
    }
  }
}
