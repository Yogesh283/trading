/**
 * Dev + unified port (`npm run dev`): same origin → "" for /api and /ws.
 * Dev + separate frontend (`npm run dev:api-only` + frontend on 5173): "" + Vite proxy.
 * Prod: `VITE_API_URL` if set; else same origin "" (reverse proxy serves /api on 443).
 *       Do not use :3000 on public domains — that port is usually closed.
 */
/**
 * Admin panel: on localhost always use same-origin API (local DB).
 * Otherwise a production `VITE_API_URL` baked into the build can point the admin UI at the wrong server.
 */
/** Admin custom APIs: `admin/user-insights` → `/api/admin/user-insights` (or absolute with origin). */
export function getAdminApiUrl(apiPath: string): string {
  const o = getBackendHttpOriginLocalAdmin().replace(/\/$/, "");
  const p = apiPath.replace(/^\//, "");
  return o ? `${o}/api/${p}` : `/api/${p}`;
}

export function getBackendHttpOriginLocalAdmin(): string {
  if (typeof window !== "undefined") {
    const h = window.location.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1") {
      return "";
    }
  }
  return getBackendHttpOrigin();
}

export function getBackendHttpOrigin(): string {
  const explicit = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return "";
  }
  if (typeof window === "undefined") {
    return "http://127.0.0.1:3000";
  }
  const { hostname, protocol } = window.location;
  const proto = protocol === "https:" ? "https" : "http";
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${proto}://${hostname}:3000`;
  }
  // Live: Nginx/CloudPanel proxies https://domain/api → Node — use same origin
  return "";
}

export type BackendWsAuth = { token: string; wallet: "demo" | "live" };

/**
 * Logged-in: pass `auth` so `/ws` sends your demo or live account snapshot (not guest demo).
 * Token is in query string — use WSS in production; avoid sharing dev URLs.
 */
export function getBackendWsUrl(auth?: BackendWsAuth | null): string {
  const explicit = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  let path: string;
  if (explicit) {
    const base = explicit.replace(/\/$/, "");
    path = base.replace(/^http/, "ws") + "/ws";
  } else if (!import.meta.env.DEV) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    path = `${proto}//${window.location.host}/ws`;
  } else {
    const http = getBackendHttpOrigin();
    if (!http) {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      path = `${proto}//${window.location.host}/ws`;
    } else {
      path = http.replace(/^http/, "ws") + "/ws";
    }
  }

  if (auth?.token) {
    const q = new URLSearchParams({
      token: auth.token,
      wallet: auth.wallet
    });
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}${q.toString()}`;
  }
  return path;
}
