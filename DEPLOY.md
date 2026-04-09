# Deploy — local → Git → live server

**Data flow:**

1. **PC** → `git push` → **GitHub** (`main` branch)  
2. **VPS** → `git pull` (or reset) + `npm run build:all` + `pm2 restart` → **live site**

`git push` does **not** go to the server directly. Each deploy needs SSH commands on the server.

### Mobile signup → `users` table (phpMyAdmin looks “empty”?)

- **If `.env` has `MYSQL_DATABASE=...` set** → users go to **MySQL** → open that database in phpMyAdmin (e.g. `tradeing`); mobile signup appears in **`phone_country_code`**, **`phone_local`**. Synthetic email: `{id}@m.iqfxpro.local`.
- **If `MYSQL_DATABASE` is empty / unset** → users go to **`data/app.db` (SQLite)** → they will **not** show in phpMyAdmin until you use MySQL. Check: open `GET /api/system/database` in the browser or read the DB hint on the register success message.
- The admin **Users** list shows **Phone CC** + **Phone** columns.

**Repo:** `https://github.com/Yogesh283/trading.git` · **Branch:** `main`  
**PC folder:** `d:\xampp\htdocs\tradeing`  
**Server folder (primary / CloudPanel):** `/home/iqfxpro/htdocs/www.iqfxpro.com`  
**PM2 name (example):** `iqfxpro` — use whatever appears in `pm2 list`.

---

## 1) PC → GitHub (Windows — Git Bash)

```bash
cd /d/xampp/htdocs/tradeing
git status
git add .
git commit -m "your message"
git push origin main
```

- **`nothing to commit, working tree clean`** = no pending changes; edit files / `git add` first.  
- **`Everything up-to-date`** without a new commit = nothing new reached GitHub — commit + push.

**SSH push** (if needed):

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
git push origin main
```

**Check:**

```bash
git log -1 --oneline
```

This hash should match the latest `main` on GitHub.

---

## 2) GitHub → server (VPS — SSH)

**CloudPanel / Site Settings — App Port (avoid 502):** The **App Port** shown in the panel (e.g. `www.iqfxpro.com` → **4000**) must match **`PORT=`** in `.env`:

- `.env` example: `PORT=4000` — default in repo is `3000`; if the panel uses `4000` but `.env` stays `3000`, nginx upstream can return **502 Bad Gateway**.
- Test (SSH): `curl -sS http://127.0.0.1:4000/api/ping` → `pong` (use your port).
- Then: `pm2 restart <app>`.

```bash
cd /home/iqfxpro/htdocs/www.iqfxpro.com

git fetch origin
git log -1 --oneline origin/main
git log -1 --oneline
```

**`.env` check (same path):**

- On **Linux VPS** use `curl` — not `curl.exe` (Windows PowerShell).

```bash
cd /home/iqfxpro/htdocs/www.iqfxpro.com

# Does .env exist?
test -f .env && echo ".env OK" || echo "MISSING: copy .env.example to .env and edit"

# Active MySQL lines (without #) — if nothing prints, MySQL is off
grep -E '^USE_MYSQL=|^MYSQL_' .env 2>/dev/null || echo "(no active MYSQL_* — app uses SQLite)"

# Which DB the running Node app uses
curl -sS "http://127.0.0.1:4000/api/system/database"
# HTTPS:
# curl -sS "https://www.iqfxpro.com/api/system/database"
```

- `kind: "mysql"` + `database: "tradeing"` → new users in **phpMyAdmin / MySQL**.
- `kind: "sqlite"` + `file: ".../data/app.db"` → **MySQL is still off.**  
  If `grep` only shows `# MYSQL_...` (commented), you **did not uncomment**. Uncomment and set values like below (no `#`), then `pm2 restart`.

**MySQL on (example — use your password / user):**

```env
USE_MYSQL=1
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=YOUR_MYSQL_PASSWORD
```

(`USE_MYSQL=1` defaults the database name to `tradeing` — create the `tradeing` database in MySQL first.)

Then:

```bash
pm2 restart iqfxpro
curl -sS "http://127.0.0.1:4000/api/system/database"
```

