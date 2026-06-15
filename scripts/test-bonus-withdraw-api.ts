/**
 * Quick local check: POST /api/withdrawals?wallet=bonus responds in <10s (no auth = 401 fast).
 * Usage: npx tsx scripts/test-bonus-withdraw-api.ts
 */
const base = process.env.API_BASE ?? "http://127.0.0.1:3000";

async function main() {
  const t0 = Date.now();
  const res = await fetch(`${base}/api/withdrawals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Account-Type": "bonus" },
    body: JSON.stringify({
      amount: 10,
      toAddress: "0x8A239732871AdC8829EA2f47e94087C5FBad47b6",
      tpin: "1234",
      wallet: "bonus",
      source: "bonus",
      sourceWallet: "bonus"
    }),
    signal: AbortSignal.timeout(10_000)
  });
  const ms = Date.now() - t0;
  const text = await res.text();
  console.log(`status=${res.status} ms=${ms}`);
  console.log(text.slice(0, 300));
  if (ms > 9000) {
    console.error("FAIL: slower than 9s");
    process.exit(1);
  }
  if (res.status === 404) {
    console.error("FAIL: route missing — restart npm run dev after pull");
    process.exit(1);
  }
  console.log("OK: route responds quickly (401/400 expected without valid token)");
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
