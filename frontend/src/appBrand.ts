/** Primary UI gold (#EAB308) — match marketing / APK brand swatch */
export const BRAND_GOLD = "#eab308";

/** Product name — use everywhere in UI */
export const APP_NAME = "IQFX Pro";
/** Support / contact — mailto + copy only */
export const SUPPORT_EMAIL = "support@iqfxpro.com";

/**
 * Official Telegram (channel / support): https://t.me/IQFxP
 * Optional build override: `VITE_TELEGRAM_URL` in `frontend/.env` (full https://t.me/… URL).
 */
export const SUPPORT_TELEGRAM_URL =
  (import.meta.env.VITE_TELEGRAM_URL as string | undefined)?.trim() || "https://t.me/IQFxP";

/**
 * Shown on Terms & Privacy (“Last updated”). Update when you change legal text.
 * Format: ISO date string (YYYY-MM-DD).
 */
export const LEGAL_LAST_UPDATED_ISO = "2026-03-28";
/** Two-colour wordmark segments (must match `APP_NAME`). */
export const APP_NAME_MARK_PRIMARY = "IQFX";
export const APP_NAME_MARK_SECONDARY = "Pro";
/** Suggested APK download filename (no spaces). */
export const APK_FILENAME = "Iqfxpro.apk";
export const SESSION_STORAGE_KEY = "iqfxpro-session";
/** Logged-in only: last chosen trading wallet (demo vs live). */
export const USER_ACCOUNT_WALLET_STORAGE_KEY = "iqfxpro-user-account-wallet";

const viteBase = import.meta.env.BASE_URL || "/";
const baseWithSlash = viteBase.endsWith("/") ? viteBase : `${viteBase}/`;

/**
 * Android APK download link for the landing page.
 * - Set `VITE_APK_DOWNLOAD_URL` in `.env` to any full URL (Drive, CDN, your server).
 * - Default: `/api/system/android-apk` — same namespace as `/api/system/database` (usually proxied to Node).
 *   Avoid `/api/mobile-app` on some hosts: request can fall through to SPA HTML → save as `mobile-app.html`.
 * - Also: `/api/android-app.apk`, `/downloads/Iqfxpro.apk`, `/api/mobile-app` (same file on Node).
 */
export const APK_DOWNLOAD_URL: string =
  (import.meta.env.VITE_APK_DOWNLOAD_URL as string | undefined)?.trim() ||
  `${baseWithSlash}api/system/android-apk`;