You should see `kind: "mysql"` again.

---

If the **server commit hash is old**:

```bash
git restore frontend/tsconfig.tsbuildinfo 2>/dev/null || git checkout -- frontend/tsconfig.tsbuildinfo
git pull origin main
```

**Build + restart (after every deploy):**

```bash
npm ci
npm run build:all
pm2 restart iqfxpro
```

**Verify:**

```bash
git log -1 --oneline
```

Hash should match **GitHub `main`**.

**Browser:** hard refresh (**Ctrl+F5**) or incognito for new JS/CSS.

---

## 3) If `git pull` fails or branch diverged

If `git branch -vv` shows **`ahead X, behind Y`** → server and GitHub have different histories.  
For a **deploy mirror only** (`.env` is gitignored, usually safe):

```bash
cd /home/iqfxpro/htdocs/www.iqfxpro.com
git fetch origin
git reset --hard origin/main
npm ci
npm run build:all
pm2 restart iqfxpro
```

**Rule:** do **not** `git commit` on the VPS — push from PC; on the server only **pull / reset** + build.

---

## 4) Typos / small fixes

**Chart works locally but live has old candles:** do not copy placeholder **`APNA-DOMAIN`** — use your **real hostname** (same as browser URL; production: **`www.iqfxpro.com`**).

```bash
# Public HTTPS:
curl -sS "https://www.iqfxpro.com/api/markets/candles?symbol=GBPAUD&timeframe=60&limit=5" | head -c 200
# Direct to Node (on VPS — port must match `.env` `PORT=`; CloudPanel example 4000):
curl -sS "http://127.0.0.1:4000/api/markets/candles?symbol=GBPAUD&timeframe=60&limit=5" | head -c 200
```

The response should start with **`{"candles":`**. **`{"candles":[]}`** = API OK but DB has **no bars yet** (new server, or seed disabled/failed). phpMyAdmin: `SELECT COUNT(*) FROM chart_candles;` — check `pm2 logs` for `chart_candles` errors. For **faster history**, set optional **`TRADERMADE_KEY`** / **`ALPHA_VANTAGE_API_KEY`** in `.env` (seed runs on server start). Without keys: run a few **minutes** so buckets close and ticks write to DB. If you get a redirect, use **`curl -L`**. If you get **HTML** (`<!DOCTYPE`), **`location /api/`** must come **before** **`location /`** in nginx. On Cloudflare, do **not** set **`/api`** to “Cache Everything”. For same-origin SPA, keep **`VITE_API_URL` empty** in `frontend/.env`.

| Problem | Fix |
|--------|-----|
| `it: command not found` | Type **`git pull`** — not **`it pull`**. |
| `frontend/dist/index.html` ENOENT | Run `npm run build:all` (builds frontend). |
| Node / Vite warnings | On server: **`node -v`** — **v20.19+** is recommended (`curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash -` then `apt install nodejs`). |
| PM2 keeps restarting | `pm2 logs iqfxpro --lines 80` — check `.env`, DB, `PORT`. |
| USDT address error in logs | `.env` `USDT_BEP20_DEPOSIT_ADDRESS` = **`0x` + 40 hex** or remove the line. |

---

## 5) First server setup (reference)

```bash
cd /home/iqfxpro/htdocs
git clone https://github.com/Yogesh283/trading.git www.iqfxpro.com
cd www.iqfxpro.com
cp .env.example .env && nano .env
npm ci && npm run build:all
npm install -g pm2 
pm2 start dist/index.js --name iqfxpro
pm2 save && pm2 startup
```

**Domain:** In Nginx / CloudPanel, reverse-proxy the site to **`http://127.0.0.1:4000`** (or whatever `.env` **`PORT`** is — must match **App Port**). Serving only static files will **not** expose Node **`/api`** / **`/ws`**.

---

## 6) Android APK (Capacitor)

**Nginx (APK / API):** `location /api/` must be **before** **`location /`** — otherwise `/api/...` returns SPA `index.html` → download becomes **`mobile-app.html`**.

