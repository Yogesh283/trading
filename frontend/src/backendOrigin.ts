/**
 * Dev + unified port (`npm run dev`): same origin → "" for /api and /ws.
 * Dev + separate frontend (`npm run dev:api-only` + frontend on 5173): "" + Vite proxy.
 * Prod: `VITE_API_URL` if set; else same origin "" (reverse proxy serves /api on 443).
 *       Do not use :3000 on public domains — that port is usually closed.
 */
/**
 * Admin panel: localhost par hamesha same-origin API (local DB).
 * Warna production `VITE_API_URL` build ke andar ho to admin galat server ko hit karta hai.
 */
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

export function getBackendWsUrl(): string {
  const explicit = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (explicit) {
    const base = explicit.replace(/\/$/, "");
    return base.replace(/^http/, "ws") + "/ws";
  }
  if (!import.meta.env.DEV) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }
  const http = getBackendHttpOrigin();
  if (!http) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }
  return http.replace(/^http/, "ws") + "/ws";
}
