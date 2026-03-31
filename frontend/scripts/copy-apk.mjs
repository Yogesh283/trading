/**
 * Copy latest Android build → public/downloads/Iqfxpro.apk so Vite build + "Download APK" work.
 * Safe no-op if no APK built yet (does not fail prebuild).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");
const dest = path.join(frontendRoot, "public", "downloads", "Iqfxpro.apk");

const sources = [
  path.join(repoRoot, "mobile-apk", "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
  path.join(repoRoot, "mobile-apk", "android", "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk"),
  path.join(repoRoot, "mobile-apk", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk")
];

for (const src of sources) {
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log("[copy-apk] Copied to public/downloads/Iqfxpro.apk ←", path.relative(repoRoot, src));
    process.exit(0);
  }
}

console.log(
  "[copy-apk] No APK in mobile-apk/android/app/build/outputs/apk — skip (build in Android Studio first, or copy Iqfxpro.apk manually to frontend/public/downloads/)"
);
