import { getBackendHttpOrigin } from "./backendOrigin";

/** Running inside the Capacitor Android/iOS shell (WebView). Hide website-only “Download APK” promos. */
export function isCapacitorNativeClient(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (typeof document !== "undefined" && document.documentElement.classList.contains("cap-native")) {
      return true;
    }
    return Boolean(
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
    );
  } catch {
    return false;
  }
}

export type AndroidAppInfo = {
  versionCode: number;
  versionName: string;
  downloadUrl: string;
  apkReady: boolean;
};

export async function fetchAndroidAppInfo(): Promise<AndroidAppInfo | null> {
  const base = getBackendHttpOrigin().replace(/\/$/, "");
  const url = `${base}/api/system/android-app-info`;
  try {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) return null;
    const j = (await r.json()) as AndroidAppInfo;
    if (typeof j.versionCode !== "number" || !j.versionName) return null;
    return j;
  } catch {
    return null;
  }
}

/** Capacitor Android only — `build` is `versionCode` as string. */
export async function getNativeAndroidVersionCode(): Promise<number | null> {
  try {
    const Cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (!Cap?.isNativePlatform?.()) return null;
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    const n = parseInt(String(info.build), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
