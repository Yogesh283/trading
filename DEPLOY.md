# Deploy: local → GitHub → live server

This guide covers the **UpDown FX / trading** repo. Code does **not** reach the server by pasting files — use **Git push → `git pull` on the server + build**.

---

## 1) Local (Windows — Git Bash)

### Project folder (avoid this mistake)

- Real project root: **`d:\xampp\htdocs\tradeing`** (where root `package.json` lives).
- Do **not** run `git clone ... trading` **inside** that root again — you get a nested repo / submodule mess.

### Push every change to GitHub

```bash
cd /d/xampp/htdocs/tradeing
git status
git add .
git commit -m "describe your change"
git push origin main
```

### SSH push (new Git Bash session)

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
git push origin main
```

### Local and GitHub on the same commit?

```bash
cd /d/xampp/htdocs/tradeing
git log -1 --oneline
```

---

## 2) GitHub

- Remote: `git@github.com:Yogesh283/trading.git` (SSH) or HTTPS.
- Branch: **`main`**.

---

## 3) Live server (Ubuntu / CloudPanel VPS)

### Where the app lives on the server (example)

Clone is often here:

```text
/home/updowanfx/htdocs/updowanfx-app
```

The **`updowanfx.com`** folder may be CloudPanel’s **document root**. If the domain only serves **static files** from that folder, the **new Node app will not show**.  
**Required:** Point **`updowanfx.com` → reverse proxy → `http://127.0.0.1:3000`** (where PM2 runs Node). Details in §5.

**Your setup:** If the repo is in **`/home/updowanfx/htdocs/updowanfx.com`** (document root = app folder), that is fine — always `cd` to that path; `updowanfx-app` is optional.

### First time: clone from GitHub (HTTPS — SSH key on server optional)

```bash
cd /home/updowanfx/htdocs
git clone https://github.com/Yogesh283/trading.git updowanfx-app
cd updowanfx-app
```

### First time: env + install + build

```bash
cd /home/updowanfx/htdocs/updowanfx-app
cp .env.example .env
nano .env
```

Fill `PORT`, DB (`MYSQL_*` or SQLite), secrets in `.env`.

```bash
npm ci
npm run build:all
```

### Run with PM2

```bash
npm install -g pm2
cd /home/updowanfx/htdocs/updowanfx-app
pm2 start dist/index.js --name updowanfx
pm2 save
pm2 startup
```

Run the **`sudo` command** that `pm2 startup` prints **once**.

### Every deploy (after local push)

```bash
cd /home/updowanfx/htdocs/updowanfx-app
git pull origin main
npm ci
npm run build:all
pm2 restart updowanfx
```

### `git pull` error: `tsconfig.tsbuildinfo` would be overwritten

This file is produced by **`tsc -b` / frontend build**. If it changes on the server, `git pull` can block.

**Quick fix (on server):**

```bash
cd /home/updowanfx/htdocs/updowanfx.com   # your path
git checkout -- frontend/tsconfig.tsbuildinfo
git pull origin main
npm ci
npm run build:all
pm2 restart updowanfx
```

Or remove the file and pull:

```bash
rm -f frontend/tsconfig.tsbuildinfo
git pull origin main
```

`*.tsbuildinfo` is in **`.gitignore`** in the repo — after that change is pushed, if Git was tracking the file before, on your PC run:

`git rm --cached frontend/tsconfig.tsbuildinfo` → commit → push.

### Verify: server commit matches GitHub

```bash
cd /home/updowanfx/htdocs/updowanfx-app
git fetch origin
git log -1 --oneline
```

The hash should match local `git log -1`.

---

## 4) Node.js version

The project expects **Node >= 20** (`engines`). On the server:

```bash
node -v
```

If you have **v18**, upgrade (Ubuntu example):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get update
apt-get install -y nodejs
node -v
```

Then:

```bash
cd /home/updowanfx/htdocs/updowanfx-app
rm -rf node_modules frontend/node_modules
npm ci
npm run build:all
pm2 restart updowanfx
```

---

## 5) Domain `updowanfx.com` — CloudPanel / Nginx

**Copying files only into the `updowanfx.com` folder does not run the full app** — `/api` and `/ws` need **Node**.

1. CloudPanel → **Site `updowanfx.com`** → **Vhost / Reverse Proxy / Nginx** (switch from PHP-only to **reverse proxy**).
2. Proxy traffic to **`http://127.0.0.1:3000`** (match `.env` `PORT` — wrong port → 502/500).
3. **WebSocket** path **`/ws`** must hit the same backend (Nginx: `Upgrade`, `Connection` headers).

Until this proxy is set, you may see the **old static UI** even if the build is correct.

### Folder permissions (File Manager shows `0600` / `root:root`)

If the site folder is **`root:root`** and **`0600`**, user **`updowanfx`** / Nginx may break. On SSH (root):

```bash
SITE=/home/updowanfx/htdocs/updowanfx.com
chown -R updowanfx:updowanfx "$SITE"
find "$SITE" -type d -exec chmod 755 {} \;
find "$SITE" -type f -exec chmod 644 {} \;
```

You can still run PM2 as `root`; this keeps File Manager / future non-root runs sane.

### PM2 `errored` + `ZodError` / `USDT_BEP20_DEPOSIT_ADDRESS`

If **`updowanfx-error.log`** shows **`USDT_BEP20_DEPOSIT_ADDRESS`** regex errors:

