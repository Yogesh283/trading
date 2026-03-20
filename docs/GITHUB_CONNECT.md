# GitHub se connect karna — `Yogesh283/trading`

Remote URL: **`git@github.com:Yogesh283/trading.git`** (SSH)

---

## 0) ⚠️ Galati: `git init` home folder (`~`) par mat chalao

Agar aapko **`AppData/Local/Microsoft/Edge/...`** ya **`LF will be replaced by CRLF`** jaise paths dikhe, matlab Git **project** mein nahi, **`C:\Users\LENOVO` (home)** par chal raha hai. Yeh **galat** hai — pura user profile + browser cache track ho jata hai.

### Theek kaise karein

**Git Bash** mein pehle check karo:

```bash
pwd
```

Agar `C:/Users/LENOVO` dikhe to **project folder** mein jao:

```bash
cd /d/xampp/htdocs/tradeing
pwd
```

### Home par galti se `git init` ho chuka ho to

Sirf **home** wala Git hatao (project par asar nahi, agar project alag folder mein hai):

**Git Bash:**

```bash
cd ~
rm -rf .git
```

(Confirm karo pehle `pwd` se ke aap `~` par ho, `tradeing` folder mein nahi.)

Phir **sirf project** mein dubara:

```bash
cd /d/xampp/htdocs/tradeing
git init
```

### `Author identity unknown` / commit fail

Pehle naam + email set karo (GitHub wala email use karo):

```bash
git config --global user.name "Yogesh283"
git config --global user.email "aapka-email@example.com"
```

Sirf is repo ke liye (optional):

```bash
cd /d/xampp/htdocs/tradeing
git config user.name "Yogesh283"
git config user.email "aapka-email@example.com"
```

### LF / CRLF warnings

Windows par yeh **warning** aksar normal hai. Asli project ke liye repo root par **`.gitattributes`** (`* text=auto`) use ho raha hai. Edge cache files **commit mat karo** — unka reason hi galat folder tha.

### `Permission denied (publickey)` push par

Matlab **SSH key** GitHub account par add nahi hai (ya galat key).

**Jaldi fix — HTTPS remote:**

```bash
cd /d/xampp/htdocs/tradeing
git remote set-url origin https://github.com/Yogesh283/trading.git
git push -u origin main
```

Password ki jagah GitHub **Personal Access Token** (repo access) use karo.

**SSH rakhna ho to:** `~/.ssh/id_ed25519.pub` (ya `id_rsa.pub`) ki poori line GitHub → **Settings → SSH and GPG keys** par add karo, phir `ssh -T git@github.com` test karo.

---

## 1) Git install (agar nahi hai)

- Download: https://git-scm.com/download/win  
- Install karte waqt **“Git from the command line and also from 3rd-party software”** chuno.  
- PC restart / naya terminal khol kar `git --version` check karo.

## 2) SSH key GitHub par (SSH URL ke liye)

PowerShell:

```powershell
ssh-keygen -t ed25519 -C "your-email@example.com"
```

Public key dikhao aur copy karo:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

GitHub → **Settings → SSH and GPG keys → New SSH key** → paste karo.

Test:

```powershell
ssh -T git@github.com
```

## 3) HTTPS use karna ho to (SSH ki jagah)

Remote aise hogi:

```text
https://github.com/Yogesh283/trading.git
```

(Password ki jagah **Personal Access Token** use hota hai.)

---

## 4) Project folder mein repo connect

**Pehle hamesha `cd` — bina iske `git add` mat chalao.**

PowerShell:

```powershell
cd D:\xampp\htdocs\tradeing
git init
git remote add origin git@github.com:Yogesh283/trading.git
git branch -M main
```

Git Bash:

```bash
cd /d/xampp/htdocs/tradeing
git init
git remote add origin git@github.com:Yogesh283/trading.git
git branch -M main
```

Pehli baar push:

```powershell
git add .
git status
```

`git status` mein sirf **tradeing** project ki files dikhni chahiye — **AppData / Edge / Cache** nahi.

```powershell
git commit -m "Initial commit"
git push -u origin main
```

### Agar GitHub par pehle se `README` / files hon

```powershell
git pull origin main --allow-unrelated-histories
# merge conflicts fix karo agar aayein
git push -u origin main
```

### `rejected (fetch first)` / remote contains work you do not have locally

GitHub par repo banate waqt **README / .gitignore** add kiye hon to pehla push reject ho sakta hai.

```bash
cd /d/xampp/htdocs/tradeing
git pull origin main --allow-unrelated-histories
git push -u origin main
```

Conflict aaye to files fix karke `git add .` + `git commit` + `git push`.

**Sirf local ko maan na ho (remote history mita degi):** `git push -u origin main --force` — careful.

### Terminal paste: `^[[200~` / `command not found`

Cursor se paste kabhi **bracketed paste** junk ke sath aata hai — command **type** karo ya paste ke start ka garbage hata kar dubara run karo.

### Remote galat lag gay ho to

```powershell
git remote -v
git remote set-url origin git@github.com:Yogesh283/trading.git
```

---

## 5) `.env` / secrets

`.gitignore` mein `.env` hai — **kabhi commit mat karo**. Production par alag secrets use karo.
