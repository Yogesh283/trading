/**
 * Daily investment yield (10% monthly ≈ 10/30 per day on invested principal).
 * Crontab example (00:10 UTC):
 *   10 0 * * * cd /path/to/updownfx && npx tsx scripts/investment-cron.ts
 */
import { initAppDb } from "../src/db/appDb";
import { runInvestmentDailyYield } from "../src/services/investmentStore";

async function main() {
  await initAppDb();
  const r = await runInvestmentDailyYield();
  console.log(JSON.stringify({ ok: true, ...r }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
