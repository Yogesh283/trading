# Deploy — local → Git → live server

**Data ka flow:**

1. **PC** → `git push` → **GitHub** (`main` branch)  
2. **VPS** → `git pull` (ya reset) + `npm run build:all` + `pm2 restart` → **live site**

`git push` **direct server par nahi jaata**. Har baar server par SSH se commands chalani padti hain.

### Mobile register → `users` table (phpMyAdmin “empty”?)

- **`.env` mein `MYSQL_DATABASE=...` set hai** → users **MySQL** mein jaate hain → phpMyAdmin mein **usi database** (jaise `tradeing`) kholo; columns **`phone_country_code`**, **`phone_local`** mein mobile signup dikhega. Synthetic email: `{id}@m.iqfxpro.local`.
- **`MYSQL_DATABASE` khali / unset** → users **`data/app.db` (SQLite)** mein jaate hain → phpMyAdmin mein **nahi** dikhenge jab tak aap MySQL use nahi kar rahe. Check: browser/open `GET /api/system/database` ya register ke baad success message par DB hint.
- Admin panel **Users** list ab **Phone CC** + **Phone** columns dikhata hai.

**Repo:** `https://github.com/Yogesh283/trading.git` · **Branch:** `main`  
**PC folder:** `d:\xampp\htdocs\tradeing`  
**Server folder (primary / CloudPanel):** `/home/iqfxpro/htdocs/www.iqfxpro.com`  
**PM2 name (example):** `iqfxpro` — jo `pm2 list` mein ho wahi use karo.

---

## 1) PC se GitHub par (Windows — Git Bash)

```bash
cd /d/xampp/htdocs/tradeing
git status
git add .
git commit -m "your message"
git push origin main
```

- **`nothing to commit, working tree clean`** = koi naya change nahi; pehle files edit karo / `git add` karo.  
- **`Everything up-to-date`** bina commit ke = GitHub par kuch naya **gaya hi nahi** — commit + push karo.

**SSH push** (agar zaroorat ho):

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
git push origin main
```

**Check:**

```bash
git log -1 --oneline
```

Yeh hash GitHub website par `main` ke latest se match hona chahiye.

---

## 2) GitHub se server par (VPS — SSH)

**CloudPanel / Site Settings — App Port (502 se bachne ke liye):** Panel mein jo **App Port** dikhe (jaise `www.iqfxpro.com` → **4000**), wahi number server ke **`PORT=`** se match hona chahiye:

- `.env` mein likho: `PORT=4000` (example) — default repo `3000` hai; panel `4000` hai aur `.env` `3000` reh gaya to nginx upstream **502 Bad Gateway** de sakta hai.
- Test (SSH): `curl -sS http://127.0.0.1:4000/api/ping` → `pong` (apna port lagao).
- Phir: `pm2 restart <app>`.

```bash
cd /home/iqfxpro/htdocs/www.iqfxpro.com

git fetch origin
git log -1 --oneline origin/main
git log -1 --oneline
```

**`.env` check (same path par):**

- **Linux VPS par** `curl` use karo — `curl.exe` sirf Windows / PowerShell hai (`command not found` aayega).

```bash
cd /home/iqfxpro/htdocs/www.iqfxpro.com

# File hai ya nahi (project root = jahan package.json hai)
test -f .env && echo ".env OK" || echo "MISSING: copy .env.example to .env and edit"

# Active MySQL lines (bina #) — agar kuch nahi aaya = MySQL off
grep -E '^USE_MYSQL=|^MYSQL_' .env 2>/dev/null || echo "(no active MYSQL_* — app uses SQLite)"

# Chal raha Node app kaunsa DB use kar raha hai
curl -sS "http://127.0.0.1:4000/api/system/database"
# HTTPS:
# curl -sS "https://www.iqfxpro.com/api/system/database"
```

- `kind: "mysql"` + `database: "tradeing"` → naye user **phpMyAdmin / MySQL** mein.
- `kind: "sqlite"` + `file: ".../data/app.db"` → **MySQL abhi band hai.**  
  Sirf `grep` mein `# MYSQL_...` (comment) dikhna = **uncomment nahi** kiya. Neeche jaisa **bina `#`** likho, phir `pm2 restart`.

**MySQL on (example — apna password / user):**

