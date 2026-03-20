import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { logger } from "../utils/logger";

export interface MarketTick {
  symbol: string;
  price: number;
  timestamp: number;
  source: "binance";
}

type SocketState = {
  socket?: WebSocket;
  retryCount: number;
  stopped: boolean;
};

export class MarketFeed extends EventEmitter {
  private readonly latest = new Map<string, MarketTick>();
  private readonly sockets = new Map<string, SocketState>();

  constructor(private readonly baseUrl: string) {
    super();
  }

  start(symbols: string[]) {
    for (const symbol of symbols) {
      if (!this.sockets.has(symbol)) {
        this.sockets.set(symbol, { retryCount: 0, stopped: false });
        this.connect(symbol);
      }
    }
  }

  stop() {
    for (const state of this.sockets.values()) {
      state.stopped = true;
      state.socket?.close();
    }
    this.sockets.clear();
  }

  snapshot() {
    return [...this.latest.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  getTick(symbol: string) {
    return this.latest.get(symbol.toUpperCase());
  }

  private connect(symbol: string) {
    const state = this.sockets.get(symbol);
    if (!state || state.stopped) {
      return;
    }

    const streamUrl = `${this.baseUrl.replace(/\/$/, "")}/${symbol.toLowerCase()}@trade`;
    const socket = new WebSocket(streamUrl);
    state.socket = socket;

    socket.on("open", () => {
      state.retryCount = 0;
      logger.info({ symbol, streamUrl }, "Market feed connected");
    });

    socket.on("message", (raw) => {
      try {
        const payload = JSON.parse(raw.toString()) as { p?: string; T?: number };
        const price = Number(payload.p);
        if (!Number.isFinite(price)) {
          return;
        }

        const tick: MarketTick = {
          symbol: symbol.toUpperCase(),
          price,
          timestamp: payload.T ?? Date.now(),
          source: "binance"
        };

        this.latest.set(tick.symbol, tick);
        this.emit("tick", tick);
      } catch (error) {
        logger.warn({ error, symbol }, "Invalid market tick received");
      }
    });

    socket.on("close", () => {
      logger.warn({ symbol }, "Market feed closed");
      this.scheduleReconnect(symbol);
    });

    socket.on("error", (error) => {
      logger.error({ error, symbol }, "Market feed error");
      socket.close();
    });
  }

  private scheduleReconnect(symbol: string) {
    const state = this.sockets.get(symbol);
    if (!state || state.stopped) {
      return;
    }

    const delayMs = Math.min(30_000, 1_000 * 2 ** state.retryCount);
    state.retryCount += 1;

    setTimeout(() => {
      if (!state.stopped) {
        this.connect(symbol);
      }
    }, delayMs);
  }
}
