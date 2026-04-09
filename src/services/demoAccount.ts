import { BINARY_WIN_PAYOUT_MULTIPLIER } from "../config/binary";
import { DEFAULT_DEMO_BALANCE_INR } from "../config/demo";

export type TradeSide = "buy" | "sell";
export type BinaryDirection = "up" | "down";

export interface DemoTrade {
  id: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  entryPrice: number;
  openedAt: string;
  status: "open" | "closed";
  closePrice?: number;
  closedAt?: string;
  pnl?: number;
  /** Binary option: bet direction. */
  direction?: BinaryDirection;
  /** Binary option: expiry timestamp (ms). Trade auto-settles at this time. */
  expiryAt?: number;
  /** Binary option: timeframe in seconds (matches TRADE_TIMEFRAMES_SEC). */
  timeframeSeconds?: number;
}

export class DemoAccount {
  private readonly trades: DemoTrade[] = [];
  private cash: number;

  constructor(startingBalance = DEFAULT_DEMO_BALANCE_INR) {
    this.cash = startingBalance;
  }

  get balance() {
    return this.cash;
  }

  setBalance(amount: number) {
    if (Number.isFinite(amount) && amount >= 0) {
      this.cash = amount;
    }
  }

  /** Credit live balance after on-chain USDT deposit (app-side). */
  creditDeposit(amount: number) {
    if (Number.isFinite(amount) && amount > 0) {
      this.cash += amount;
    }
  }

  /** Hold USDT for a pending withdrawal (returns false if insufficient). */
  debitForWithdrawal(amount: number): boolean {
    if (!Number.isFinite(amount) || amount <= 0 || this.cash < amount) {
      return false;
    }
    this.cash -= amount;
    return true;
  }

  /** Refund if withdrawal rejected / cancelled. */
  creditWithdrawalRefund(amount: number) {
    if (Number.isFinite(amount) && amount > 0) {
      this.cash += amount;
    }
  }

  openTrade(
    input: {
      symbol: string;
      side: TradeSide;
      quantity: number;
      entryPrice: number;
      direction?: BinaryDirection;
      expiryAt?: number;
      timeframeSeconds?: number;
      /** When stake already debited in DB ledger (live wallet). */
      skipBinaryStakeDebit?: boolean;
      tradeId?: string;
    }
  ) {
    const isBinary = input.direction === "up" || input.direction === "down";
    const skipStake = Boolean(input.skipBinaryStakeDebit && isBinary);
    if (isBinary && !skipStake && (input.quantity <= 0 || this.cash + 1e-9 < input.quantity)) {
      return null;
    }
    if (isBinary && !skipStake) {
      this.cash = Number((this.cash - input.quantity).toFixed(8));
      if (this.cash < 0 && this.cash > -1e-8) {
        this.cash = 0;
      }
    }

    /** Spot buy/sell: no leverage — full notional (qty × price) must be paid from balance. */
    if (!isBinary) {
      if (this.cash <= 1e-10) {
        return null;
      }
      const notional = input.quantity * input.entryPrice;
      if (!Number.isFinite(notional) || notional <= 0) {
        return null;
      }
      if (this.cash + 1e-10 < notional) {
        return null;
      }
      this.cash -= notional;
    }

    const trade: DemoTrade = {
      id: input.tradeId ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol: input.symbol.toUpperCase(),
      side: input.side,
      quantity: input.quantity,
      entryPrice: input.entryPrice,
      openedAt: new Date().toISOString(),
      status: "open",
      ...(input.direction && { direction: input.direction }),
      ...(input.expiryAt != null && { expiryAt: input.expiryAt }),
      ...(input.timeframeSeconds != null && { timeframeSeconds: input.timeframeSeconds })
    };

    this.trades.unshift(trade);
    return trade;
  }

