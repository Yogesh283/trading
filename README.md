# UpDown FX

Full-stack trading platform (Node.js, TypeScript, Express, React, WebSockets).

## Structure

- `src/` backend API, market feed, wallets & trading
- `frontend/` React: splash → landing → login / register / demo
- `mobile-apk/` optional **Android APK** shell (loads your live site in WebView; see **`mobile-apk/README.md`**)

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

- **`npm run dev`** — **React + API on the same port** (default `PORT` in `.env`, e.g. **http://localhost:3000**). **No `frontend:build` needed** — Vite serves the UI from source.
- `npm run dev:api-only` — API/WebSocket only on `PORT`; then run **`npm run frontend:dev`** on **5173** (old two-terminal flow).
- `npm run build` — compile backend; `npm run frontend:build` — build frontend
- **`npm run build:all`** — backend build + **`npm install`** in `frontend/` + frontend production build (default; avoids Windows **EPERM** from `npm ci` deleting locked Rollup `.node` files).
- **`npm run build:all:ci`** — same as `build:all` but uses **`npm ci`** (strict lockfile; use on Linux CI/VPS when `node_modules` is not locked).
- **`npm run build:all:local`** — backend + frontend build only (no install; fastest when deps are already OK).
- `npm run start` — production: serve **`frontend/dist`** + API on `PORT`. **Local tip:** if `NODE_ENV=development` and **`frontend/dist` is missing**, the server still attaches **Vite** so the full app shows without a frontend build.
- `npm run frontend:dev` — standalone Vite (use with `dev:api-only`)
- `npm run lint` — type-check backend
- **`npm run frontend:clear-vite-cache`** — delete `frontend/node_modules/.vite` (fixes Vite **`504 (Outdated Optimize Dep)`** after upgrades or stale pre-bundles)

## Dev troubleshooting

- **`npm run dev`** → open **`http://localhost:<PORT>`** (same as `.env` `PORT`, default **3000**). Do not rely on **5173** unless you use the two-process flow below.
- **Two terminals:** `npm run dev:api-only` **and** `npm run frontend:dev` → open **`http://localhost:5173`** only (API stays on `PORT`). Opening **`http://localhost:3000`** in that mode will not match Vite HMR and you’ll see WebSocket / “wrong server” errors.
- **`504 (Outdated Optimize Dep)`** on `/node_modules/.vite/deps/...` → stop the server, run **`npm run frontend:clear-vite-cache`**, start again (hard refresh the browser).
- **`SES Removing unpermitted intrinsics`** (`lockdown-install.js`) → usually a **browser extension** (e.g. wallet / security); try a private window or disable extensions to confirm.
- **Port in use:** Node and **Apache/XAMPP** cannot both bind **3000** — change `PORT` in `.env` or stop the other service.
- **`GET /src/main.tsx` 404** with dev-style HTML: the page must be served by **Node + Vite** (`npm run dev`), not by **Apache** using `frontend/` as document root. Apache will serve `index.html` but cannot compile `.tsx`; use **`http://localhost:<PORT>`** on the Node app only (or proxy **all** paths to Node).
- **“Node cannot be found in the current page”** — usually a **browser extension** (e.g. devtools / automation); safe to ignore if the app loads.

## Admin panel (React-Admin)

Third-party **[React-Admin](https://marmelab.com/react-admin/)** UI for read-only lists: **deposits**, **withdrawals**, **users**.

1. Users table has **`role`**: `'user'` (default) or **`'admin'`**.
2. **Promote your account** (pick one):
   - **Command:** `npm run promote-admin -- you@example.com` (same DB as `.env`; use `npm run promote-admin -- --list` to see emails)
   - **`.env`**: `ADMIN_PROMOTE_EMAIL=you@example.com` → restart server once (then remove the line in production), or
   - **SQL**: `UPDATE users SET role = 'admin' WHERE email = 'you@example.com';`
3. Open **`/admin.html`** (or **`/admin`**) and sign in with that user’s **email + password** (same as normal login).

**Localhost:** The admin UI uses the **local API** (same host as the page, e.g. `http://localhost:3000`) so it talks to the **same database as your `.env`**. If you promoted a user on the VPS but open admin on your PC, you’ll still see the PC DB — promote that email on the machine whose API you’re using.

### Admin login: `role='user'` (needs `admin`)

1. **Exact email** — typos (e.g. `1122` vs `1133`) mean no match. Copy from the app or DB.
2. **CLI** (from repo root, same DB as `.env`):
   ```bash
   npm run promote-admin -- you@example.com
   npm run promote-admin -- --list
   ```
   Confirm the line shows **`role=admin`** for that email.
3. **phpMyAdmin** (MySQL) — use **single quotes** for the email string:
   ```sql
   UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER('you@example.com');
   ```
4. **User must exist** — if `promote-admin` says no row updated, **register in the app** with that email first, then promote again.

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
