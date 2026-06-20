import { dbAll, dbRun, initAppDb } from "../db/appDb";
import { DemoTrade } from "./demoAccount";
import { logger } from "../utils/logger";

export type TradeWalletType = "demo" | "live" | "bonus";

type UserTradeRow = {
  id: unknown;
  user_id: unknown;
  wallet_type: unknown;
  symbol: unknown;
  side: unknown;
  quantity: unknown;
  entry_price: unknown;
  opened_at: unknown;
  status: unknown;
  close_price: unknown;
  closed_at: unknown;
  pnl: unknown;
  direction: unknown;
  expiry_at: unknown;
  timeframe_seconds: unknown;
};

const DEFAULT_LIST_LIMIT = 500;

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowToTrade(row: UserTradeRow): DemoTrade {
  const directionRaw = row.direction == null ? undefined : String(row.direction).trim().toLowerCase();
  const direction =
    directionRaw === "up" || directionRaw === "down" ? (directionRaw as "up" | "down") : undefined;
  const expiryAt = row.expiry_at == null ? undefined : num(row.expiry_at);
  const timeframeSeconds = row.timeframe_seconds == null ? undefined : num(row.timeframe_seconds);
  const statusRaw = String(row.status ?? "closed").toLowerCase();
  const trade: DemoTrade = {
    id: String(row.id ?? ""),
    symbol: String(row.symbol ?? "").toUpperCase(),
    side: String(row.side ?? "buy").toLowerCase() === "sell" ? "sell" : "buy",
    quantity: num(row.quantity),
    entryPrice: num(row.entry_price),
    openedAt: String(row.opened_at ?? ""),
    status: statusRaw === "open" ? "open" : "closed"
  };
  if (direction) trade.direction = direction;
  if (expiryAt != null && expiryAt > 0) trade.expiryAt = expiryAt;
  if (timeframeSeconds != null && timeframeSeconds > 0) trade.timeframeSeconds = timeframeSeconds;
  if (row.close_price != null) trade.closePrice = num(row.close_price);
  if (row.closed_at != null) trade.closedAt = String(row.closed_at);
  if (row.pnl != null) trade.pnl = num(row.pnl);
  return trade;
}

export async function persistOpenedTrade(
  userId: string,
  wallet: TradeWalletType,
  trade: DemoTrade
): Promise<void> {
  await initAppDb();
  try {
    await dbRun(
      `INSERT INTO user_trades (
        id, user_id, wallet_type, symbol, side, quantity, entry_price, opened_at, status,
        close_price, closed_at, pnl, direction, expiry_at, timeframe_seconds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
      [
        trade.id,
        userId,
        wallet,
        trade.symbol,
        trade.side,
        trade.quantity,
        trade.entryPrice,
        trade.openedAt,
        trade.status,
        trade.direction ?? null,
        trade.expiryAt ?? null,
        trade.timeframeSeconds ?? null
      ]
    );
  } catch (e) {
    logger.warn({ err: e, userId, tradeId: trade.id, wallet }, "persist opened trade failed");
  }
}

export async function persistClosedTrade(
  userId: string,
  wallet: TradeWalletType,
  trade: DemoTrade
): Promise<void> {
  await initAppDb();
  try {
    await dbRun(
      `UPDATE user_trades SET
        status = 'closed',
        close_price = ?,
        closed_at = ?,
        pnl = ?
       WHERE id = ? AND user_id = ? AND wallet_type = ?`,
      [
        trade.closePrice ?? null,
        trade.closedAt ?? new Date().toISOString(),
        trade.pnl ?? null,
        trade.id,
        userId,
        wallet
      ]
    );
  } catch (e) {
    logger.warn({ err: e, userId, tradeId: trade.id, wallet }, "persist closed trade failed");
  }
}

export async function listTradesForUserWallet(
  userId: string,
  wallet: TradeWalletType,
  limit = DEFAULT_LIST_LIMIT
): Promise<DemoTrade[]> {
  await initAppDb();
  try {
    const rows = await dbAll<UserTradeRow>(
      `SELECT id, user_id, wallet_type, symbol, side, quantity, entry_price, opened_at, status,
              close_price, closed_at, pnl, direction, expiry_at, timeframe_seconds
       FROM user_trades
       WHERE user_id = ? AND wallet_type = ?
       ORDER BY opened_at DESC
       LIMIT ?`,
      [userId, wallet, limit]
    );
    return (Array.isArray(rows) ? rows : []).map(rowToTrade).filter((t) => t.id);
  } catch (e) {
    logger.warn({ err: e, userId, wallet }, "list user trades failed");
    return [];
  }
}

export async function listOpenTradesForUserWallet(
  userId: string,
  wallet: TradeWalletType
): Promise<DemoTrade[]> {
  await initAppDb();
  try {
    const rows = await dbAll<UserTradeRow>(
      `SELECT id, user_id, wallet_type, symbol, side, quantity, entry_price, opened_at, status,
              close_price, closed_at, pnl, direction, expiry_at, timeframe_seconds
       FROM user_trades
       WHERE user_id = ? AND wallet_type = ? AND status = 'open'
       ORDER BY opened_at DESC`,
      [userId, wallet]
    );
    return (Array.isArray(rows) ? rows : []).map(rowToTrade).filter((t) => t.id);
  } catch (e) {
    logger.warn({ err: e, userId, wallet }, "list open user trades failed");
    return [];
  }
}

/** Distinct users with expired open trades still in DB (for auto-settle after restart). */
export async function listUsersWithExpiredOpenTrades(
  nowMs: number
): Promise<Array<{ userId: string; wallet: TradeWalletType }>> {
  await initAppDb();
  try {
    const rows = await dbAll<{ user_id: unknown; wallet_type: unknown }>(
      `SELECT DISTINCT user_id, wallet_type FROM user_trades
       WHERE status = 'open' AND expiry_at IS NOT NULL AND expiry_at <= ?`,
      [nowMs]
    );
    const out: Array<{ userId: string; wallet: TradeWalletType }> = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const userId = String(row.user_id ?? "").trim();
      const w = String(row.wallet_type ?? "").trim().toLowerCase();
      if (!userId) continue;
      if (w === "demo" || w === "live" || w === "bonus") {
        out.push({ userId, wallet: w });
      }
    }
    return out;
  } catch (e) {
    logger.warn({ err: e }, "list expired open trades failed");
    return [];
  }
}
