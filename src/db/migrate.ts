/* Applies pending migrations. Runs as the container's entrypoint step in
   production and via `npm run db:migrate` locally.

   It waits for the database itself rather than relying on compose ordering:
   `depends_on` only waits for the container, not for Postgres to finish its
   first-run initialisation. */
import "../lib/env-file";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const MAX_WAIT_MS = 60_000;
const RETRY_MS = 2_000;

async function waitForDatabase(url: string) {
  const deadline = Date.now() + MAX_WAIT_MS;
  let attempt = 0;

  for (;;) {
    const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 5 });
    try {
      await sql`select 1`;
      await sql.end();
      return;
    } catch (err) {
      await sql.end({ timeout: 1 }).catch(() => {});
      if (Date.now() >= deadline) {
        throw new Error(
          `database unreachable after ${MAX_WAIT_MS / 1000}s: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      attempt++;
      console.log(`    waiting for database… (${attempt})`);
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  await waitForDatabase(url);

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // pgcrypto backs gen_random_uuid(), which every primary key defaults to.
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    await migrate(drizzle(sql), { migrationsFolder: process.env.MIGRATIONS_DIR || "./drizzle" });
    console.log("migrations applied");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
