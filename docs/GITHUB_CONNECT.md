# Connect to GitHub — `Yogesh283/trading`

Remote URL: **`git@github.com:Yogesh283/trading.git`** (SSH)

---

## 0) ⚠️ Mistake: do not run `git init` in your home folder (`~`)

If you see paths like **`AppData/Local/Microsoft/Edge/...`** or **`LF will be replaced by CRLF`**, Git is running in **`C:\Users\LENOVO` (home)**, not in the **project**. That is **wrong** — it would track your whole user profile and browser cache.

### How to fix it

In **Git Bash**, check first:

```bash
pwd
```

If you see `C:/Users/LENOVO`, go to the **project folder**:

```bash
cd /d/xampp/htdocs/tradeing
pwd
```

### If you accidentally ran `git init` in home

Remove only the **home** `.git` (no effect on the project if the project lives in another folder):

**Git Bash:**

```bash
cd ~
rm -rf .git
```

(Confirm with `pwd` first that you are in `~`, not inside the `tradeing` folder.)

Then again **only in the project**:

```bash
cd /d/xampp/htdocs/tradeing
git init
```

### `Author identity unknown` / commit fails

Set name + email first (use your GitHub email):

```bash
git config --global user.name "Yogesh283"
git config --global user.email "your-email@example.com"
```

For this repo only (optional):

```bash
cd /d/xampp/htdocs/tradeing
git config user.name "Yogesh283"
git config user.email "your-email@example.com"
```

### LF / CRLF warnings

On Windows this **warning** is often normal. This repo uses **`.gitattributes`** (`* text=auto`) at the root. **Do not commit** Edge cache files — that usually happened because the wrong folder was used.

### `Permission denied (publickey)` on push

Your **SSH key** is not added to GitHub (or the wrong key is used).

**Quick fix — HTTPS remote:**

```bash
cd /d/xampp/htdocs/tradeing
git remote set-url origin https://github.com/Yogesh283/trading.git
git push -u origin main
```

Use a GitHub **Personal Access Token** instead of a password (repo access).

**To keep SSH:** add the full line from `~/.ssh/id_ed25519.pub` (or `id_rsa.pub`) under GitHub → **Settings → SSH and GPG keys**, then run `ssh -T git@github.com`.

---

## 1) Install Git (if missing)

- Download: https://git-scm.com/download/win  
- During install choose **“Git from the command line and also from 3rd-party software”**.  
- Restart the PC or open a new terminal and run `git --version`.

## 2) SSH key on GitHub (for SSH URL)

PowerShell:

```powershell
ssh-keygen -t ed25519 -C "your-email@example.com"
```

Show and copy the public key:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

GitHub → **Settings → SSH and GPG keys → New SSH key** → paste.

Test:

```powershell
ssh -T git@github.com
```

## 3) Using HTTPS instead of SSH

Remote will look like:

```text
https://github.com/Yogesh283/trading.git
```

(Use a **Personal Access Token** instead of a password.)

---

## 4) Connect the repo in the project folder

**Always `cd` first — do not run `git add` without it.**

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

First push:

```powershell
git add .
git status
```

`git status` should show only **tradeing** project files — not **AppData / Edge / Cache**.

```powershell
git commit -m "Initial commit"
git push -u origin main
```

### If GitHub already has a `README` / files

```powershell
git pull origin main --allow-unrelated-histories
# resolve merge conflicts if any
git push -u origin main
```

### `rejected (fetch first)` / remote contains work you do not have locally

If you created the repo on GitHub with **README / .gitignore**, the first push may be rejected.

```bash
cd /d/xampp/htdocs/tradeing
git pull origin main --allow-unrelated-histories
git push -u origin main
```

If there are conflicts, fix files, then `git add .` + `git commit` + `git push`.

**To overwrite remote (destructive):** `git push -u origin main --force` — use with care.

### Terminal paste: `^[[200~` / `command not found`

Pasting from Cursor can include **bracketed paste** junk — **type** the command or remove the garbage at the start and run again.

### Wrong remote

```powershell
git remote -v
git remote set-url origin git@github.com:Yogesh283/trading.git
```

---

## 5) `.env` / secrets

`.env` is in **`.gitignore`** — **never commit it**. Use separate secrets in production.