  /** Win: wallet + stake×1.8 (e.g. 100→180). Loss: stake already debited at open. */
  settleExpiredTrade(id: string, closePrice: number): DemoTrade | null {
    const trade = this.trades.find((t) => t.id === id);
    if (!trade || trade.status !== "open" || trade.direction == null || trade.expiryAt == null) {
      return null;
    }

    const win =
      trade.direction === "up"
        ? closePrice > trade.entryPrice
        : closePrice < trade.entryPrice;
    const pnl = win
      ? Number((trade.quantity * (BINARY_WIN_PAYOUT_MULTIPLIER - 1)).toFixed(2))
      : -trade.quantity;
    if (win) {
      this.cash += trade.quantity * BINARY_WIN_PAYOUT_MULTIPLIER;
    }

    trade.status = "closed";
    trade.closePrice = closePrice;
    trade.closedAt = new Date().toISOString();
    trade.pnl = Number(pnl.toFixed(2));
    return trade;
  }

  /** Close binary trade and set PnL only (balance already updated via wallet ledger). */
  settleExpiredTradeRecordOnly(id: string, closePrice: number): DemoTrade | null {
    const trade = this.trades.find((t) => t.id === id);
    if (!trade || trade.status !== "open" || trade.direction == null || trade.expiryAt == null) {
      return null;
    }
    const win =
      trade.direction === "up"
        ? closePrice > trade.entryPrice
        : closePrice < trade.entryPrice;
    const pnl = win
      ? Number((trade.quantity * (BINARY_WIN_PAYOUT_MULTIPLIER - 1)).toFixed(2))
      : -trade.quantity;
    trade.status = "closed";
    trade.closePrice = closePrice;
    trade.closedAt = new Date().toISOString();
    trade.pnl = Number(pnl.toFixed(2));
    return trade;
  }

  /** Returns open trades that have expired (binary only). */
  getExpiredOpenTrades(nowMs: number): DemoTrade[] {
    return this.trades.filter(
      (t) =>
        t.status === "open" &&
        t.expiryAt != null &&
        t.expiryAt <= nowMs
    );
  }

  closeTrade(id: string, closePrice: number) {
    const trade = this.trades.find((item) => item.id === id);
    if (!trade || trade.status === "closed") {
      return null;
    }

    const pnl =
      trade.side === "buy"
        ? (closePrice - trade.entryPrice) * trade.quantity
        : (trade.entryPrice - closePrice) * trade.quantity;

    const isSpot = trade.direction == null;
    if (isSpot) {
      if (trade.side === "buy") {
        this.cash += trade.quantity * closePrice;
      } else {
        this.cash += trade.quantity * (2 * trade.entryPrice - closePrice);
      }
    }

    trade.status = "closed";
    trade.closePrice = closePrice;
    trade.closedAt = new Date().toISOString();
    trade.pnl = Number(pnl.toFixed(2));

    return trade;
  }

  snapshot(latestPrices: Array<{ symbol: string; price: number }>) {
    const openTrades = this.trades.filter((trade) => trade.status === "open");

    let positionMtm = 0;
    let unrealizedPnl = 0;
    for (const trade of openTrades) {
      const market = latestPrices.find((item) => item.symbol === trade.symbol);
      if (!market) {
        continue;
      }
      const m = market.price;
      if (trade.direction === "up" || trade.direction === "down") {
        positionMtm += trade.quantity;
        continue;
      }
      if (trade.side === "buy") {
        positionMtm += trade.quantity * m;
        unrealizedPnl += (m - trade.entryPrice) * trade.quantity;
      } else {
        positionMtm += trade.quantity * (2 * trade.entryPrice - m);
        unrealizedPnl += (trade.entryPrice - m) * trade.quantity;
      }
    }

    const realizedPnl = this.trades
      .filter((trade) => trade.status === "closed" && typeof trade.pnl === "number")
      .reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);

    const equity = Number((this.cash + positionMtm).toFixed(2));

    return {
      balance: this.balance,
      equity,
      unrealizedPnl: Number(unrealizedPnl.toFixed(2)),
      realizedPnl: Number(realizedPnl.toFixed(2)),
      openTrades,
      tradeCount: this.trades.length
    };
  }

  listTrades() {
    return [...this.trades];
  }
}
