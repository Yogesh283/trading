# Deploy — local → Git → live server

**Data ka flow:**

1. **PC** → `git push` → **GitHub** (`main` branch)  
2. **VPS** → `git pull` (ya reset) + `npm run build:all` + `pm2 restart` → **live site**

`git push` **direct server par nahi jaata**. Har baar server par SSH se commands chalani padti hain.

**Repo:** `https://github.com/Yogesh283/trading.git` · **Branch:** `main`  
**PC folder:** `d:\xampp\htdocs\tradeing`  
**Server folder (example):** `/home/updowanfx/htdocs/updowanfx.com`  
**PM2 name (example):** `updowanfx` — jo `pm2 list` mein ho wahi use karo.

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

```bash
cd /home/updowanfx/htdocs/updowanfx.com

git fetch origin
git log -1 --oneline origin/main
git log -1 --oneline
```

Agar **server wala hash purana** hai:

```bash
git restore frontend/tsconfig.tsbuildinfo 2>/dev/null || git checkout -- frontend/tsconfig.tsbuildinfo
git pull origin main
```

**Build + app restart (hamesha deploy ke baad):**

```bash
npm ci
npm run build:all
pm2 restart updowanfx
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
cd /home/updowanfx/htdocs/updowanfx.com
git fetch origin
git reset --hard origin/main
npm ci
npm run build:all
pm2 restart updowanfx
```

**Rule:** VPS par **`git commit` mat karo** — code PC se push, server par sirf **pull / reset** + build.

---

## 4) Typo / chhoti cheezein

| Problem | Fix |
|--------|-----|
| `it: command not found` | **`git pull`** likho — **`it pull`** nahi. |
| `frontend/dist/index.html` ENOENT | `npm run build:all` chalao (frontend build banega). |
| Node warning / Vite | Server par **`node -v`** — **v20.19+** behtar (`curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash -` phir `apt install nodejs`). |
| PM2 bar‑bar restart | `pm2 logs updowanfx --lines 80` — `.env`, DB, `PORT` dekho. |
| USDT address error in logs | `.env` mein `USDT_BEP20_DEPOSIT_ADDRESS` = **`0x` + 40 hex** ya line hata do. |

---

## 5) Pehli baar server par (reference)

```bash
cd /home/updowanfx/htdocs
git clone https://github.com/Yogesh283/trading.git updowanfx.com
cd updowanfx.com
cp .env.example .env && nano .env
npm ci && npm run build:all
npm install -g pm2
pm2 start dist/index.js --name updowanfx
pm2 save && pm2 startup
```

**Domain:** Nginx / CloudPanel se site ko **`http://127.0.0.1:3000`** (ya jo `.env` `PORT` ho) par **reverse proxy** karo; sirf static folder se Node API **`/api` / `/ws` nahi chalenge`.

---

## 6) Android APK (Capacitor)

**Nginx (APK / API):** `location /api/` block **`location /` se pehle** — warna `/api/...` SPA `index.html` ban jata hai → download **`mobile-app.html`**.

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

APK **WebView** mein live site kholta hai. Config: **`mobile-apk/capacitor.config.json`** → `server.url` (abhi **`https://updowanfx.com`**).

| Kaam | Command / jagah |
|------|-------------------|
| URL badalna | `mobile-apk/capacitor.config.json` edit → phir **`npx cap sync android`** |
| Sync + Studio | `cd mobile-apk` → `npm install` → `npx cap sync android` → `npx cap open android` (ya Studio se **`mobile-apk/android`** open) |
| Release APK | Android Studio → **Build → Build APK(s)** (ya signed bundle Play ke liye) |
| **Site par “Download APK”** | PC: Studio se APK build → **`npm run apk:sync`** → `releases/UpDownFX.apk` bane; SFTP se VPS **`.../releases/UpDownFX.apk`**. Server: **`pm2 restart`**. (Ya `.env` **`APK_FILE_PATH=/home/.../UpDownFX.apk`**.) Link: **`GET /api/system/android-apk`**. |
| Download **`mobile-app.html`** / HTML instead of APK | **`/api/...` Node tak nahi ja raha** — static/SPA ne `index.html` de diya. **Fix:** Nginx mein **`location /api/`** → Node, **`location /` se pehle**. |
| VPS par `curl` → **`Could not resolve host`** | Galat domain spelling (e.g. `updownanfx` vs **`updowanfx`**) ya server DNS — browser wala sahi domain use karo, ya test: `curl -I http://127.0.0.1:PORT/...` |
| `curl -I http://127.0.0.1:3000/api/system/android-apk` → **404** + chhota HTML | **Purana `dist`** chal raha hai — server par: `grep android-apk dist/server.js` (kuch lines dikhni chahiye). Phir **`npm run build`**, **`npm run build:all`** (agar frontend bhi), **`pm2 restart`**. |
| APK route live hai? | `curl -I http://127.0.0.1:PORT/api/ping` → header **`X-Served-By: updownfx-raw`**. Phir `curl -I http://127.0.0.1:PORT/api/system/android-apk` → **`application/vnd.android.package-archive`** (file ho to) ya lamba HTML “APK file missing” (file na ho). |

**Zyaadaatar web fix:** sirf server par **`npm run build:all`** + deploy — **naya APK zaroori nahi** (user app band–khole to naya UI load ho sakta hai).

**Naya APK zaroori jab:** `server.url` / app name / icons / native permissions badlein.

Poori detail (Windows path, cleartext HTTP, cache): **`mobile-apk/README.md`**, **`releases/README.md`**.

---

*Paths / PM2 naam apne server ke hisaab se badlo.*
