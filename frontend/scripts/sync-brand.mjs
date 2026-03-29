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

/** APK adaptive-icon foreground: prefer dedicated apk.jpeg, else logo.png → drawable/ic_brand_logo.* */
const androidRes = path.join(repoRoot, "mobile-apk", "android", "app", "src", "main", "res");
const drawableDir = path.join(androidRes, "drawable");
const launcherSrcCandidates = [
  path.join(outDir, "apk.jpeg"),
  path.join(outDir, "apk.jpg"),
  path.join(outDir, "logo.png")
];
const launcherSrc = launcherSrcCandidates.find((p) => fs.existsSync(p));
if (launcherSrc && fs.existsSync(androidRes)) {
  fs.mkdirSync(drawableDir, { recursive: true });
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const stale = path.join(drawableDir, `ic_brand_logo.${ext}`);
    if (fs.existsSync(stale)) {
      fs.unlinkSync(stale);
    }
  }
  const ext = path.extname(launcherSrc).replace(/^\./, "").toLowerCase();
  const outExt = ext === "jpeg" ? "jpg" : ext;
  fs.copyFileSync(launcherSrc, path.join(drawableDir, `ic_brand_logo.${outExt}`));
  for (const dir of fs.readdirSync(androidRes)) {
    if (!dir.startsWith("mipmap-")) {
      continue;
    }
    const mipmapDir = path.join(androidRes, dir);
    for (const name of ["ic_launcher.png", "ic_launcher_round.png"]) {
      const dest = path.join(mipmapDir, name);
      if (fs.existsSync(dest)) {
        fs.copyFileSync(launcherSrc, dest);
      }
    }
  }
  console.log(`Synced ${path.basename(launcherSrc)} → mobile-apk drawable/ic_brand_logo.${outExt} (+ mipmaps if present)`);
}
