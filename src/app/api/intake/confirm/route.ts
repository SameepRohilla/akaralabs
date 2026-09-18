import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requests, requestEvents } from "@/db/schema";
import { ApiError, handler } from "@/lib/guard";
import { limit, clientIp } from "@/lib/ratelimit";
import { consumeOtp } from "@/lib/otp";
import { sendIntakeEmails } from "@/lib/intake-notify";
import { SITE } from "@/lib/site";

/* The guest comes back with the code. This is where the request stops being
 * provisional: the receipt goes out, the studio is paged, and the tracking
 * link is handed over.
 *
 * The tracking token is deliberately withheld until now. It is the one secret
 * that opens the request without an account, and handing it to whoever filled
 * the form — before knowing they own the address — would let someone watch a
 * stranger's job move through the studio.
 */

const schema = z.object({
  email: z.string().email().max(200),
  code: z.string().min(4).max(12),
});

export const POST = handler(async (req: Request) => {
  await limit({ key: `intake-confirm:${clientIp(req)}`, max: 30, windowSeconds: 3600 });

  const body = schema.parse(await req.json());
  const email = body.email.toLowerCase().trim();

  const otp = await consumeOtp({ email, purpose: "intake", code: body.code });
  if (!otp.requestId) {
    throw new ApiError(410, "That confirmation has expired. Please submit again.", "otp_gone");
  }

  const [row] = await db
    .select()
    .from(requests)
    .where(eq(requests.id, otp.requestId))
    .limit(1);

  if (!row) {
    throw new ApiError(404, "We can't find that request any more. Please submit again.");
  }

  /* Idempotent: a double submit, or a refresh of the success page, should read
     as success rather than send the studio a second copy of the same lead. */
  if (!row.emailVerifiedAt) {
    await db
      .update(requests)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(requests.id, row.id));

    await db.insert(requestEvents).values({
      requestId: row.id,
      kind: "system",
      title: "Email confirmed",
      note: `${row.contactEmail} confirmed with a one-time code.`,
      isPublic: false,
    });

    await sendIntakeEmails(row.id);
  }

  return Response.json({
    ok: true,
    reference: row.reference,
    trackingUrl: `${SITE.url}/track/${row.reference}?t=${row.trackingToken}`,
  });
});
