import { statfs } from "node:fs/promises";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { quotes, requests, authTokens } from "@/db/schema";
import { handler, ApiError } from "@/lib/guard";
import { pruneRateLimits } from "@/lib/ratelimit";
import { pruneOtps } from "@/lib/otp";
import { notifyStudio } from "@/lib/notify";
import { shell, esc } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { formatINR } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Housekeeping, called by a host cron over HTTP with a shared secret:
     0 6 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://akaralabs.in/api/cron
   Kept as an endpoint rather than a separate worker so there is one process
   to deploy and one place to read logs. */
export const POST = handler(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new ApiError(503, "CRON_SECRET is not configured");

  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) throw new ApiError(401, "Bad cron secret");

  // 1. Expire quotes past their validity so the customer sees an honest state.
  const expired = await db
    .update(quotes)
    .set({ status: "expired" })
    .where(and(eq(quotes.status, "sent"), lt(quotes.validUntil, new Date())))
    .returning({ number: quotes.number, totalPaise: quotes.totalPaise });

  // 2. Clear spent auth tokens.
  const tokens = await db
    .delete(authTokens)
    .where(lt(authTokens.expiresAt, new Date()))
    .returning({ id: authTokens.id });

  await pruneRateLimits();
  /* Spent and long-dead email codes. Signup codes carry a pending account —
     including its password hash — so this is the one that matters most. */
  await pruneOtps();

  /* 2b. Disk. A box holding customer CAD fills up quietly, and "check it
     monthly" is far too slow — by the time you notice, uploads are already
     failing and Postgres may be refusing writes. Checked daily instead, with
     the alert escalating as it gets worse. */
  const disk = await checkDisk();

  // 3. Tell the studio what needs attention today.
  const [attention] = await db
    .select({
      unquoted: sql<number>`count(*) filter (where ${requests.stage} in ('received','in_review') and ${requests.createdAt} < now() - interval '24 hours')::int`,
      stalled: sql<number>`count(*) filter (where ${requests.stage} not in ('completed','cancelled') and ${requests.updatedAt} < now() - interval '7 days')::int`,
      dueSoon: sql<number>`count(*) filter (where ${requests.promisedAt} between now() and now() + interval '3 days' and ${requests.stage} not in ('completed','cancelled'))::int`,
    })
    .from(requests);

  const needsAttention =
    (attention?.unquoted ?? 0) + (attention?.stalled ?? 0) + (attention?.dueSoon ?? 0) > 0;

  if (needsAttention || expired.length || disk.level !== "ok") {
    await notifyStudio(
      "Akara Labs — daily bench check",
      shell({
        heading: disk.level === "urgent" ? "Disk almost full." : "Today on the bench.",
        body:
          (disk.level !== "ok"
            ? `<p style="color:${disk.level === "urgent" ? "#E8B0A8" : "#F7B95F"};border-left:2px solid ${
                disk.level === "urgent" ? "#D98A80" : "#F2A33C"
              };padding-left:14px;"><strong>Disk ${disk.usedPct}% full</strong> — ${disk.freeGb} GB free of ${
                disk.totalGb
              } GB.${
                disk.level === "urgent"
                  ? " Uploads will start failing. Clear old images (docker image prune -a) and move backups off the box now."
                  : " Worth clearing space before it becomes urgent."
              }</p>`
            : "") +
          `<ul>` +
          `<li>${attention?.unquoted ?? 0} waiting on a quote for over a day</li>` +
          `<li>${attention?.stalled ?? 0} with no movement in a week</li>` +
          `<li>${attention?.dueSoon ?? 0} due within three days</li>` +
          (expired.length
            ? `<li>${expired.length} quote${expired.length === 1 ? "" : "s"} just expired: ${esc(
                expired.map((q) => `${q.number} (${formatINR(q.totalPaise)})`).join(", "),
              )}</li>`
            : "") +
          `</ul>`,
        cta: { label: "Open the queue", href: `${SITE.url}/admin` },
      }),
    );
  }

  return Response.json({
    ok: true,
    quotesExpired: expired.length,
    tokensPruned: tokens.length,
    attention: attention ?? null,
    disk,
  });
});

/** Free space on the volume holding uploads. Thresholds are deliberately
    early: at 90% Postgres can start refusing writes, so 70% is when you want
    to hear about it, not 95%. */
async function checkDisk(): Promise<{
  level: "ok" | "warning" | "urgent";
  usedPct: number;
  freeGb: number;
  totalGb: number;
}> {
  try {
    const path = process.env.STORAGE_DIR || "/data/storage";
    const fs = await statfs(path);
    const total = fs.blocks * fs.bsize;
    const free = fs.bavail * fs.bsize;
    const usedPct = total > 0 ? Math.round(((total - free) / total) * 100) : 0;
    const gb = (n: number) => Math.round((n / 1024 ** 3) * 10) / 10;

    return {
      level: usedPct >= 90 ? "urgent" : usedPct >= 70 ? "warning" : "ok",
      usedPct,
      freeGb: gb(free),
      totalGb: gb(total),
    };
  } catch {
    return { level: "ok", usedPct: 0, freeGb: 0, totalGb: 0 };
  }
}

// Convenience for `curl` without -X POST.
export const GET = POST;
