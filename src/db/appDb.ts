import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import sqlite3 from "sqlite3";
import { env } from "../config/env";
import { LEVEL_INCOME_DEPTH, LEVEL_INCOME_FRACTION } from "../config/referral";

/** Repo root (same idea as `.env` next to `src/` / `dist/`) — do not use `process.cwd()` or SQLite lands in the wrong folder when PM2/systemd cwd ≠ project dir. */
const APP_ROOT = path.resolve(__dirname, "..", "..");

const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomSelfReferralCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += REF_CHARS[crypto.randomInt(REF_CHARS.length)];
  }
  return s;
}

const mysqlMode = Boolean(env.MYSQL_DATABASE?.trim());

let pool: mysql.Pool | null = null;
let sqliteDb: sqlite3.Database | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.MYSQL_HOST,
      port: env.MYSQL_PORT,
      user: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD,
      database: env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      /** Avoid hanging forever; ETIMEDOUT still means host/port/firewall/MySQL down — fix `.env` / XAMPP. */
      connectTimeout: 15_000
    });
  }
  return pool;
}

function getSqlite(): sqlite3.Database {
  if (!sqliteDb) {
    const dataDir = path.join(APP_ROOT, "data");
    fs.mkdirSync(dataDir, { recursive: true });
    sqliteDb = new sqlite3.Database(path.join(dataDir, "app.db"));
  }
  return sqliteDb;
}

export function isMysqlMode(): boolean {
  return mysqlMode;
}

/**
 * Where `users` / `wallets` rows are stored.
 * If `kind` is `sqlite`, data is **not** in MySQL — open this file (absolute path on the server), not phpMyAdmin.
 */
export function getDatabaseInfo(): { kind: "mysql" | "sqlite"; database?: string; file?: string } {
  if (mysqlMode) {
    return { kind: "mysql", database: env.MYSQL_DATABASE ?? "" };
  }
  const file = path.join(APP_ROOT, "data", "app.db");
  return { kind: "sqlite", file: path.resolve(file) };
}

export async function dbRun(
  sql: string,
  params: unknown[] = []
): Promise<{ affectedRows: number; insertId: number }> {
  if (mysqlMode) {
    const [result] = await getPool().execute(sql, params as (string | number | null)[]);
    const h = result as mysql.ResultSetHeader;
    return { affectedRows: h.affectedRows ?? 0, insertId: Number(h.insertId) || 0 };
  }
  return new Promise((resolve, reject) => {
    getSqlite().run(sql, params as [], function cb(err) {
      if (err) reject(err);
      else resolve({ affectedRows: this.changes, insertId: this.lastID });
    });
  });
}

