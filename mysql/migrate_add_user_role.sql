-- Purani database jisme `users` table pehle se hai lekin `role` column nahi:
-- phpMyAdmin → apni database select karein → SQL tab → yeh run karein (sirf ek baar).

USE tradeing;

ALTER TABLE users
  ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user'
  AFTER referral_code;

-- Agar upar wala error de (referral_code missing / order issue), yeh try karein:
-- ALTER TABLE users ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user';

-- Phir admin banayein (apna email likhein):
-- UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER('jo@email.com');