```nginx
# Upstream timeouts — without these, WebView / long API can get **504 Gateway Timeout**
proxy_connect_timeout 75s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
send_timeout 300s;

location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# If the whole site (/) also proxies to Node — add the same headers + timeouts in that `location /` block.
# WebSocket (live prices): add `Upgrade` / `Connection` headers (see nginx WebSocket proxy docs).
```

**504 in APK** = nginx/proxy did not get a response from **`127.0.0.1:PORT`** within the time limit (or Node down, hang, slow DB). **Not fixed in APK code** — fix the server:

1. SSH: `curl -sS --max-time 5 http://127.0.0.1:4000/api/ping` → `pong` (PORT = `.env` `PORT`). If not: **`pm2 logs iqfxpro`**, `.env`, MySQL — app crash / DB stall causes timeout.
2. Add **`proxy_*_timeout`** above in the vhost, **`nginx -t`** → reload. CloudPanel: site → **Vhost** / custom nginx snippet.
3. With **Cloudflare**, you may also see **524**; use **SSL/TLS → Full (strict)** and do not aggressively cache `/api`. If origin is slow, you may need to increase Cloudflare/origin timeouts.

The APK opens the live site in a **WebView**. Config: **`mobile-apk/capacitor.config.json`** → `server.url` (**`https://www.iqfxpro.com`**). After changing domains: **`cd mobile-apk` → `npx cap sync android`** → build a new APK.

| Task | Command / location |
|------|-------------------|
| Change URL | Edit `mobile-apk/capacitor.config.json` → **`npx cap sync android`** |
| Sync + Studio | `cd mobile-apk` → `npm install` → `npx cap sync android` → `npx cap open android` (or open **`mobile-apk/android`** in Studio) |
| Release APK | Android Studio → **Build → Build APK(s)** (or signed bundle for Play) |
| **“Download APK” on site** | On PC: build APK in Studio → **`npm run apk:sync`** → `releases/Iqfxpro.apk`; SFTP to VPS **`.../releases/Iqfxpro.apk`**. Server: **`pm2 restart`**. (Or `.env` **`APK_FILE_PATH=/home/.../Iqfxpro.apk`**.) Link: **`GET /api/system/android-apk`**. |
| Download **`mobile-app.html`** instead of APK | **`/api/...` is not reaching Node** — static/SPA returned `index.html`. **Fix:** nginx **`location /api/`** → Node, **`location /` before** it. |
| VPS `curl` → **`Could not resolve host`** | Wrong domain spelling or server DNS — verify `https://www.iqfxpro.com`, or test `curl -I http://127.0.0.1:PORT/...` |
| `curl -I http://127.0.0.1:PORT/api/system/android-apk` → **404** + short HTML | **Old `dist`** running — on server: `grep android-apk dist/server.js` (should show lines). Then **`npm run build`**, **`npm run build:all`** if needed, **`pm2 restart`**. |
| Is APK route live? | `curl -I http://127.0.0.1:PORT/api/ping` → header **`X-Served-By: iqfxpro-raw`**. Then `curl -I http://127.0.0.1:PORT/api/system/android-apk` → **`application/vnd.android.package-archive`** (if file exists) or long HTML “APK file missing” (if missing). |
| **504 in APK WebView** | Node up + fast `curl /api/ping` (step 1). Then nginx **`proxy_read_timeout`** / **`send_timeout`** (snippet above). Then Cloudflare/origin. |

**Most web UI fixes:** only **`npm run build:all`** on the server + deploy — **a new APK is not always required** (user can close/reopen the app to load new UI).

**You need a new APK when:** changing `server.url`, app name, icons, or native permissions.

More detail (Windows paths, cleartext HTTP, cache): **`mobile-apk/README.md`**, **`releases/README.md`**.

---

*Adjust paths / PM2 names for your server — production defaults above use `iqfxpro` / `www.iqfxpro.com`.*



<!-- 


cd D:\xampp\htdocs\tradeing\mobile-apk
npm install
npx cap sync android

cd D:\xampp\htdocs\tradeing\mobile-apk\android
.\gradlew.bat bundleRelease -->