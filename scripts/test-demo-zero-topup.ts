/**
 * Local check: demo_balance 0 → saveDemoBalanceToDb tops up to DEFAULT;
 * non-zero unchanged (no accidental top-up).
 *
 * Usage (from repo root): npx tsx scripts/test-demo-zero-topup.ts
 * Requires: MySQL running, .env MYSQL_*, at least one row in wallets.
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { DEFAULT_DEMO_BALANCE_INR } from "../src/config/demo";
import { dbGet, dbRun, initAppDb } from "../src/db/appDb";
import { saveDemoBalanceToDb } from "../src/services/walletStore";

async function main() {
  await initAppDb();
  const row = await dbGet<{ user_id: string }>(
    "SELECT user_id FROM wallets ORDER BY updated_at DESC LIMIT 1"
  );
  if (!row?.user_id) {
    console.error("FAIL: no row in wallets — register a user or run db:mysql first.");
    process.exit(1);
  }
  const uid = String(row.user_id);

  await dbRun("UPDATE wallets SET demo_balance = 0 WHERE user_id = ?", [uid]);
  const afterZero = await saveDemoBalanceToDb(uid, 0);
  const ok1 = Math.abs(afterZero - DEFAULT_DEMO_BALANCE_INR) < 0.02;
  console.log(
    `[1] saveDemoBalanceToDb(0) => ${afterZero} (DEFAULT_DEMO_BALANCE_INR=${DEFAULT_DEMO_BALANCE_INR}) ${ok1 ? "OK" : "FAIL"}`
  );

  await dbRun("UPDATE wallets SET demo_balance = ? WHERE user_id = ?", [50000, uid]);
  const after50k = await saveDemoBalanceToDb(uid, 50000);
  const ok2 = Math.abs(after50k - 50000) < 0.02;
  console.log(`[2] saveDemoBalanceToDb(50000) => ${after50k} (expect 50000) ${ok2 ? "OK" : "FAIL"}`);

  process.exit(ok1 && ok2 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
