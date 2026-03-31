/**
 * User-app smoke test (markets, deposit info, login, wallet, trades, referrals).
 * Run while API is up: npm run test:user-side
 *
 * Optional env:
 *   TEST_API_URL=http://127.0.0.1:3000
 *   TEST_USER_EMAIL=you@example.com     (defaults to TEST_ADMIN_EMAIL or chrome-live@local.test)
 *   TEST_USER_PASSWORD=yourpassword       (defaults to TEST_ADMIN_PASSWORD or LiveEdit1!)
 */
import "dotenv/config";

const base = (process.env.TEST_API_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const email =
  process.env.TEST_USER_EMAIL?.trim() ||
  process.env.TEST_ADMIN_EMAIL?.trim() ||
  "chrome-live@local.test";
const password =
  process.env.TEST_USER_PASSWORD ?? process.env.TEST_ADMIN_PASSWORD ?? "LiveEdit1!";

function authHeaders(token: string, wallet: "demo" | "live") {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "X-Account-Type": wallet
  } as const;
}

async function main() {
  console.log("\n=== User-side — API check ===\n");
  console.log(`Base: ${base}\n`);

  const h = await fetch(`${base}/api/health`);
  if (!h.ok) {
    console.error(`FAIL: /api/health → ${h.status}`);
    console.error("  → Start server from project root: npm run dev\n");
    process.exit(1);
  }
  console.log("OK   /api/health");

  const marketsRes = await fetch(`${base}/api/markets`);
  if (!marketsRes.ok) {
    console.error(`FAIL: /api/markets → ${marketsRes.status}`);
    process.exit(1);
  }
  const marketsJson = (await marketsRes.json()) as { symbols?: string[] };
  const nSym = marketsJson.symbols?.length ?? 0;
  if (nSym < 1) {
    console.error("FAIL: /api/markets has no symbols");
    process.exit(1);
  }
  console.log(`OK   /api/markets (${nSym} symbols)`);

  const depRes = await fetch(`${base}/api/deposits/public-info`);
  if (!depRes.ok) {
    console.error(`FAIL: /api/deposits/public-info → ${depRes.status}`);
    process.exit(1);
  }
  console.log("OK   /api/deposits/public-info");

  const candleRes = await fetch(`${base}/api/markets/candles?symbol=GBPAUD&timeframe=60&limit=3`);
  if (!candleRes.ok) {
    console.error(`FAIL: /api/markets/candles → ${candleRes.status}`);
    process.exit(1);
  }
  const candleJson = (await candleRes.json()) as { candles?: unknown[] };
  const nc = candleJson.candles?.length ?? 0;
  console.log(`OK   /api/markets/candles (rows: ${nc}; empty OK if DB cold)`);

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const loginJson = (await loginRes.json().catch(() => null)) as {
    token?: string;
    user?: { id?: string; name?: string };
    message?: string;
  } | null;

  if (!loginRes.ok) {
    console.error(`FAIL: /api/auth/login → ${loginRes.status}`, loginJson?.message ?? "");
    console.error(`  → Register first or set TEST_USER_EMAIL / TEST_USER_PASSWORD\n`);
    process.exit(1);
  }
  const token = loginJson?.token;
  if (!token) {
    console.error("FAIL: login response has no token\n");
    process.exit(1);
  }
  console.log(`OK   /api/auth/login (user ${loginJson?.user?.id ?? "?"})`);

  const meRes = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!meRes.ok) {
    const j = (await meRes.json().catch(() => null)) as { message?: string } | null;
    console.error(`FAIL: /api/auth/me → ${meRes.status}`, j?.message ?? "");
    process.exit(1);
  }
  console.log("OK   /api/auth/me");

  for (const wallet of ["demo", "live"] as const) {
    const accRes = await fetch(`${base}/api/account`, { headers: authHeaders(token, wallet) });
    if (!accRes.ok) {
      const j = (await accRes.json().catch(() => null)) as { message?: string } | null;
      console.error(`FAIL: /api/account (${wallet}) → ${accRes.status}`, j?.message ?? "");
      process.exit(1);
    }
    const acc = (await accRes.json()) as { balance?: number };
    const bal = acc.balance;
    console.log(`OK   /api/account (${wallet}) balance=${typeof bal === "number" ? bal.toFixed(2) : "?"}`);

    const trRes = await fetch(`${base}/api/trades`, { headers: authHeaders(token, wallet) });
    if (!trRes.ok) {
      console.error(`FAIL: /api/trades (${wallet}) → ${trRes.status}`);
      process.exit(1);
    }
    const tr = (await trRes.json()) as { trades?: unknown[] };
    console.log(`OK   /api/trades (${wallet}) count=${tr.trades?.length ?? 0}`);
  }

  const refRes = await fetch(`${base}/api/referrals/summary`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  if (!refRes.ok) {
    const j = (await refRes.json().catch(() => null)) as { message?: string } | null;
    console.error(`FAIL: /api/referrals/summary → ${refRes.status}`, j?.message ?? "");
    process.exit(1);
  }
  console.log("OK   /api/referrals/summary");

  console.log("\n=== User-side checks passed ===\n");
  console.log(`  Open app: ${base}/\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
