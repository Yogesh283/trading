/**
 * One-off: `npx tsx scripts/test-login-once.ts`
 * Tests DB + login for seed user (SEED_CHROME_USER) without starting HTTP.
 */
import { ensureDevChromeUser, loginUser } from "../src/services/authService";

async function main() {
  try {
    await ensureDevChromeUser();
    const r = await loginUser({
      email: "chrome-live@local.test",
      password: "LiveEdit1!"
    });
    console.log("LOGIN_OK", {
      email: r.user?.email,
      hasToken: Boolean(r.token)
    });
  } catch (e) {
    console.error("LOGIN_FAIL", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

void main();
