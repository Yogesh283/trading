/**
 * Run while your API is up (e.g. after `npm run start:live`).
 * Verifies health + login + /me includes `role` (required for React-Admin).
 *
 * Optional env:
 *   TEST_API_URL=http://127.0.0.1:3000
 *   TEST_ADMIN_EMAIL=you@example.com
 *   TEST_ADMIN_PASSWORD=yourpassword
 */
import "dotenv/config";

const base = (process.env.TEST_API_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const email =
  process.env.TEST_ADMIN_EMAIL?.trim() || "chrome-live@local.test";
const password = process.env.TEST_ADMIN_PASSWORD ?? "LiveEdit1!";

async function main() {
  console.log("\n=== Live admin — API check ===\n");
  console.log(`Base: ${base}\n`);

  const h = await fetch(`${base}/api/health`);
  if (!h.ok) {
    console.error(`FAIL: /api/health → ${h.status}`);
    console.error("  → Start server: npm run start:live  (from project root)\n");
    process.exit(1);
  }
  console.log("OK   /api/health");

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const loginJson = (await loginRes.json().catch(() => null)) as {
    user?: { role?: string; email?: string };
    token?: string;
    message?: string;
  } | null;

  if (!loginRes.ok) {
    console.error(`FAIL: /api/auth/login → ${loginRes.status}`, loginJson?.message ?? "");
    console.error("  → Wrong password, or user missing. Register first or fix email.\n");
    process.exit(1);
  }
  const token = loginJson?.token;
  if (!token) {
    console.error("FAIL: login response has no token\n");
    process.exit(1);
  }

  const loginRole = loginJson?.user?.role;
  if (loginRole) {
    console.log(`OK   /api/auth/login → user.role = "${loginRole}"`);
  } else {
    console.warn(
      'WARN /api/auth/login → user.role missing (old dist?). Run: npm run start:live  then retry.'
    );
  }

  const meRes = await fetch(`${base}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  const meJson = (await meRes.json().catch(() => null)) as {
    user?: { role?: string };
    message?: string;
  } | null;

  if (!meRes.ok) {
    console.error(`FAIL: /api/auth/me → ${meRes.status}`, meJson?.message ?? "");
    process.exit(1);
  }

  const meRole = meJson?.user?.role;
  if (!meRole) {
    console.error(
      'FAIL: /api/auth/me → user.role missing. Server is stale — stop old node, then:\n' +
        "       npm run start:live\n"
    );
    process.exit(1);
  }

  console.log(`OK   /api/auth/me → user.role = "${meRole}"`);

  if (meRole !== "admin") {
    console.warn(
      `\nWARN: Role is "${meRole}" — admin panel needs "admin". Run:\n` +
        `       npm run promote-admin -- ${JSON.stringify(email)}\n`
    );
    process.exit(2);
  }

  console.log("\n=== All good — open admin UI ===\n");
  console.log("  Browser / Cursor Simple Browser URL:\n");
  console.log(`    ${base}/admin\n`);
  console.log("  Login: same email + password you used above.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
