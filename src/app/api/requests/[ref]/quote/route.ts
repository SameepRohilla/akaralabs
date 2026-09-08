import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { quotes, requests, requestEvents } from "@/db/schema";
import { handler, ApiError } from "@/lib/guard";
import { resolveRequestAccess } from "@/lib/access";
import { notifyStudio } from "@/lib/notify";
import { shell, kvBlock, esc } from "@/lib/mail";
import { formatINR } from "@/lib/money";
import { SITE } from "@/lib/site";
import { addWorkingDays } from "@/lib/dates";

const schema = z.object({
  quoteId: z.string().min(1),
  decision: z.enum(["accept", "reject"]),
  note: z.string().trim().max(2000).optional(),
  trackingToken: z.string().max(200).optional(),
});

/** The customer's accept/reject. Deliberately not available to staff — the
    studio must not be able to approve its own quote on a client's behalf. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ ref: string }> }) => {
  const { ref } = await ctx.params;
  const input = schema.parse(await req.json());

  const { request, isStudio } = await resolveRequestAccess(ref, input.trackingToken);
  if (isStudio) throw new ApiError(403, "A quote can only be decided by the customer.");

  const [quote] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, input.quoteId), eq(quotes.requestId, request.id)))
    .limit(1);

  if (!quote) throw new ApiError(404, "That quote isn't on this request.");
  if (quote.status !== "sent") {
    throw new ApiError(409, `This quote is already ${quote.status}. Refresh to see the latest.`);
  }
  if (quote.validUntil && quote.validUntil.getTime() < Date.now()) {
    throw new ApiError(410, "This quote has expired — message us and we'll refresh it.");
  }

  const accepted = input.decision === "accept";
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(quotes)
      .set({
        status: accepted ? "accepted" : "rejected",
        decidedAt: now,
        decisionNote: input.note ?? null,
      })
      .where(eq(quotes.id, quote.id));

    await tx
      .update(requests)
      .set({
        // Accepting schedules the work; asking for changes goes back to review.
        stage: accepted ? "approved" : "in_review",
        valuePaise: accepted ? quote.totalPaise : request.valuePaise,
        promisedAt:
          accepted && quote.leadTimeDays
            ? addWorkingDays(now, quote.leadTimeDays)
            : request.promisedAt,
        updatedAt: now,
      })
      .where(eq(requests.id, request.id));

    await tx.insert(requestEvents).values({
      requestId: request.id,
      stage: accepted ? "approved" : "in_review",
      kind: "quote",
      title: accepted ? "Quote approved" : "Changes requested on the quote",
      note: accepted
        ? `${quote.number} accepted at ${formatINR(quote.totalPaise)}. We've scheduled the work.`
        : input.note || "We're revising the quote and will send an updated one.",
      isPublic: true,
      actorId: request.userId,
    });
  });

  await notifyStudio(
    `${accepted ? "✓ Quote accepted" : "↩ Quote sent back"} — ${request.reference}`,
    shell({
      heading: accepted
        ? `${request.contactName} approved ${quote.number}.`
        : `${request.contactName} asked for changes.`,
      body:
        kvBlock([
          ["Request", esc(request.reference)],
          ["Quote", esc(quote.number)],
          ["Value", formatINR(quote.totalPaise)],
          ["Lead time", quote.leadTimeDays ? `${quote.leadTimeDays} working days` : "—"],
        ]) + (input.note ? `<p style="white-space:pre-wrap;">${esc(input.note)}</p>` : ""),
      cta: { label: "Open in admin", href: `${SITE.url}/admin/requests/${request.reference}` },
    }),
  );

  return Response.json({ ok: true, status: accepted ? "accepted" : "rejected" });
});
