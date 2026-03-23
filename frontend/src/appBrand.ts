/** Product name — use everywhere in UI */
export const APP_NAME = "UpDown FX";
export const SESSION_STORAGE_KEY = "updownfx-session";
/** Logged-in only: last chosen trading wallet (demo vs live). */
export const USER_ACCOUNT_WALLET_STORAGE_KEY = "updownfx-user-account-wallet";

const viteBase = import.meta.env.BASE_URL || "/";
const baseWithSlash = viteBase.endsWith("/") ? viteBase : `${viteBase}/`;

/**
 * Android APK download link for the landing page.
 * - Set `VITE_APK_DOWNLOAD_URL` in `.env` to any full URL (Drive, CDN, your server).
 * - Default: `/api/system/android-apk` — same namespace as `/api/system/database` (usually proxied to Node).
 *   Avoid `/api/mobile-app` on some hosts: request can fall through to SPA HTML → save as `mobile-app.html`.
 * - Also: `/api/android-app.apk`, `/downloads/UpDownFX.apk`, `/api/mobile-app` (same file on Node).
 */
export const APK_DOWNLOAD_URL: string =
  (import.meta.env.VITE_APK_DOWNLOAD_URL as string | undefined)?.trim() ||
  `${baseWithSlash}api/system/android-apk`;
