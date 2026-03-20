/**
 * Run: npx tsx scripts/test-register.ts
 */
import { registerUser } from "../src/services/authService";
import { getDatabaseInfo } from "../src/db/appDb";

async function main() {
  console.log("Database:", getDatabaseInfo());
  const email = `testreg_${Date.now()}@example.com`;
  const r = await registerUser({
    name: "Test User",
    email,
    password: "secret12"
  });
  console.log("Register OK:");
  console.log(JSON.stringify(r, null, 2));
}

main().catch((e) => {
  console.error("Register FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