- In `.env`, value must be exactly `0x` + **40 hex** (42 chars total), **no** extra spaces / quotes.
- If paste is wrong, **remove the line** or leave it **empty** → default address is used (latest code strips quotes/BOM/spaces).
- After fix: `pm2 restart updowanfx` → **`pm2 status`** = **online**.

```bash
grep USDT_BEP20 /home/updowanfx/htdocs/updowanfx.com/.env
```

---

### `500 Internal Server Error` — check this first (on server)

```bash
# Check PORT in .env (example 3000)
grep ^PORT= /home/updowanfx/htdocs/updowanfx.com/.env

# Response directly from Node (bypass Nginx)
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
curl -sS http://127.0.0.1:3000/api/health
```

- If **`curl` = 200** but the browser shows **500** → **Nginx / CloudPanel** config (wrong port, PHP handler, proxy off).
- If **`curl` is also 500** → **`pm2 logs updowanfx --lines 80`** and fix the error (DB, `.env`, missing `frontend/dist`).
- **`/api/ping`** / **`/api/health`** should show header **`X-Served-By: updownfx-raw`** (Node `http` layer, before Express).  
  - **Header present + `pong` / JSON** → Node is OK; if only **`/`** is 500, check Express/static.  
  - **No header + old HTML error** → **wrong process on 3000** — run: `ss -tlnp | grep ':3000'` and verify PM2 `script path`.

```bash
curl -sSI http://127.0.0.1:3000/api/ping | head -20
```

**Helmet / CSP on `/api/ping` but no `X-Served-By: updownfx-raw`** → server has **old `dist`** or GitHub still has old `src/server.ts` (**not pushed** from Windows).  
`dist/` is **gitignored** — only **`src`** is pulled; **`npm run build`** creates `dist`.

```bash
# On server — did latest code arrive?
grep -n updownfx-raw /home/updowanfx/htdocs/updowanfx.com/src/server.ts
grep -n updownfx-raw /home/updowanfx/htdocs/updowanfx.com/dist/server.js
```

If the first command shows nothing → **`git pull` did not get the new commit** — `git push origin main` from your PC.  
If the second shows nothing → run **`npm run build`** (`verify:dist` inside build; if it fails, update `src`).

Nginx error log (path may differ for CloudPanel):

```bash
tail -50 /home/updowanfx/logs/nginx/error.log 2>/dev/null || tail -50 /var/log/nginx/error.log
```

---

## 6) GitHub `known_hosts` (server — if using SSH clone)

```bash
mkdir -p ~/.ssh
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
```

If prompted `Are you sure you want to continue connecting (yes/no)?`, type **`yes`**.

---

## 7) Mistakes to avoid

| Mistake | Result |
|--------|--------|
| Pasting the **full terminal log** into the shell | Each line may run as a command → errors |
| `cd d:\xampp\...` in Git Bash | `\x` breaks — use: `cd /d/xampp/htdocs/tradeing` |
| Push without commit | Server `pull` will not get new code |
| Update `updowanfx-app` but domain serves static `updowanfx.com` | Live site stays old — **fix the proxy** |
| Nested `trading/` folder in project root | Submodule issues — `trading/` is in `.gitignore` |

---

## 8) Quick reference (copy blocks)

**Local → GitHub**

```bash
cd /d/xampp/htdocs/tradeing
git add .
git commit -m "your message"
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
git push origin main
```

**Server → live update** (use your folder: `updowanfx.com` **or** `updowanfx-app`)

```bash
cd /home/updowanfx/htdocs/updowanfx.com   # or: updowanfx-app
git pull origin main
npm ci
npm run build:all
pm2 restart updowanfx
```

**PM2 status / logs**

```bash
pm2 status
pm2 logs updowanfx
```

---

## 8.1) “Market is closed on weekends…” under trades

That message **does not come from the current API in this repo** — an **old Node backend** (old `dist/` or an old PM2 process) is still returning that JSON error on orders.

- Server: `git pull` → `npm run build:all` → **`pm2 restart updowanfx`** (or your PM2 name).
- Local: **Ctrl+C** in the terminal → start **`npm run dev`** again (stop the old `tsx`/Node process).
- New **frontend build** + browser **Ctrl+F5** so the new JS bundle loads (it may also change how API errors display).

---

## 8.2) Windows: EPERM `rollup.win32-x64-msvc.node` (`npm ci`)

**Default `npm run build:all`** uses **`npm install`** in the frontend ( **`not` `npm ci`** ) so Windows hits fewer **EPERM** errors when Rollup/Vite locks `.node` files.

If you run **`npm run build:all:ci`** (old flow, **`npm ci`**), the whole `frontend/node_modules` is removed — **stop `npm run dev`**, then run it; otherwise EPERM.

**If EPERM persists:**

1. **Ctrl+C** — stop all Node/dev processes.
2. **`npm run build:all:local`** — compile + frontend build only (skips install).
3. Task Manager / reboot if the file is still locked.

**Linux VPS / clean CI** where you want `npm ci`: use **`npm run build:all:ci`**.

---

## 9) Browser

After a new frontend build: **Ctrl+F5** (hard refresh) or incognito — avoid stale JS from cache.

---

*Update this file when server paths, PM2 name, or CloudPanel steps change.*

---

### Server snippet: discard generated file and redeploy

```bash
cd /home/updowanfx/htdocs/updowanfx.com

# Discard generated file (safe)
git checkout -- frontend/tsconfig.tsbuildinfo

git pull origin main
npm ci
npm run build:all
pm2 restart updowanfx
```
