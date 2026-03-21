# Deploy: local → GitHub → live server

Yeh flow **UpDown FX / trading** repo ke liye hai. Code **direct paste** se server par nahi jata — **Git push → server par `git pull` + build** se jata hai.

---

## 1) Local (Windows — Git Bash)

### Project folder (galti mat karna)

- Asli project: **`d:\xampp\htdocs\tradeing`** (root jahan `package.json` hai).
- Is root ke **andar** dubara `git clone ... trading` **mat karo** — nested repo / submodule ban jata hai.

### Har change ke baad GitHub par bhejna

```bash
cd /d/xampp/htdocs/tradeing
git status
git add .
git commit -m "describe your change"
git push origin main
```

### SSH push ke liye (naya Git Bash har baar)

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
git push origin main
```

### Local aur GitHub same commit?

```bash
cd /d/xampp/htdocs/tradeing
git log -1 --oneline
```

---

## 2) GitHub

- Remote: `git@github.com:Yogesh283/trading.git` (SSH) ya HTTPS.
- Branch: **`main`**.

---

## 3) Live server (Ubuntu / CloudPanel VPS)

### Server par app kahan hai (example)

Aksar clone yahan hota hai:

```text
/home/updowanfx/htdocs/updowanfx-app
```

**`updowanfx.com`** folder = CloudPanel ka **document root** ho sakta hai. Agar domain **sirf is folder se static** chala raha ho to **naya Node app nahi dikhega**.  
**Zaroori:** Domain **`updowanfx.com` → reverse proxy → `http://127.0.0.1:3000`** (jahan PM2 Node chala raha ho). Details neeche §5 mein.

**Tumhara setup:** Agar repo **`/home/updowanfx/htdocs/updowanfx.com`** mein hai (document root = hi app folder), to **theek hai** — bas har jagah `cd` isi path par karo, `updowanfx-app` optional hai.

### Pehli baar: GitHub se clone (HTTPS — server par SSH key optional)

```bash
cd /home/updowanfx/htdocs
git clone https://github.com/Yogesh283/trading.git updowanfx-app
cd updowanfx-app
```

### Pehli baar: env + install + build

```bash
cd /home/updowanfx/htdocs/updowanfx-app
cp .env.example .env
nano .env
```

`.env` mein `PORT`, DB (`MYSQL_*` ya SQLite), secrets bharo.

```bash
npm ci
npm run build:all
```

### PM2 se chalana

```bash
npm install -g pm2
cd /home/updowanfx/htdocs/updowanfx-app
pm2 start dist/index.js --name updowanfx
pm2 save
pm2 startup
```

`pm2 startup` jo **`sudo` command** print kare, woh **ek baar** chalao.

### Har deploy (local push ke baad)

```bash
cd /home/updowanfx/htdocs/updowanfx-app
git pull origin main
npm ci
npm run build:all
pm2 restart updowanfx
```

### Verify: server commit = GitHub

```bash
cd /home/updowanfx/htdocs/updowanfx-app
git fetch origin
git log -1 --oneline
```

Local `git log -1` se **hash match** karna chahiye.

---

## 4) Node.js version

Project **`engines`: Node >= 20** maangta hai. Server par check:

```bash
node -v
```

Agar **v18** hai to upgrade (Ubuntu example):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get update
apt-get install -y nodejs
node -v
```

Phir:

```bash
cd /home/updowanfx/htdocs/updowanfx-app
rm -rf node_modules frontend/node_modules
npm ci
npm run build:all
pm2 restart updowanfx
```

---

## 5) Domain `updowanfx.com` — CloudPanel / Nginx

**Sirf `updowanfx.com` folder mein files copy karne se poora app nahi chalega** — `/api` aur `/ws` **Node** par chahiye.

1. CloudPanel → **Site `updowanfx.com`** → **Vhost / Reverse Proxy / Nginx** (PHP-only site se **reverse proxy** par badlo).
2. Traffic **`http://127.0.0.1:3000`** par proxy karo (`.env` ka `PORT` jaisa ho — mismatch = 502/500).
3. **WebSocket** path **`/ws`** bhi isi backend ko jaye (Nginx: `Upgrade`, `Connection` headers).

Jab tak yeh proxy set nahi, **purana static UI** dikhega chahe build sahi ho.

### Folder permissions (File Manager mein `0600` / `root:root` dikh raha ho)

Agar site folder **`root:root`** aur **`0600`** hai to **site user `updowanfx`** / Nginx ko problem ho sakti hai. SSH (root) par:

