import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.join(root, "..");
const srcDir = path.join(repoRoot, "src", "Public", "Img");
const outDir = path.join(root, "public", "brand");

const map = [
  ["logo.png", "logo.png"],
  ["I.JPG.jpeg", "banner1.jpeg"],
  ["2.jpg.jpeg", "banner2.jpeg"],
  ["3.jpg", "banner3.jpeg"]
];

fs.mkdirSync(outDir, { recursive: true });
for (const [from, to] of map) {
  fs.copyFileSync(path.join(srcDir, from), path.join(outDir, to));
}
console.log("Synced brand images → frontend/public/brand/");

/** APK launcher: same logo into Capacitor Android res (if folder exists). */
const logoSrc = path.join(outDir, "logo.png");
const androidRes = path.join(repoRoot, "mobile-apk", "android", "app", "src", "main", "res");
if (fs.existsSync(logoSrc) && fs.existsSync(androidRes)) {
  fs.copyFileSync(logoSrc, path.join(androidRes, "drawable", "ic_brand_logo.png"));
  for (const dir of fs.readdirSync(androidRes)) {
    if (!dir.startsWith("mipmap-")) continue;
    const mipmapDir = path.join(androidRes, dir);
    for (const name of ["ic_launcher.png", "ic_launcher_round.png"]) {
      const dest = path.join(mipmapDir, name);
      if (fs.existsSync(dest)) {
        fs.copyFileSync(logoSrc, dest);
      }
    }
  }
  console.log("Synced logo.png → mobile-apk Android mipmaps + drawable/ic_brand_logo.png");
}