```env
USE_MYSQL=1
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=YOUR_MYSQL_PASSWORD
```

(`USE_MYSQL=1` se database name default `tradeing` ho jata hai — pehle MySQL mein `tradeing` DB banao.)

Phir:

```bash
pm2 restart iqfxpro
curl -sS "http://127.0.0.1:4000/api/system/database"
```

Dubara `kind: "mysql"` aana chahiye.

---

Agar **server wala hash purana** hai:

```bash
git restore frontend/tsconfig.tsbuildinfo 2>/dev/null || git checkout -- frontend/tsconfig.tsbuildinfo
git pull origin main
```

**Build + app restart (hamesha deploy ke baad):**

```bash
npm ci
npm run build:all
pm2 restart iqfxpro
```

**Phir verify:**

```bash
git log -1 --oneline
```

Ab hash **GitHub `main`** jaisa hona chahiye.

**Browser:** naya JS/CSS ke liye **Ctrl+F5** ya incognito.

---

## 3) Agar `git pull` fail ho ya branch uljha ho

`git branch -vv` par **`ahead X, behind Y`** dikhe → server aur GitHub alag history par hain.  
**Sirf deploy mirror** ke liye (`.env` gitignore mein hai, usually safe):

```bash
cd /home/iqfxpro/htdocs/www.iqfxpro.com
git fetch origin
git reset --hard origin/main
npm ci
npm run build:all
pm2 restart iqfxpro
```

**Rule:** VPS par **`git commit` mat karo** — code PC se push, server par sirf **pull / reset** + build.

---

## 4) Typo / chhoti cheezein

**Chart local sahi, live par purani candles nahi:** Placeholder **`APNA-DOMAIN` copy-paste mat karo** — **apna asli hostname** likho (browser jaisa URL; production: **`www.iqfxpro.com`**).
```bash
# Public HTTPS:
curl -sS "https://www.iqfxpro.com/api/markets/candles?symbol=GBPAUD&timeframe=60&limit=5" | head -c 200
# Seedha Node (VPS par — port `.env` `PORT=` se match; CloudPanel example 4000):
curl -sS "http://127.0.0.1:4000/api/markets/candles?symbol=GBPAUD&timeframe=60&limit=5" | head -c 200
```
Jawab **`{"candles":`** se shuru hona chahiye. **`{"candles":[]}`** = API theek hai, lekin DB mein abhi **koi bar save nahi** (naya server, ya seed/off failed). phpMyAdmin: `SELECT COUNT(*) FROM chart_candles;` — `pm2 logs` mein `chart_candles` errors dekho. **Turant history** ke liye `.env` mein optional **`TRADERMADE_KEY`** / **`ALPHA_VANTAGE_API_KEY`** (server start pe seed chalega). Bina keys: kuch **minute** chalao taake buckets close hon aur ticks DB mein likhein. Redirect par **`curl -L`** use karo. Agar **HTML** (`<!DOCTYPE`) aaye to **`location /api/`** Node proxy **`location /` se pehle** hona chahiye. Cloudflare par **`/api` ko “Cache Everything” mat** do. Same-origin par `frontend/.env` mein **`VITE_API_URL` khali** rakho.

| Problem | Fix |
|--------|-----|
| `it: command not found` | **`git pull`** likho — **`it pull`** nahi. |
| `frontend/dist/index.html` ENOENT | `npm run build:all` chalao (frontend build banega). |
| Node warning / Vite | Server par **`node -v`** — **v20.19+** behtar (`curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash -` phir `apt install nodejs`). |
| PM2 bar‑bar restart | `pm2 logs iqfxpro --lines 80` — `.env`, DB, `PORT` dekho. |
| USDT address error in logs | `.env` mein `USDT_BEP20_DEPOSIT_ADDRESS` = **`0x` + 40 hex** ya line hata do. |

---

## 5) Pehli baar server par (reference)

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

**Domain:** Nginx / CloudPanel se site ko **`http://127.0.0.1:4000`** (ya jo `.env` `PORT` ho — panel ke **App Port** se match) par **reverse proxy** karo; sirf static folder se Node API **`/api` / `/ws` nahi chalenge`.

---

## 6) Android APK (Capacitor)

**Nginx (APK / API):** `location /api/` block **`location /` se pehle** — warna `/api/...` SPA `index.html` ban jata hai → download **`mobile-app.html`**.

```nginx
# Upstream timeouts — bina inke WebView / lambi API par **504 Gateway Timeout** aa sakta hai
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

