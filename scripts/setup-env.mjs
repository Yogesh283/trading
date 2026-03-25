/**
 * First-time dev: copy .env.example → .env when missing (root + optional frontend).
 * Safe to run multiple times — never overwrites existing .env.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function copyIfMissing(relSrc, relDest) {
  const src = path.join(root, relSrc);
  const dest = path.join(root, relDest);
  if (fs.existsSync(dest)) {
    console.log("[setup-env] keep existing:", relDest);
    return;
  }
  if (!fs.existsSync(src)) {
    console.warn("[setup-env] skip (no source):", relSrc);
    return;
  }
  fs.copyFileSync(src, dest);
  console.log("[setup-env] created", relDest, "←", relSrc);
}

copyIfMissing(".env.example", ".env");
copyIfMissing("frontend/.env.example", "frontend/.env");
console.log("[setup-env] done.");
