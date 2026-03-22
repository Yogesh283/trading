/** Product name — use everywhere in UI */
export const APP_NAME = "UpDown FX";
export const SESSION_STORAGE_KEY = "updownfx-session";

const viteBase = import.meta.env.BASE_URL || "/";
const baseWithSlash = viteBase.endsWith("/") ? viteBase : `${viteBase}/`;

/**
 * Android APK download link for the landing page.
 * - Set `VITE_APK_DOWNLOAD_URL` in `.env` to any full URL (Drive, CDN, your server).
 * - Or build the APK and copy it to `frontend/public/downloads/UpDownFX.apk` (default path below).
 */
export const APK_DOWNLOAD_URL: string =
  (import.meta.env.VITE_APK_DOWNLOAD_URL as string | undefined)?.trim() ||
  `${baseWithSlash}downloads/UpDownFX.apk`;
