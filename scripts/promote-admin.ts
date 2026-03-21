/**
 * Promote a user to admin via the command line.
 *
 * Usage:
 *   npm run promote-admin -- you@example.com
 *   npm run promote-admin -- --list
 */
import "dotenv/config";
import { dbAll, dbRun, initAppDb, isMysqlMode } from "../src/db/appDb";

async function main() {
  const arg = process.argv[2]?.trim();
  if (!arg || arg === "-h" || arg === "--help") {
    console.log(`
Usage:
  npm run promote-admin -- <email>     Set users.role = 'admin' for that email
  npm run promote-admin -- --list      Show all emails + role

Uses database from .env (MySQL if MYSQL_DATABASE set, else SQLite data/app.db).
`);
    process.exit(arg ? 0 : 1);
  }

  await initAppDb();

  if (arg === "--list" || arg === "-l") {
    const rows = await dbAll<{ id: string; email: string; role: string }>(
      "SELECT id, email, role FROM users ORDER BY created_at"
    );
    if (rows.length === 0) {
      console.log("No users in database.");
      return;
    }
    console.log(isMysqlMode() ? "MySQL" : "SQLite", "— users:\n");
    for (const r of rows) {
      console.log(`  ${r.id}  ${r.email}  role=${r.role ?? "?"}`);
    }
    return;
  }

  const email = arg.toLowerCase();
  const result = await dbRun("UPDATE users SET role = 'admin' WHERE LOWER(email) = ?", [email]);
  if (result.affectedRows === 0) {
    console.error(`No row updated — this email was not found in the database: ${arg}`);
    console.error("(Typo? e.g. 1122 vs 1133 — copy the exact email from the list.)\n");
    const all = await dbAll<{ email: string }>("SELECT email FROM users ORDER BY email");
    if (all.length === 0) {
      console.error("No users yet — register in the app first.");
    } else {
      console.error("Registered emails:");
      for (const r of all) {
        console.error("  •", r.email);
      }
    }
    console.error("\nRun: npm run promote-admin -- --list");
    process.exit(1);
  }
  console.log(`OK — admin: ${arg}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
