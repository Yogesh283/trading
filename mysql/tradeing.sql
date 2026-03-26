-- XAMPP MySQL: run in phpMyAdmin (Import) or: mysql -u root -p < mysql/tradeing.sql
-- Default XAMPP: user root, password empty

CREATE DATABASE IF NOT EXISTS tradeing
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tradeing;

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
  last_login_at VARCHAR(64) NULL,
  is_blocked TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_users_self_referral (self_referral_code),
  UNIQUE KEY uk_users_phone (phone_country_code, phone_local)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  INDEX idx_deposits_user (user_id),
  INDEX idx_deposits_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallets (
  user_id VARCHAR(64) NOT NULL PRIMARY KEY,
  balance DOUBLE NOT NULL DEFAULT 0,
  demo_balance DOUBLE NOT NULL DEFAULT 10000,
  updated_at VARCHAR(64) NOT NULL,
  CONSTRAINT fk_wallets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_investments (
  user_id VARCHAR(64) NOT NULL PRIMARY KEY,
  principal DOUBLE NOT NULL DEFAULT 0,
  locked_until VARCHAR(64) NULL,
  last_yield_date VARCHAR(32) NULL,
  last_monthly_yield_ym VARCHAR(7) NULL,
  CONSTRAINT fk_invest_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- If you already imported an older `users` table and get #1054 Unknown column 'role',
-- run once in phpMyAdmin SQL:
--   SOURCE mysql/migrate_add_user_role.sql
-- or manually:
--   ALTER TABLE users ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user' AFTER referral_code;
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS market_ticks (
  symbol VARCHAR(32) NOT NULL,
  price DOUBLE NOT NULL,
  timestamp BIGINT NOT NULL,
  INDEX idx_market_ticks_sym_ts (symbol, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS investment_roi_level_distribution (
  level_num INT NOT NULL PRIMARY KEY,
  percent_of_gross_yield DOUBLE NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO investment_roi_level_distribution (level_num, percent_of_gross_yield, enabled) VALUES
(1, 0, 1), (2, 0, 1), (3, 0, 1), (4, 0, 1), (5, 0, 1);

CREATE TABLE IF NOT EXISTS support_tickets (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  subject VARCHAR(512) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  created_at VARCHAR(64) NOT NULL,
  INDEX idx_support_tickets_user (user_id),
  CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
