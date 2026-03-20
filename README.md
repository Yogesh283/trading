<<<<<<< HEAD
# UpDown FX

Full-stack trading platform (Node.js, TypeScript, Express, React, WebSockets).

## Structure

- `src/` backend API, market feed, wallets & trading
- `frontend/` React: splash → landing → login / register / demo

## Database

### Option A — SQLite (default)

**`data/app.db`** — created on first server start or run `npm run db:create`.

### Option B — XAMPP MySQL

1. Start **MySQL** in XAMPP Control Panel.
2. Run **`npm run db:mysql`** — creates **`tradeing`** + tables **`users`**, **`deposits`**, **`withdrawals`** (default: `root` / empty password / `127.0.0.1`).
3. In **`.env`** set:
   ```env
   MYSQL_DATABASE=tradeing
   MYSQL_USER=root
   MYSQL_PASSWORD=
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   ```
4. Restart the Node server.

Or import **`mysql/tradeing.sql`** in **phpMyAdmin** (same schema).

The `data/` folder is in `.gitignore` (SQLite files are not committed).

## Setup

1. Copy `.env.example` to `.env` and fill in the values.
2. Run `npm install` in the root.
3. Run `npm install` inside `frontend/`.

## Scripts

- **`npm run dev`** — **React + API on the same port** (default `PORT` in `.env`, e.g. **http://localhost:3000**). Hot reload for frontend.
- `npm run dev:api-only` — API/WebSocket only on `PORT`; then run **`npm run frontend:dev`** on **5173** (old two-terminal flow).
- `npm run build` — compile backend; `npm run frontend:build` — build frontend
- `npm run start` — production: serve **`frontend/dist`** + API on `PORT`
- `npm run frontend:dev` — standalone Vite (use with `dev:api-only`)
- `npm run lint` — type-check backend

## Admin panel (React-Admin)

Third-party **[React-Admin](https://marmelab.com/react-admin/)** UI for read-only lists: **deposits**, **withdrawals**, **users**.

1. Users table has **`role`**: `'user'` (default) or **`'admin'`**.
2. **Promote your account** (pick one):
   - **Command:** `npm run promote-admin -- you@example.com` (same DB as `.env`; use `npm run promote-admin -- --list` to see emails)
   - **`.env`**: `ADMIN_PROMOTE_EMAIL=you@example.com` → restart server once (then remove the line in production), or
   - **SQL**: `UPDATE users SET role = 'admin' WHERE email = 'you@example.com';`
3. Open **`/admin.html`** (or **`/admin`**) and sign in with that user’s **email + password** (same as normal login).

API: **`GET /api/admin/ra/:resource`** and **`GET /api/deposits/admin-all`** require **`Authorization: Bearer <JWT>`** and **`users.role = 'admin'`**.

## Current Features

- Login and register pages
- **Demo trading only before login** (Enter Demo)
- After login/register: **no demo trading** — live account view only; log out to practice again
- Live Binance websocket market data
- Demo account and trade history
- REST API for health, markets, account, and trades
- React dashboard with live updates
- Backend serving the production frontend build

## Next Steps

- Add strategy engine
- Add candle storage and backtesting
- Add real broker integration
- Add auth, admin controls, and deeper analytics
=======
# trading
>>>>>>> 624159fd3d613617d24bc1a4f1270bb7ab25181e
