/**
 * Monthly investment ROI (1st UTC only): principal × admin ROI % + 5-level on yield.
 * Crontab example (1st 00:10 UTC):
 *   10 0 1 * * cd /path/to/updownfx && npx tsx scripts/investment-cron.ts
 */
import { initAppDb } from "../src/db/appDb";
import { runInvestmentMonthlyYield } from "../src/services/investmentStore";

async function main() {
  await initAppDb();
  const r = await runInvestmentMonthlyYield();
  console.log(JSON.stringify({ ok: true, ...r }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
