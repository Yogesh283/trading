import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "..", "src", "Public", "Img");
const outDir = path.join(root, "public", "brand");

const map = [
  ["logo.png", "logo.png"],
  ["I.JPG.jpeg", "banner1.jpeg"],
  ["2.jpg.jpeg", "banner2.jpeg"]
];

fs.mkdirSync(outDir, { recursive: true });
for (const [from, to] of map) {
  fs.copyFileSync(path.join(srcDir, from), path.join(outDir, to));
}
console.log("Synced brand images → frontend/public/brand/");
