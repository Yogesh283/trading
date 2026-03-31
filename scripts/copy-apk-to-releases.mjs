/**
 * Copy Iqfxpro.apk → releases/Iqfxpro.apk (VPS deploy: upload this folder or single file via SFTP).
 * Sources (first hit wins): Android Studio outputs → public/downloads → dist/downloads.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dest = path.join(repoRoot, "releases", "Iqfxpro.apk");

const sources = [
  path.join(repoRoot, "mobile-apk", "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
  path.join(repoRoot, "mobile-apk", "android", "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk"),
  path.join(repoRoot, "mobile-apk", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"),
  path.join(repoRoot, "frontend", "public", "downloads", "Iqfxpro.apk"),
  path.join(repoRoot, "frontend", "dist", "downloads", "Iqfxpro.apk"),
  path.join(repoRoot, "frontend", "public", "downloads", "UpDownFX.apk"),
  path.join(repoRoot, "frontend", "dist", "downloads", "UpDownFX.apk")
];

for (const src of sources) {
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log("[copy-apk-to-releases] → releases/Iqfxpro.apk ←", path.relative(repoRoot, src));
    process.exit(0);
  }
}

console.error(
  "[copy-apk-to-releases] No APK found. Do one of:\n" +
    "  1) Build in Android Studio (mobile-apk/android), then run again\n" +
    "  2) npm run copy-apk  (copies build → frontend/public/downloads/) then npm run copy-apk:releases\n" +
    "  3) Manually copy any Iqfxpro.apk to releases/Iqfxpro.apk"
);
process.exit(1);
