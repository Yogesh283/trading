-- Run once on existing MySQL DB if app migrations did not run (normally `initAppDb` adds these on startup).
-- USE your_database;

ALTER TABLE users ADD COLUMN phone_country_code VARCHAR(8) NULL;
ALTER TABLE users ADD COLUMN phone_local VARCHAR(20) NULL;

CREATE UNIQUE INDEX uk_users_phone ON users (phone_country_code, phone_local);