export async function dbGet<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  if (mysqlMode) {
    const [rows] = await getPool().execute(sql, params as (string | number | null)[]);
    const arr = rows as mysql.RowDataPacket[];
    return (arr[0] as T) ?? undefined;
  }
  return new Promise((resolve, reject) => {
    getSqlite().get(sql, params as [], (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });
}

export async function dbAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (mysqlMode) {
    const [rows] = await getPool().execute(sql, params as (string | number | null)[]);
    return rows as T[];
  }
  return new Promise((resolve, reject) => {
    getSqlite().all(sql, params as [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

const USERS_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL,
    self_referral_code TEXT UNIQUE,
    referral_code TEXT,
    phone_country_code TEXT,
    phone_local TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    last_login_at TEXT NULL,
    is_blocked INTEGER NOT NULL DEFAULT 0,
    UNIQUE(phone_country_code, phone_local)
  )
`;

const USERS_SQL_MYSQL = `
  CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(255) NOT NULL,
    created_at VARCHAR(64) NOT NULL,
    self_referral_code VARCHAR(32) NULL,
    referral_code VARCHAR(32) NULL,
    phone_country_code VARCHAR(8) NULL,
    phone_local VARCHAR(20) NULL,
    role VARCHAR(16) NOT NULL DEFAULT 'user',
    last_login_at VARCHAR(64) NULL,
    is_blocked TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uk_users_self_referral (self_referral_code),
    UNIQUE KEY uk_users_phone (phone_country_code, phone_local)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const DEPOSITS_SQL = `
  CREATE TABLE IF NOT EXISTS deposits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    amount REAL NOT NULL,
    wallet_provider TEXT NOT NULL,
    admin_to_address TEXT NOT NULL,
    token_contract TEXT NOT NULL,
    chain_id INTEGER NOT NULL DEFAULT 56,
    from_address TEXT,
    tx_hash TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const DEPOSITS_SQL_MYSQL = `
  CREATE TABLE IF NOT EXISTS deposits (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    amount DOUBLE NOT NULL,
    wallet_provider VARCHAR(128) NOT NULL,
    admin_to_address VARCHAR(128) NOT NULL,
    token_contract VARCHAR(128) NOT NULL,
    chain_id INT NOT NULL DEFAULT 56,
    from_address VARCHAR(128) NULL,
    tx_hash VARCHAR(128) NULL,
    status VARCHAR(32) NOT NULL,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    INDEX idx_deposits_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const WITHDRAWALS_SQL = `
  CREATE TABLE IF NOT EXISTS withdrawals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    amount REAL NOT NULL,
    to_address TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const WITHDRAWALS_SQL_MYSQL = `
  CREATE TABLE IF NOT EXISTS withdrawals (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    amount DOUBLE NOT NULL,
    to_address VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    INDEX idx_withdrawals_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const SQLITE_PRAGMAS = [`PRAGMA foreign_keys = ON`];

const WALLETS_SQL = `
  CREATE TABLE IF NOT EXISTS wallets (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance REAL NOT NULL DEFAULT 0,
    demo_balance REAL NOT NULL DEFAULT 10000,
    updated_at TEXT NOT NULL
  )
`;

const WALLETS_SQL_MYSQL = `
  CREATE TABLE IF NOT EXISTS wallets (
    user_id VARCHAR(64) NOT NULL PRIMARY KEY,
    balance DOUBLE NOT NULL DEFAULT 0,
    demo_balance DOUBLE NOT NULL DEFAULT 10000,
    updated_at VARCHAR(64) NOT NULL,
    CONSTRAINT fk_wallets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const TRANSACTIONS_SQL = `
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    txn_type TEXT NOT NULL,
    amount REAL NOT NULL,
    before_balance REAL NOT NULL,
    after_balance REAL NOT NULL,
    reference_id TEXT,
    created_at TEXT NOT NULL
  )
`;

const USER_INVESTMENTS_SQL = `
  CREATE TABLE IF NOT EXISTS user_investments (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    principal REAL NOT NULL DEFAULT 0,
    locked_until TEXT,
    last_yield_date TEXT,
    last_monthly_yield_ym TEXT NULL
  )
`;

const USER_INVESTMENTS_SQL_MYSQL = `
  CREATE TABLE IF NOT EXISTS user_investments (
    user_id VARCHAR(64) NOT NULL PRIMARY KEY,
    principal DOUBLE NOT NULL DEFAULT 0,
    locked_until VARCHAR(64) NULL,
    last_yield_date VARCHAR(32) NULL,
    last_monthly_yield_ym VARCHAR(7) NULL,
    CONSTRAINT fk_invest_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const TRANSACTIONS_SQL_MYSQL = `
  CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    txn_type VARCHAR(64) NOT NULL,
    amount DOUBLE NOT NULL,
    before_balance DOUBLE NOT NULL,
    after_balance DOUBLE NOT NULL,
    reference_id VARCHAR(128) NULL,
    created_at VARCHAR(64) NOT NULL,
    INDEX idx_txn_user (user_id),
    INDEX idx_txn_created (created_at),
    CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** Chart history: persist ticks so all candles show after restart. */
const MARKET_TICKS_SQL = `
  CREATE TABLE IF NOT EXISTS market_ticks (
    symbol TEXT NOT NULL,
    price REAL NOT NULL,
    timestamp INTEGER NOT NULL
  )
`;
const MARKET_TICKS_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_market_ticks_sym_ts ON market_ticks(symbol, timestamp)`;

const MARKET_TICKS_SQL_MYSQL = `
  CREATE TABLE IF NOT EXISTS market_ticks (
    symbol VARCHAR(32) NOT NULL,
    price DOUBLE NOT NULL,
    timestamp BIGINT NOT NULL,
    INDEX idx_market_ticks_sym_ts (symbol, timestamp)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** Closed OHLC bars (persisted when each UTC bucket completes). Ticks stay in market_ticks for fine history. */
const CHART_CANDLES_SQL = `
  CREATE TABLE IF NOT EXISTS chart_candles (
    symbol TEXT NOT NULL,
    timeframe_sec INTEGER NOT NULL,
    bucket_start_ms INTEGER NOT NULL,
    open_price REAL NOT NULL,
    high_price REAL NOT NULL,
    low_price REAL NOT NULL,
    close_price REAL NOT NULL,
    PRIMARY KEY (symbol, timeframe_sec, bucket_start_ms)
  )
`;
const CHART_CANDLES_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_chart_candles_sym_tf_ts ON chart_candles(symbol, timeframe_sec, bucket_start_ms)`;

const CHART_CANDLES_SQL_MYSQL = `
  CREATE TABLE IF NOT EXISTS chart_candles (
    symbol VARCHAR(32) NOT NULL,
    timeframe_sec INT NOT NULL,
    bucket_start_ms BIGINT NOT NULL,
    open_price DOUBLE NOT NULL,
    high_price DOUBLE NOT NULL,
    low_price DOUBLE NOT NULL,
    close_price DOUBLE NOT NULL,
    PRIMARY KEY (symbol, timeframe_sec, bucket_start_ms),
    INDEX idx_chart_candles_lookup (symbol, timeframe_sec, bucket_start_ms)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export interface ChartCandleRow {
  symbol: string;
  timeframe_sec: number;
  bucket_start_ms: number;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
}

export interface MarketTickRow {
  symbol: string;
  price: number;
  timestamp: number;
}

/** Some MySQL/MariaDB builds reject `LIMIT ?` in prepared statements (`ER_WRONG_ARGUMENTS` / 1210). Inline after clamp. */
function safeMysqlLimit(limit: number, max: number): number {
  const x = Math.trunc(Number(limit));
  if (!Number.isFinite(x)) return 1;
  return Math.min(max, Math.max(1, x));
}

/** Insert ticks for chart history (batch). */
export async function saveMarketTicks(ticks: MarketTickRow[]): Promise<void> {
  if (ticks.length === 0) return;
  if (mysqlMode) {
    const pool = getPool();
    const values = ticks.map((t) => [t.symbol, t.price, t.timestamp]);
    const placeholders = values.map(() => "(?, ?, ?)").join(", ");
    const flat = values.flat();
    await pool.execute(
      `INSERT INTO market_ticks (symbol, price, timestamp) VALUES ${placeholders}`,
      flat
    );
    return;
  }
  const placeholders = ticks.map(() => "(?, ?, ?)").join(", ");
  const flat = ticks.flatMap((t) => [t.symbol, t.price, t.timestamp]);
  await dbRun(
    `INSERT INTO market_ticks (symbol, price, timestamp) VALUES ${placeholders}`,
    flat
  );
}

/** Read last N ticks from DB (per symbol or one symbol), ascending timestamp. */
export async function getMarketTicks(symbol: string | undefined, limit: number): Promise<MarketTickRow[]> {
  const cap = Math.min(limit, 50000);
  if (symbol) {
    const symU = symbol.trim().toUpperCase();
    if (mysqlMode) {
      const lim = safeMysqlLimit(cap, 50000);
      const sql = `SELECT symbol, price, timestamp FROM market_ticks WHERE symbol = ? ORDER BY timestamp DESC LIMIT ${lim}`;
      const rows = await dbAll<MarketTickRow>(sql, [symU]);
      return rows.reverse();
    }
    const sql = `SELECT symbol, price, timestamp FROM market_ticks WHERE symbol = ? ORDER BY timestamp DESC LIMIT ?`;
    const rows = await dbAll<MarketTickRow>(sql, [symU, cap]);
    return rows.reverse();
  }
  const symbols = await dbAll<{ symbol: string }>(
    mysqlMode ? "SELECT DISTINCT symbol FROM market_ticks" : "SELECT DISTINCT symbol FROM market_ticks"
  );
  const out: MarketTickRow[] = [];
  const perSymbol = Math.max(1, Math.floor(cap / Math.max(1, symbols.length)));
  for (const { symbol: s } of symbols) {
    if (mysqlMode) {
      const lim = safeMysqlLimit(perSymbol, 50000);
      const sql = `SELECT symbol, price, timestamp FROM market_ticks WHERE symbol = ? ORDER BY timestamp DESC LIMIT ${lim}`;
      const rows = await dbAll<MarketTickRow>(sql, [s]);
      out.push(...rows.reverse());
      continue;
    }
    const sql = `SELECT symbol, price, timestamp FROM market_ticks WHERE symbol = ? ORDER BY timestamp DESC LIMIT ?`;
    const rows = await dbAll<MarketTickRow>(sql, [s, perSymbol]);
    out.push(...rows.reverse());
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

function runSqliteChain(db: sqlite3.Database, statements: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let i = 0;
    const runNext = () => {
      if (i >= statements.length) {
        resolve();
        return;
      }
      db.run(statements[i++], (err) => {
        if (err) reject(err);
        else runNext();
      });
    };
    runNext();
  });
}

async function migrateWalletsDemoBalance(): Promise<void> {
  if (mysqlMode) {
    const dbName = env.MYSQL_DATABASE?.trim();
    if (!dbName) return;
    const row = await dbGet<{ n: number }>(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'wallets' AND COLUMN_NAME = 'demo_balance'`,
      [dbName]
    );
    if (Number(row?.n) > 0) return;
    try {
      await dbRun(
        "ALTER TABLE wallets ADD COLUMN demo_balance DOUBLE NOT NULL DEFAULT 10000 AFTER balance"
      );
    } catch {
      await dbRun("ALTER TABLE wallets ADD COLUMN demo_balance DOUBLE NOT NULL DEFAULT 10000");
    }
    return;
  }
  const cols = await dbAll<{ name: string }>("PRAGMA table_info(wallets)");
  if (cols.some((c) => c.name === "demo_balance")) return;
  await dbRun("ALTER TABLE wallets ADD COLUMN demo_balance REAL NOT NULL DEFAULT 10000");
}

async function migrateUsersReferral(): Promise<void> {
  if (mysqlMode) {
    const dbName = env.MYSQL_DATABASE?.trim();
    if (!dbName) return;
    const col = async (name: string) => {
      const row = await dbGet<{ n: number }>(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
        [dbName, name]
      );
      return Number(row?.n) > 0;
    };
    if (!(await col("self_referral_code"))) {
      await dbRun("ALTER TABLE users ADD COLUMN self_referral_code VARCHAR(32) NULL");
    }
    if (!(await col("referral_code"))) {
      await dbRun("ALTER TABLE users ADD COLUMN referral_code VARCHAR(32) NULL");
    }
    try {
      await dbRun("CREATE UNIQUE INDEX uk_users_self_referral ON users (self_referral_code)");
    } catch {
      /* exists */
    }
  } else {
    const cols = await dbAll<{ name: string }>("PRAGMA table_info(users)");
    if (!cols.some((c) => c.name === "self_referral_code")) {
      await dbRun("ALTER TABLE users ADD COLUMN self_referral_code TEXT");
    }
    if (!cols.some((c) => c.name === "referral_code")) {
      await dbRun("ALTER TABLE users ADD COLUMN referral_code TEXT");
    }
    try {
      await dbRun("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_self_referral ON users(self_referral_code)");
    } catch {
      /* ignore */
    }
  }

  const missing = await dbAll<{ id: string }>(
    mysqlMode
      ? "SELECT id FROM users WHERE self_referral_code IS NULL OR self_referral_code = ''"
      : "SELECT id FROM users WHERE self_referral_code IS NULL OR TRIM(COALESCE(self_referral_code,'')) = ''"
  );
  for (const { id } of missing) {
    let code = "";
    for (let a = 0; a < 120; a++) {
      code = randomSelfReferralCode();
      const taken = await dbGet<{ id: string }>(
        "SELECT id FROM users WHERE UPPER(self_referral_code) = UPPER(?) LIMIT 1",
        [code]
      );
      if (!taken) break;
    }
    if (!code) continue;
    await dbRun("UPDATE users SET self_referral_code = ? WHERE id = ?", [code, id]);
  }
}

async function migrateUserInvestments(): Promise<void> {
  if (mysqlMode) {
    await dbRun(USER_INVESTMENTS_SQL_MYSQL);
    return;
  }
  const t = await dbAll<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='user_investments'"
  );
  if (t.length > 0) return;
  await dbRun(USER_INVESTMENTS_SQL);
}

async function migrateUserInvestmentsMonthlyYm(): Promise<void> {
  if (mysqlMode) {
    const dbName = env.MYSQL_DATABASE?.trim();
    if (!dbName) return;
    const row = await dbGet<{ n: number }>(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_investments' AND COLUMN_NAME = 'last_monthly_yield_ym'`,
      [dbName]
    );
    if (Number(row?.n) > 0) return;
    try {
      await dbRun(
        "ALTER TABLE user_investments ADD COLUMN last_monthly_yield_ym VARCHAR(7) NULL AFTER last_yield_date"
      );
    } catch {
      await dbRun("ALTER TABLE user_investments ADD COLUMN last_monthly_yield_ym VARCHAR(7) NULL");
    }
    return;
  }
  const cols = await dbAll<{ name: string }>("PRAGMA table_info(user_investments)");
  if (!cols.length) return;
  if (cols.some((c) => c.name === "last_monthly_yield_ym")) return;
  await dbRun("ALTER TABLE user_investments ADD COLUMN last_monthly_yield_ym TEXT");
}

async function migrateMarketTicks(): Promise<void> {
  if (mysqlMode) {
    await getPool().execute(MARKET_TICKS_SQL_MYSQL);
    return;
  }
  const t = await dbAll<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='market_ticks'"
  );
  if (t.length > 0) return;
  await dbRun(MARKET_TICKS_SQL);
  await dbRun(MARKET_TICKS_INDEX_SQL);
}

async function migrateChartCandles(): Promise<void> {
  if (mysqlMode) {
    await getPool().execute(CHART_CANDLES_SQL_MYSQL);
    return;
  }
  const t = await dbAll<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='chart_candles'"
  );
  if (t.length > 0) return;
  await dbRun(CHART_CANDLES_SQL);
  await dbRun(CHART_CANDLES_INDEX_SQL);
}

