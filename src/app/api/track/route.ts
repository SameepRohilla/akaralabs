import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { handler } from "@/lib/guard";
import { limit, clientIp } from "@/lib/ratelimit";
import { sendMail, shell, kvBlock, esc } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { stageLabel, STAGE_META } from "@/lib/stages";
import { isReference } from "@/lib/ids";

const schema = z.object({
  reference: z.string().min(4).max(40),
  email: z.string().email().max(200),
});

/* Emails the tracking link rather than showing status inline. That way the
   reference alone is never enough to read someone's job — the link goes to
   the address that submitted it. */
export const POST = handler(async (req: Request) => {
  await limit({
    key: `track:${clientIp(req)}`,
    max: 15,
    windowSeconds: 3600,
    message: "Too many lookups. Wait a minute, or just email us.",
  });

  const input = schema.parse(await req.json());
  const reference = input.reference.trim().toUpperCase();

  if (isReference(reference)) {
    const [row] = await db
      .select()
      .from(requests)
      .where(
        and(
          eq(requests.reference, reference),
          eq(sql`lower(${requests.contactEmail})`, input.email.toLowerCase().trim()),
        ),
      )
      .limit(1);

    if (row) {
      const href = row.userId
        ? `${SITE.url}/dashboard/requests/${row.reference}`
        : `${SITE.url}/track/${row.reference}?t=${row.trackingToken}`;

      await sendMail({
        to: row.contactEmail,
        subject: `Tracking link for ${row.reference}`,
        html: shell({
          heading: "Here's your tracking link.",
          body:
            `<p>Hello ${esc(row.contactName.split(" ")[0])},</p>` +
            `<p>${esc(STAGE_META[row.stage].blurb)}</p>` +
            kvBlock([
              ["Reference", esc(row.reference)],
              ["Project", esc(row.title || "—")],
              ["Stage", esc(stageLabel(row.stage, row.kind))],
            ]) +
            (row.userId ? `<p>This request is on your account — sign in to see it with the rest.</p>` : ""),
          cta: { label: "Open live status", href },
          footNote: "Keep this link private — anyone with it can see this request.",
        }),
      });
    }
  }

  // Same answer either way — a reference must never be confirmable by probing.
  return Response.json({ ok: true });
});
