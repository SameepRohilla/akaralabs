import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/* Why this module doesn't simply throw when DATABASE_URL is missing.
 *
 * `next build` imports every route module to collect page data, so anything
 * this file throws at module scope fails the build, not a request. It used to
 * throw exactly that way, which meant the build itself required a live
 * DATABASE_URL — and the Docker builder stage has no environment beyond
 * NEXT_PUBLIC_SITE_URL. The image build died on "DATABASE_URL is not set" while
 * collecting /sitemap.xml, and no try/catch inside a route could prevent it,
 * because the throw happened as the module loaded.
 *
 * It was invisible on a laptop: anyone with a .env in the project directory had
 * the variable, so the build passed locally and would have failed the first time
 * CI built the image.
 *
 * The fix is narrow on purpose. During the build phase — and only then — a
 * placeholder connection string is used so the module can be imported. Nothing
 * connects: postgres.js opens a socket on first query, never at construction,
 * and no query runs at build time. At runtime the missing variable still throws
 * immediately, on import, with the same message as before.
 *
 * The connection is NOT wrapped in a Proxy to defer it. That was the first
 * attempt, and it broke the Auth.js Drizzle adapter, which inspects the client
 * to work out its dialect and rejected the proxy with "Unsupported database
 * type (object)". Route handlers must receive the real drizzle instance.
 */

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

// Unroutable by design (RFC 5737 TEST-NET-1), so a stray query during a build
// fails fast and obviously rather than reaching something real.
const BUILD_PLACEHOLDER = "postgres://build:build@192.0.2.1:5432/build";

const url = process.env.DATABASE_URL;
if (!url && !isBuildPhase) throw new Error("DATABASE_URL is not set");

/** Reuse the pool across hot reloads in dev, and across lambda-ish reuse in prod. */
const globalForDb = globalThis as unknown as { __akaraSql?: ReturnType<typeof postgres> };

const client =
  globalForDb.__akaraSql ??
  postgres(url ?? BUILD_PLACEHOLDER, {
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idle_timeout: 30,
    connect_timeout: 10,
    // PgBouncer in transaction mode can't hold prepared statements.
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__akaraSql = client;

export const db = drizzle(client, { schema, logger: process.env.DB_LOG === "1" });
export { schema, client as sql };
