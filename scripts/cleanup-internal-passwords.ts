import { db } from "../server/db";
import { salesmanUsers } from "../shared/schema";
import { ne, sql } from "drizzle-orm";

const PLACEHOLDER = "GOOGLE_OAUTH_USER";

async function main() {
  const before = await db.select({
    id: salesmanUsers.id,
    email: salesmanUsers.email,
    passwordHash: salesmanUsers.passwordHash,
  }).from(salesmanUsers);

  const stale = before.filter(u => u.passwordHash !== PLACEHOLDER);
  console.log(`Found ${before.length} salesman users, ${stale.length} with non-placeholder passwordHash.`);
  for (const u of stale) {
    console.log(`  - id=${u.id} email=${u.email}`);
  }

  if (stale.length === 0) {
    console.log("Nothing to clean. Exiting.");
    return;
  }

  const result = await db.update(salesmanUsers)
    .set({ passwordHash: PLACEHOLDER })
    .where(ne(salesmanUsers.passwordHash, PLACEHOLDER))
    .returning({ id: salesmanUsers.id });

  console.log(`Updated ${result.length} salesman users to placeholder passwordHash.`);

  const remaining = await db.select({ c: sql<number>`count(*)::int` })
    .from(salesmanUsers)
    .where(ne(salesmanUsers.passwordHash, PLACEHOLDER));
  console.log(`Remaining non-placeholder rows: ${remaining[0]?.c ?? 0}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
