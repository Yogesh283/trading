/**
 * Create MySQL database `tradeing` + tables on XAMPP (or any MySQL).
 * 1. Start Apache + MySQL in XAMPP
 * 2. Set MYSQL_* in .env (or defaults: root, no password, 127.0.0.1)
 * 3. Run: npx tsx src/init-mysql.ts
 */
import path from "node:path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const host = process.env.MYSQL_HOST ?? "127.0.0.1";
const port = Number(process.env.MYSQL_PORT ?? 3306);
const user = process.env.MYSQL_USER ?? "root";
const password = process.env.MYSQL_PASSWORD ?? "";
const database = process.env.MYSQL_DATABASE ?? "tradeing";

async function main() {
  const conn = await mysql.createConnection({ host, port, user, password });
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, "")}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  console.log("Database:", database);
  await conn.query(`USE \`${database.replace(/`/g, "")}\``);

  await conn.query(`
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
      withdrawal_totp_secret VARCHAR(128) NULL,
      withdrawal_totp_pending VARCHAR(128) NULL,
      UNIQUE KEY uk_users_self_referral (self_referral_code),
      UNIQUE KEY uk_users_phone (phone_country_code, phone_local)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("Table: users");

  await conn.query(`
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
  `);
  console.log("Table: deposits");

  await conn.query(`
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
  `);
  console.log("Table: withdrawals");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      user_id VARCHAR(64) NOT NULL PRIMARY KEY,
      balance DOUBLE NOT NULL DEFAULT 0,
      demo_balance DOUBLE NOT NULL DEFAULT 10000,
      updated_at VARCHAR(64) NOT NULL,
      CONSTRAINT fk_wallets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("Table: wallets");

  await conn.query(`
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
  `);
  console.log("Table: transactions");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS user_investments (
      user_id VARCHAR(64) NOT NULL PRIMARY KEY,
      principal DOUBLE NOT NULL DEFAULT 0,
      locked_until VARCHAR(64) NULL,
      last_yield_date VARCHAR(32) NULL,
      CONSTRAINT fk_invest_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("Table: user_investments");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS market_ticks (
      symbol VARCHAR(32) NOT NULL,
      price DOUBLE NOT NULL,
      timestamp BIGINT NOT NULL,
      INDEX idx_market_ticks_sym_ts (symbol, timestamp)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("Table: market_ticks");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
      setting_value TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("Table: app_settings");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS referral_level_settings (
      level_num INT NOT NULL PRIMARY KEY,
      percent_of_stake DOUBLE NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("Table: referral_level_settings");

  await conn.query(
    `INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('referral_program_enabled', '1')`
  );
  for (let lv = 1; lv <= 5; lv++) {
    await conn.query(
      `INSERT IGNORE INTO referral_level_settings (level_num, percent_of_stake, enabled) VALUES (?, 0.001, 1)`,
      [lv]
    );
  }

  await conn.end();
  console.log("MySQL ready. Add to .env:\n  MYSQL_DATABASE=" + database);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
