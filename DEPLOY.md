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
**Zaroori:** Domain **`updownfx.com` → reverse proxy → `http://127.0.0.1:3000`** (jahan PM2 Node chala raha ho). Details neeche §5 mein.

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

## 5) Domain `updownfx.com` — CloudPanel / Nginx

**Sirf `updowanfx.com` folder mein files copy karne se poora app nahi chalega** — `/api` aur `/ws` **Node** par chahiye.

1. CloudPanel → **Site `updownfx.com`** → **Vhost / Reverse Proxy / Nginx**.
2. Traffic **`http://127.0.0.1:3000`** par proxy karo (`.env` ka `PORT` jaisa ho).
3. **WebSocket** path **`/ws`** bhi isi backend ko jaye (Nginx: `Upgrade`, `Connection` headers).

Jab tak yeh proxy set nahi, **purana static UI** dikhega chahe `updowanfx-app` par build sahi ho.

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

**Server → live update**

```bash
cd /home/updowanfx/htdocs/updowanfx-app
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
