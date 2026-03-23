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
 * - Default: `/api/mobile-app` — no `.apk` in URL (some proxies block dots); served before Express/Vite.
 * - Also: `/api/android-app.apk`, `/downloads/UpDownFX.apk` (same file).
 */
export const APK_DOWNLOAD_URL: string =
  (import.meta.env.VITE_APK_DOWNLOAD_URL as string | undefined)?.trim() ||
  `${baseWithSlash}api/mobile-app`;
