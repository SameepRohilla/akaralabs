/* Applies pending migrations. Runs as the container's entrypoint step in
   production and via `npm run db:migrate` locally.

   It waits for the database itself rather than relying on compose ordering:
   `depends_on` only waits for the container, not for Postgres to finish its
   first-run initialisation. */
import "../lib/env-file";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { diagnoseDatabaseUrl, redactDatabaseUrl } from "../lib/db-url";

const MAX_WAIT_MS = 60_000;
const RETRY_MS = 2_000;

/* Waiting is for a database that hasn't finished starting. It is not for one
   that is answering and saying no.
 *
 * These SQLSTATEs are refusals, not readiness problems, and no amount of
 * retrying changes them — so the loop reports them immediately instead of
 * spending a minute printing "waiting for database…" thirty times and then
 * claiming the database was "unreachable", which sends you looking at
 * networking when the real answer was in the first line. */
const PERMANENT: Record<string, { what: string; fix: string }> = {
  "28P01": {
    what: 'the password for user "akara" is wrong',
    fix:
      "POSTGRES_PASSWORD and the password inside DATABASE_URL must be identical in .env.\n" +
      "       If you changed POSTGRES_PASSWORD after the first start, that is the usual cause:\n" +
      "       Postgres only reads it when it initialises its data directory, so the running\n" +
      "       database still has the ORIGINAL password. Either put the original back, or — if\n" +
      "       there is no data worth keeping yet — reset the volume:\n\n" +
      "         docker compose down\n" +
      "         docker volume rm akaralabs_pgdata\n" +
      "         docker compose up -d",
  },
  "28000": {
    what: "the server rejected the connection for user \"akara\"",
    fix: "Check the username in DATABASE_URL matches POSTGRES_USER (akara), and pg_hba rules if this is an external database.",
  },
  "3D000": {
    what: "that database does not exist",
    fix: "The name after the last / in DATABASE_URL must match POSTGRES_DB (akara).",
  },
  "42501": {
    what: 'user "akara" lacks the privileges to run migrations',
    fix: "It needs CREATE on the database — the compose Postgres gives the POSTGRES_USER this by default.",
  },
};

class PermanentDbError extends Error {
  constructor(public what: string, public fix: string) {
    super(what);
  }
}

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

      const code = (err as { code?: string })?.code;
      const permanent = code ? PERMANENT[code] : undefined;
      if (permanent) {
        throw new PermanentDbError(permanent.what, permanent.fix);
      }

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

  /* Check the connection string before handing it to the driver. The driver's
     own failure for a bad one is "Invalid URL", which names neither the
     variable nor the problem — and by the time you read it the container is
     restarting, so you can't `exec` in to look. */
  const problem = diagnoseDatabaseUrl(url);
  if (problem) {
    console.error(`\nFATAL: ${problem.message}`);
    console.error(`       ${problem.fix}`);
    if (url) console.error(`\n       Currently: ${redactDatabaseUrl(url)}`);
    console.error("");
    process.exit(1);
  }

  await waitForDatabase(url!);

  const sql = postgres(url!, { max: 1, onnotice: () => {} });
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
  if (err instanceof PermanentDbError) {
    console.error(`\nFATAL: ${err.what}`);
    console.error(`       ${err.fix}\n`);
    process.exit(1);
  }
  console.error("migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