/** Insert a finalized bar (idempotent if replayed). */
export async function saveChartCandle(row: ChartCandleRow): Promise<void> {
  await initAppDb();
  const sym = row.symbol.trim().toUpperCase();
  if (mysqlMode) {
    await getPool().execute(
      `INSERT IGNORE INTO chart_candles (symbol, timeframe_sec, bucket_start_ms, open_price, high_price, low_price, close_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sym, row.timeframe_sec, row.bucket_start_ms, row.open_price, row.high_price, row.low_price, row.close_price]
    );
    return;
  }
  await dbRun(
    `INSERT OR IGNORE INTO chart_candles (symbol, timeframe_sec, bucket_start_ms, open_price, high_price, low_price, close_price)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sym, row.timeframe_sec, row.bucket_start_ms, row.open_price, row.high_price, row.low_price, row.close_price]
  );
}

/** Upsert one bar (same PK) — used for the **current** bucket so GET /api/markets/candles can return it after chart switch. */
export async function upsertChartCandle(row: ChartCandleRow): Promise<void> {
  await initAppDb();
  const sym = row.symbol.trim().toUpperCase();
  const args = [sym, row.timeframe_sec, row.bucket_start_ms, row.open_price, row.high_price, row.low_price, row.close_price];
  if (mysqlMode) {
    await getPool().execute(
      `REPLACE INTO chart_candles (symbol, timeframe_sec, bucket_start_ms, open_price, high_price, low_price, close_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args
    );
    return;
  }
  await dbRun(
    `INSERT OR REPLACE INTO chart_candles (symbol, timeframe_sec, bucket_start_ms, open_price, high_price, low_price, close_price)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args
  );
}

/** Last N closed bars, oldest first (for chart bootstrap). */
export async function getChartCandles(symbol: string, timeframeSec: number, limit: number): Promise<ChartCandleRow[]> {
  const cap = Math.min(2000, Math.max(1, limit));
  const sym = symbol.trim().toUpperCase();
  const tfInt = Math.trunc(Number(timeframeSec));
  const tfArg = Number.isFinite(tfInt) ? tfInt : 60;
  if (mysqlMode) {
    const lim = safeMysqlLimit(cap, 2000);
    const [rows] = await getPool().execute(
      `SELECT symbol, timeframe_sec, bucket_start_ms, open_price, high_price, low_price, close_price
       FROM chart_candles WHERE symbol = ? AND timeframe_sec = ? ORDER BY bucket_start_ms DESC LIMIT ${lim}`,
      [sym, tfArg]
    );
    const list = (Array.isArray(rows) ? rows : []) as ChartCandleRow[];
    return list.slice().reverse();
  }
  const rows = await dbAll<ChartCandleRow>(
    `SELECT symbol, timeframe_sec, bucket_start_ms, open_price, high_price, low_price, close_price
     FROM chart_candles WHERE symbol = ? AND timeframe_sec = ? ORDER BY bucket_start_ms DESC LIMIT ?`,
    [sym, tfArg, cap]
  );
  return rows.slice().reverse();
}

async function migrateUsersWithdrawalTotp(): Promise<void> {
  if (mysqlMode) {
    const dbName = env.MYSQL_DATABASE?.trim();
    if (!dbName) return;
    const hasCol = async (name: string) => {
      const row = await dbGet<{ n: number }>(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
        [dbName, name]
      );
      return Number(row?.n) > 0;
    };
    if (!(await hasCol("withdrawal_totp_secret"))) {
      try {
        await dbRun("ALTER TABLE users ADD COLUMN withdrawal_totp_secret VARCHAR(128) NULL AFTER role");
      } catch {
        await dbRun("ALTER TABLE users ADD COLUMN withdrawal_totp_secret VARCHAR(128) NULL");
      }
    }
    if (!(await hasCol("withdrawal_totp_pending"))) {
      try {
        await dbRun(
          "ALTER TABLE users ADD COLUMN withdrawal_totp_pending VARCHAR(128) NULL AFTER withdrawal_totp_secret"
        );
      } catch {
        await dbRun("ALTER TABLE users ADD COLUMN withdrawal_totp_pending VARCHAR(128) NULL");
      }
    }
    return;
  }
  const cols = await dbAll<{ name: string }>("PRAGMA table_info(users)");
  if (!cols.some((c) => c.name === "withdrawal_totp_secret")) {
    await dbRun("ALTER TABLE users ADD COLUMN withdrawal_totp_secret TEXT");
  }
  if (!cols.some((c) => c.name === "withdrawal_totp_pending")) {
    await dbRun("ALTER TABLE users ADD COLUMN withdrawal_totp_pending TEXT");
  }
}

async function migrateUsersWithdrawalTpin(): Promise<void> {
  if (mysqlMode) {
    const dbName = env.MYSQL_DATABASE?.trim();
    if (!dbName) return;
    const hasCol = async (name: string) => {
      const row = await dbGet<{ n: number }>(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
        [dbName, name]
      );
      return Number(row?.n) > 0;
    };
    if (!(await hasCol("withdrawal_tpin_hash"))) {
      try {
        await dbRun(
          "ALTER TABLE users ADD COLUMN withdrawal_tpin_hash VARCHAR(128) NULL AFTER withdrawal_totp_pending"
        );
      } catch {
        await dbRun("ALTER TABLE users ADD COLUMN withdrawal_tpin_hash VARCHAR(128) NULL");
      }
    }
    if (!(await hasCol("withdrawal_tpin_salt"))) {
      try {
        await dbRun(
          "ALTER TABLE users ADD COLUMN withdrawal_tpin_salt VARCHAR(255) NULL AFTER withdrawal_tpin_hash"
        );
      } catch {
        await dbRun("ALTER TABLE users ADD COLUMN withdrawal_tpin_salt VARCHAR(255) NULL");
      }
    }
    return;
  }
  const cols = await dbAll<{ name: string }>("PRAGMA table_info(users)");
  if (!cols.some((c) => c.name === "withdrawal_tpin_hash")) {
    await dbRun("ALTER TABLE users ADD COLUMN withdrawal_tpin_hash TEXT");
  }
  if (!cols.some((c) => c.name === "withdrawal_tpin_salt")) {
    await dbRun("ALTER TABLE users ADD COLUMN withdrawal_tpin_salt TEXT");
  }
}

const APP_SETTINGS_SQLITE = `
  CREATE TABLE IF NOT EXISTS app_settings (
    setting_key TEXT PRIMARY KEY NOT NULL,
    setting_value TEXT NOT NULL
  )
`;

const APP_SETTINGS_MYSQL = `
  CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
    setting_value TEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const REFERRAL_LEVEL_SETTINGS_SQLITE = `
  CREATE TABLE IF NOT EXISTS referral_level_settings (
    level_num INTEGER NOT NULL PRIMARY KEY,
    percent_of_stake REAL NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
  )
`;

const REFERRAL_LEVEL_SETTINGS_MYSQL = `
  CREATE TABLE IF NOT EXISTS referral_level_settings (
    level_num INT NOT NULL PRIMARY KEY,
    percent_of_stake DOUBLE NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const INVESTMENT_ROI_LEVEL_DIST_SQLITE = `
  CREATE TABLE IF NOT EXISTS investment_roi_level_distribution (
    level_num INTEGER NOT NULL PRIMARY KEY,
    percent_of_gross_yield REAL NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1
  )
`;

const INVESTMENT_ROI_LEVEL_DIST_MYSQL = `
  CREATE TABLE IF NOT EXISTS investment_roi_level_distribution (
    level_num INT NOT NULL PRIMARY KEY,
    percent_of_gross_yield DOUBLE NOT NULL DEFAULT 0,
    enabled TINYINT(1) NOT NULL DEFAULT 1
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** Per-upline share of **gross** monthly investment ROI (principal × monthly %), admin-editable. */
async function migrateInvestmentRoiLevelDistribution(): Promise<void> {
  if (mysqlMode) {
    await getPool().execute(INVESTMENT_ROI_LEVEL_DIST_MYSQL);
  } else {
    await dbRun(INVESTMENT_ROI_LEVEL_DIST_SQLITE);
  }
  const levels = await dbAll<{ level_num: number }>(
    "SELECT level_num FROM investment_roi_level_distribution ORDER BY level_num"
  );
  const have = new Set(levels.map((l) => l.level_num));
  for (let lv = 1; lv <= LEVEL_INCOME_DEPTH; lv++) {
    if (!have.has(lv)) {
      await dbRun(
        "INSERT INTO investment_roi_level_distribution (level_num, percent_of_gross_yield, enabled) VALUES (?, 0, 1)",
        [lv]
      );
    }
  }
}

const SUPPORT_TICKETS_SQLITE = `
  CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`;

const SUPPORT_TICKETS_MYSQL = `
  CREATE TABLE IF NOT EXISTS support_tickets (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    subject VARCHAR(512) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'open',
    created_at VARCHAR(64) NOT NULL,
    INDEX idx_support_tickets_user (user_id),
    CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function migrateSupportTickets(): Promise<void> {
  if (mysqlMode) {
    await getPool().execute(SUPPORT_TICKETS_MYSQL);
  } else {
    await dbRun(SUPPORT_TICKETS_SQLITE);
    try {
      await dbRun(
        "CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id)"
      );
    } catch {
      /* ignore */
    }
  }
}

/** Master switch + per-level % of stake for MLM / referral (admin-editable). */
async function migrateReferralLevelAndAppSettings(): Promise<void> {
  if (mysqlMode) {
    await getPool().execute(APP_SETTINGS_MYSQL);
    await getPool().execute(REFERRAL_LEVEL_SETTINGS_MYSQL);
  } else {
    await dbRun(APP_SETTINGS_SQLITE);
    await dbRun(REFERRAL_LEVEL_SETTINGS_SQLITE);
  }

  const masterRow = await dbGet<{ c: number }>(
    "SELECT COUNT(*) AS c FROM app_settings WHERE setting_key = ?",
    ["referral_program_enabled"]
  );
  if (Number(masterRow?.c ?? 0) === 0) {
    await dbRun("INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)", [
      "referral_program_enabled",
      "1"
    ]);
  }

  const levels = await dbAll<{ level_num: number }>(
    "SELECT level_num FROM referral_level_settings ORDER BY level_num"
  );
  const have = new Set(levels.map((l) => l.level_num));
  for (let lv = 1; lv <= LEVEL_INCOME_DEPTH; lv++) {
    if (!have.has(lv)) {
      await dbRun(
        "INSERT INTO referral_level_settings (level_num, percent_of_stake, enabled) VALUES (?, ?, 1)",
        [lv, LEVEL_INCOME_FRACTION]
      );
    }
  }

  const roiKey = "investment_monthly_roi_fraction";
  const roiRow = await dbGet<{ c: number }>(
    "SELECT COUNT(*) AS c FROM app_settings WHERE setting_key = ?",
    [roiKey]
  );
  if (Number(roiRow?.c ?? 0) === 0) {
    await dbRun("INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)", [roiKey, "0.1"]);
  }

  await migrateInvestmentRoiLevelDistribution();
}

async function migrateUsersRole(): Promise<void> {
  if (mysqlMode) {
    const dbName = env.MYSQL_DATABASE?.trim();
    if (!dbName) return;
    const row = await dbGet<{ n: number }>(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`,
      [dbName]
    );
    if (Number(row?.n) > 0) return;
    try {
      await dbRun("ALTER TABLE users ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user' AFTER referral_code");
    } catch {
      await dbRun("ALTER TABLE users ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user'");
    }
    return;
  }
  const cols = await dbAll<{ name: string }>("PRAGMA table_info(users)");
  if (cols.some((c) => c.name === "role")) return;
  await dbRun("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}

/** Mobile signup: country dial code (e.g. 91, 92) + national number; UNIQUE pair. Legacy rows stay NULL. */
/** Login analytics + admin block flag (migrated on existing DBs). */
async function migrateUsersLoginAndBlock(): Promise<void> {
  if (mysqlMode) {
    const dbName = env.MYSQL_DATABASE?.trim();
    if (!dbName) return;
    const hasCol = async (name: string) => {
      const row = await dbGet<{ n: number }>(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
        [dbName, name]
      );
      return Number(row?.n) > 0;
    };
    if (!(await hasCol("last_login_at"))) {
      try {
        await dbRun("ALTER TABLE users ADD COLUMN last_login_at VARCHAR(64) NULL AFTER role");
      } catch {
        await dbRun("ALTER TABLE users ADD COLUMN last_login_at VARCHAR(64) NULL");
      }
    }
    if (!(await hasCol("is_blocked"))) {
      try {
        await dbRun(
          "ALTER TABLE users ADD COLUMN is_blocked TINYINT(1) NOT NULL DEFAULT 0 AFTER last_login_at"
        );
      } catch {
        await dbRun("ALTER TABLE users ADD COLUMN is_blocked TINYINT(1) NOT NULL DEFAULT 0");
      }
    }
    return;
  }
  const cols = await dbAll<{ name: string }>("PRAGMA table_info(users)");
  if (!cols.some((c) => c.name === "last_login_at")) {
    await dbRun("ALTER TABLE users ADD COLUMN last_login_at TEXT");
  }
  if (!cols.some((c) => c.name === "is_blocked")) {
    await dbRun("ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0");
  }
}

async function migrateUsersPhone(): Promise<void> {
  if (mysqlMode) {
    const dbName = env.MYSQL_DATABASE?.trim();
    if (!dbName) return;
    const hasCol = async (name: string) => {
      const row = await dbGet<{ n: number }>(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
        [dbName, name]
      );
      return Number(row?.n) > 0;
    };
    if (!(await hasCol("phone_country_code"))) {
      try {
        await dbRun("ALTER TABLE users ADD COLUMN phone_country_code VARCHAR(8) NULL AFTER referral_code");
      } catch {
        await dbRun("ALTER TABLE users ADD COLUMN phone_country_code VARCHAR(8) NULL");
      }
    }
    if (!(await hasCol("phone_local"))) {
      try {
        await dbRun(
          "ALTER TABLE users ADD COLUMN phone_local VARCHAR(20) NULL AFTER phone_country_code"
        );
      } catch {
        await dbRun("ALTER TABLE users ADD COLUMN phone_local VARCHAR(20) NULL");
      }
    }
    try {
      await dbRun("CREATE UNIQUE INDEX uk_users_phone ON users (phone_country_code, phone_local)");
    } catch {
      /* exists */
    }
    return;
  }
  const cols = await dbAll<{ name: string }>("PRAGMA table_info(users)");
  if (!cols.some((c) => c.name === "phone_country_code")) {
    await dbRun("ALTER TABLE users ADD COLUMN phone_country_code TEXT");
  }
  if (!cols.some((c) => c.name === "phone_local")) {
    await dbRun("ALTER TABLE users ADD COLUMN phone_local TEXT");
  }
  try {
    await dbRun(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_cc_local ON users(phone_country_code, phone_local)"
    );
  } catch {
    /* ignore */
  }
}

let initPromise: Promise<void> | null = null;

export function initAppDb(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      if (mysqlMode) {
        await getPool().execute(USERS_SQL_MYSQL);
        await getPool().execute(DEPOSITS_SQL_MYSQL);
        await getPool().execute(WITHDRAWALS_SQL_MYSQL);
        await getPool().execute(WALLETS_SQL_MYSQL);
        await getPool().execute(TRANSACTIONS_SQL_MYSQL);
        await migrateWalletsDemoBalance();
        await migrateUsersReferral();
        await migrateUserInvestments();
        await migrateUserInvestmentsMonthlyYm();
        await migrateMarketTicks();
        await migrateChartCandles();
        await migrateUsersRole();
        await migrateUsersPhone();
        await migrateUsersWithdrawalTotp();
        await migrateUsersWithdrawalTpin();
        await migrateUsersLoginAndBlock();
        await migrateReferralLevelAndAppSettings();
        await migrateSupportTickets();
      } else {
        await runSqliteChain(getSqlite(), [
          ...SQLITE_PRAGMAS,
          USERS_SQL,
          DEPOSITS_SQL,
          WITHDRAWALS_SQL,
          WALLETS_SQL,
          TRANSACTIONS_SQL,
          USER_INVESTMENTS_SQL
        ]);
        await migrateWalletsDemoBalance();
        await migrateUsersReferral();
        await migrateUserInvestments();
        await migrateUserInvestmentsMonthlyYm();
        await migrateMarketTicks();
        await migrateChartCandles();
        await migrateUsersRole();
        await migrateUsersPhone();
        await migrateUsersWithdrawalTotp();
        await migrateUsersWithdrawalTpin();
        await migrateUsersLoginAndBlock();
        await migrateReferralLevelAndAppSettings();
        await migrateSupportTickets();
      }
    })();
  }
  return initPromise;
}
