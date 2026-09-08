/* A local Postgres for development, with no Docker and no root.
 *
 *   npm run db:local          # start it, leave it running (Ctrl-C to stop)
 *   npm run db:local -- reset # throw the data away and start clean
 *
 * embedded-postgres downloads a real Postgres binary into node_modules and runs
 * it as your own user, writing to ./.pgdata in the project. Nothing is
 * installed system-wide, nothing needs sudo, and deleting the folder removes
 * every trace of it.
 *
 * The version is pinned to Postgres 16 to match the server. Testing against a
 * different major than you deploy on is how you find out in production that
 * something changed between releases.
 *
 * This is for development only. It is not what runs in production — that is the
 * postgres:16-alpine service in docker-compose.yml, on the server.
 */
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const DATA_DIR = resolve(process.cwd(), ".pgdata");
const PORT = Number(process.env.DEV_DB_PORT ?? 5432);
const USER = "akara";
const PASSWORD = "localdev";
const DATABASE = "akara";

const url = `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`;

if (process.argv.includes("reset")) {
  console.log(`removing ${DATA_DIR}`);
  await rm(DATA_DIR, { recursive: true, force: true });
}

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true, // keep the data between runs
  onLog: () => {}, // Postgres' own startup chatter isn't useful here
});

// initialise() throws if the cluster already exists, which is the normal case
// on every run after the first.
try {
  await pg.initialise();
  console.log("initialised a new cluster in .pgdata");
} catch {
  console.log("reusing the cluster in .pgdata");
}

try {
  await pg.start();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\ncould not start Postgres: ${msg}`);
  if (/address already in use|could not bind/i.test(msg)) {
    console.error(
      `\nSomething is already listening on port ${PORT}. Either stop it, or run\n` +
        `this on another port and put that port in .env.local:\n\n` +
        `  DEV_DB_PORT=5433 npm run db:local\n`,
    );
  }
  process.exit(1);
}

try {
  await pg.createDatabase(DATABASE);
  console.log(`created database "${DATABASE}"`);
} catch {
  // Already there — fine.
}

console.log(`
Postgres 16 is running.

  DATABASE_URL=${url}

Put that line in .env.local, then in another terminal:

  npm run db:migrate
  ADMIN_EMAIL=you@akaralabs.in ADMIN_PASSWORD='something-long' npm run db:seed
  npm run dev

Leave this terminal open. Ctrl-C stops the database; your data stays in .pgdata.
`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("\nstopping Postgres…");
  try {
    await pg.stop();
  } catch {
    // Nothing useful to do if it's already gone.
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Hold the process open; the database dies with it.
await new Promise(() => {});
