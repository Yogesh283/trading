-- Existing database with a `users` table but no `role` column yet:
-- In phpMyAdmin → select your database → SQL tab → run this once.

USE tradeing;

ALTER TABLE users
  ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user'
  AFTER referral_code;

-- If the above errors (referral_code missing / column order), try:
-- ALTER TABLE users ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user';

-- Then promote an admin (replace with your email):
-- UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER('you@email.com');