```bash
SITE=/home/updowanfx/htdocs/updowanfx.com
chown -R updowanfx:updowanfx "$SITE"
find "$SITE" -type d -exec chmod 755 {} \;
find "$SITE" -type f -exec chmod 644 {} \;
```

PM2 ab bhi `root` se chala sakte ho; isse File Manager / future non-root runs theek rehte hain.

### PM2 `errored` + `ZodError` / `USDT_BEP20_DEPOSIT_ADDRESS`

Agar **`updowanfx-error.log`** mein **`USDT_BEP20_DEPOSIT_ADDRESS`** regex error ho:

- `.env` mein value **exactly** `0x` + **40 hex** (total 42 chars), **bina** extra space / quotes.
- Galat paste ho to **line hata do** ya **khali** chhodo → default address use hoga (latest code mein quotes/BOM/spaces strip bhi hota hai).
- Fix ke baad: `pm2 restart updowanfx` → **`pm2 status`** = **online**.

```bash
grep USDT_BEP20 /home/updowanfx/htdocs/updowanfx.com/.env
```

---

### `500 Internal Server Error` — pehle yeh check (server par)

```bash
# .env ka PORT dekho (example 3000)
grep ^PORT= /home/updowanfx/htdocs/updowanfx.com/.env

# Seedha Node se response (Nginx ke bina)
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
curl -sS http://127.0.0.1:3000/api/health
```

- Agar **`curl` = 200** lekin browser mein **500** → **Nginx / CloudPanel** config (galat port, PHP handler, proxy off).
- Agar **`curl` bhi 500** → **`pm2 logs updowanfx --lines 80`** aur error fix karo (DB, `.env`, missing `frontend/dist`).
- **`/api/ping`** / **`/api/health`** par header **`X-Served-By: updownfx-raw`** dikhna chahiye (Node `http` layer, Express se pehle).  
  - **Header hai + `pong` / JSON** → Node sahi; agar sirf **`/`** 500 ho to Express/static dekhna.  
  - **Header nahi + purana HTML Error** → **3000 par yeh PM2 process nahi** — chalao: `ss -tlnp | grep ':3000'` aur PM2 `script path` verify karo.

```bash
curl -sSI http://127.0.0.1:3000/api/ping | head -20
```

**`/api/ping` par Helmet / CSP headers dikh rahe hon aur `X-Served-By: updownfx-raw` na ho** → server par **purana `dist`** ya **GitHub par purana `src/server.ts`** (Windows se **push** nahi hua).  
`dist/` repo mein **gitignore** hai — sirf **`src`** pull hota hai; **`npm run build`** se `dist` banta hai.

```bash
# Server par — latest code aaya?
grep -n updownfx-raw /home/updowanfx/htdocs/updowanfx.com/src/server.ts
grep -n updownfx-raw /home/updowanfx/htdocs/updowanfx.com/dist/server.js
```

Pehle command mein kuch na aaye → **`git pull` pe naya commit nahi** — local PC se `git push origin main` karo.  
Dusre mein na aaye → **`npm run build`** chalao (ab `build` ke andar **`verify:dist`** bhi hai; fail ho to `src` update karo).

Nginx error log (path CloudPanel ke hisaab se badal sakta hai):

```bash
tail -50 /home/updowanfx/logs/nginx/error.log 2>/dev/null || tail -50 /var/log/nginx/error.log
```

---

## 6) GitHub known_hosts (server — SSH clone agar use ho)

```bash
mkdir -p ~/.ssh
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
```

`Are you sure you want to continue connecting (yes/no)?` aaye to **`yes`** likho.

---

## 7) Galatiyan jo mat karna

| Galati | Natija |
|--------|--------|
| Terminal mein **poora log paste** karna | Har line command ban jati hai → errors |
| `cd d:\xampp\...` Git Bash mein | `\x` break — use: `cd /d/xampp/htdocs/tradeing` |
| Push bina commit | Server `pull` se naya code nahi aayega |
| `updowanfx-app` update, domain static `updowanfx.com` | Live purana dikhega — **proxy fix** karo |
| Nested `trading/` folder root mein add | Submodule bug — `.gitignore` mein `trading/` ignore hai |

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

**Server → live update** (jo folder use ho — `updowanfx.com` **ya** `updowanfx-app`)

```bash
cd /home/updowanfx/htdocs/updowanfx.com   # ya: updowanfx-app
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

## 9) Browser

Naya frontend ke baad: **Ctrl+F5** (hard refresh) ya incognito — purana JS cache se na dikhe.

---

*Is file ko update rakho jab server path, PM2 name, ya CloudPanel steps badlen.*
