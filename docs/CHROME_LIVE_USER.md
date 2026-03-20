# Chrome live editing — one test user

Use **one fixed account** while you edit the UI in Chrome (DevTools, hot reload).

## 1) Backend: seed user (optional)

In **`.env`** (project root):

```env
SEED_CHROME_USER=1
NODE_ENV=development
```

Restart backend (`npm run dev`). First start **registers**:

| Field    | Value                    |
|----------|--------------------------|
| Email    | `chrome-live@local.test` |
| Password | `LiveEdit1!`             |

If the user already exists, the server skips creation (no error).

---

## 2) Chrome Console — log in without typing the form

1. Open the app: **`http://localhost:3000`** (`npm run dev` — same port) or **5173** if using `dev:api-only` + `frontend:dev`.
2. **F12** → **Console**.
3. Paste this and press **Enter**:

```javascript
(async () => {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "chrome-live@local.test",
      password: "LiveEdit1!"
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Login failed:", data.message || res.status);
    return;
  }
  localStorage.setItem(
    "updownfx-session",
    JSON.stringify({ mode: "user", token: data.token, user: data.user })
  );
  location.reload();
})();
```

Page reloads → you are logged in as that user. Edit CSS/JS in DevTools or your IDE with HMR.

---

## 3) No seed? Register once from Console

```javascript
(async () => {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Chrome Dev",
      email: "chrome-live@local.test",
      password: "LiveEdit1!"
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(data.message || res.status);
    return;
  }
  localStorage.setItem(
    "updownfx-session",
    JSON.stringify({ mode: "user", token: data.token, user: data.user })
  );
  location.reload();
})();
```

If email is already taken, use the **login** snippet above.

---

## 4) Production / Apache build

Replace `/api/...` with full API URL, e.g. `http://127.0.0.1:3000/api/auth/login`, or set `VITE_API_URL` when building the frontend.