# Agar poori site (/) bhi Node ko jaati hai — wahi `location /` block mein bhi yahi headers + timeouts lagao.
# WebSocket ke liye (live prices): is block mein `Upgrade` / `Connection` headers (docs: nginx proxy_pass ws).
```

**APK mein 504** = nginx/proxy ne **`127.0.0.1:PORT`** par Node se jawab **time limit** ke andar nahi paya (ya Node band / hang / DB slow). **APK code se fix nahi** — server check:

1. SSH: `curl -sS --max-time 5 http://127.0.0.1:4000/api/ping` → `pong` (PORT = `.env` `PORT`). Na ho to **`pm2 logs iqfxpro`**, `.env`, MySQL — app crash / DB connect stall = timeout.
2. Nginx vhost mein upar wale **`proxy_*_timeout`** add karo, **`nginx -t`** → reload. CloudPanel: site → **Vhost** / custom nginx snippet.
3. **Cloudflare** use ho to kabhi **524** bhi dikhta hai; **SSL/TLS → Full (strict)**, aur `/api` par aggressive cache mat lagao. Origin slow ho to CF edge timeout badhana ya route optimize karna pad sakta hai.

APK **WebView** mein live site kholta hai. Config: **`mobile-apk/capacitor.config.json`** → `server.url` (**`https://www.iqfxpro.com`**). Domains badalne ke baad: **`cd mobile-apk` → `npx cap sync android`** → naya APK build.

| Kaam | Command / jagah |
|------|-------------------|
| URL badalna | `mobile-apk/capacitor.config.json` edit → phir **`npx cap sync android`** |
| Sync + Studio | `cd mobile-apk` → `npm install` → `npx cap sync android` → `npx cap open android` (ya Studio se **`mobile-apk/android`** open) |
| Release APK | Android Studio → **Build → Build APK(s)** (ya signed bundle Play ke liye) |
| **Site par “Download APK”** | PC: Studio se APK build → **`npm run apk:sync`** → `releases/Iqfxpro.apk` bane; SFTP se VPS **`.../releases/Iqfxpro.apk`**. Server: **`pm2 restart`**. (Ya `.env` **`APK_FILE_PATH=/home/.../Iqfxpro.apk`**.) Link: **`GET /api/system/android-apk`**. |
| Download **`mobile-app.html`** / HTML instead of APK | **`/api/...` Node tak nahi ja raha** — static/SPA ne `index.html` de diya. **Fix:** Nginx mein **`location /api/`** → Node, **`location /` se pehle**. |
| VPS par `curl` → **`Could not resolve host`** | Galat domain spelling ya server DNS — `https://www.iqfxpro.com` verify karo, ya test: `curl -I http://127.0.0.1:PORT/...` |
| `curl -I http://127.0.0.1:PORT/api/system/android-apk` → **404** + chhota HTML | **Purana `dist`** chal raha hai — server par: `grep android-apk dist/server.js` (kuch lines dikhni chahiye). Phir **`npm run build`**, **`npm run build:all`** (agar frontend bhi), **`pm2 restart`**. |
| APK route live hai? | `curl -I http://127.0.0.1:PORT/api/ping` → header **`X-Served-By: iqfxpro-raw`**. Phir `curl -I http://127.0.0.1:PORT/api/system/android-apk` → **`application/vnd.android.package-archive`** (file ho to) ya lamba HTML “APK file missing” (file na ho). |
| **APK WebView par 504** | Node up + fast `curl /api/ping` (neeche step 1). Phir nginx **`proxy_read_timeout`** / **`send_timeout`** (snippet upar). Phir Cloudflare/origin. |

**Zyaadaatar web fix:** sirf server par **`npm run build:all`** + deploy — **naya APK zaroori nahi** (user app band–khole to naya UI load ho sakta hai).

**Naya APK zaroori jab:** `server.url` / app name / icons / native permissions badlein.

Poori detail (Windows path, cleartext HTTP, cache): **`mobile-apk/README.md`**, **`releases/README.md`**.

---

*Paths / PM2 naam apne server ke hisaab se badlo — production ke liye upar wale `iqfxpro` / `www.iqfxpro.com` defaults use karo.*