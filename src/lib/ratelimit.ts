import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ApiError } from "./guard";

/* Fixed-window limiter in Postgres. One statement, no Redis, and it survives
   restarts — which matters on a single-server deploy where an in-memory
   counter would reset on every redeploy. */

export async function limit(opts: {
  key: string;
  max: number;
  windowSeconds: number;
  message?: string;
}): Promise<void> {
  const { key, max, windowSeconds } = opts;

  const rows = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, count, window_start)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < now() - (${windowSeconds} || ' seconds')::interval THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < now() - (${windowSeconds} || ' seconds')::interval THEN now()
        ELSE rate_limits.window_start
      END
    RETURNING count
  `);

  const count = Number(rows[0]?.count ?? 1);
  if (count > max) {
    throw new ApiError(429, opts.message || "Too many attempts — please wait a minute and try again.");
  }
}

/** Best-effort client IP behind Cloudflare / Caddy. */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  );
}

/** Periodically drop stale rows. Called from the cron route. */
export async function pruneRateLimits() {
  await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
}
