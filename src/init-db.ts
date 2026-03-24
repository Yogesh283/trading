/**
 * Creates data/app.db and required tables (users, deposits).
 * Run: npx tsx src/init-db.ts
 */
import fs from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "app.db");

fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Failed to open database:", err.message);
    process.exit(1);
  }
  console.log("Database opened:", dbPath);
});

function run(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => (err ? reject(err) : resolve()));
  });
}

async function init() {
  await run(`PRAGMA foreign_keys = ON`);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  console.log("Table: users");

  await run(`
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
  `);
  console.log("Table: deposits");

  await run(`
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
  `);
  console.log("Table: withdrawals");

  await run(`
    CREATE TABLE IF NOT EXISTS wallets (
      user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      balance REAL NOT NULL DEFAULT 0,
      demo_balance REAL NOT NULL DEFAULT 10000,
      updated_at TEXT NOT NULL
    )
  `);
  console.log("Table: wallets");

  await run(`
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
  `);
  console.log("Table: transactions");

  db.close((err) => {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }
    console.log("Database created successfully at", dbPath);
  });
}

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
