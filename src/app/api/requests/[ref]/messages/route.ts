import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { messages, requests, requestEvents } from "@/db/schema";
import { handler, ApiError } from "@/lib/guard";
import { limit, clientIp } from "@/lib/ratelimit";
import { resolveRequestAccess } from "@/lib/access";
import { notify, notifyStudioMessage } from "@/lib/notify";

const schema = z.object({
  body: z.string().trim().min(1, "Say something first").max(5000),
  isInternal: z.boolean().optional(),
  trackingToken: z.string().max(200).optional(),
});

export const POST = handler(async (req: Request, ctx: { params: Promise<{ ref: string }> }) => {
  const { ref } = await ctx.params;
  const input = schema.parse(await req.json());

  const { request, isStudio, actorId } = await resolveRequestAccess(ref, input.trackingToken);

  await limit({
    key: `msg:${actorId ?? clientIp(req)}`,
    max: 40,
    windowSeconds: 3600,
    message: "That's a lot of messages at once. Give it a minute.",
  });

  // Only the studio may write internal notes, whatever the client sends.
  const isInternal = isStudio && !!input.isInternal;

  const [row] = await db
    .insert(messages)
    .values({
      requestId: request.id,
      authorId: actorId,
      fromStudio: isStudio,
      isInternal,
      body: input.body,
      // Your own message is read by you the moment you send it.
      readByStudioAt: isStudio ? new Date() : null,
      readByCustomerAt: isStudio ? null : new Date(),
    })
    .returning();

  await db.update(requests).set({ updatedAt: new Date() }).where(eq(requests.id, request.id));

  if (!isInternal) {
    await db.insert(requestEvents).values({
      requestId: request.id,
      kind: "message",
      title: isStudio ? "Message from the studio" : `Reply from ${request.contactName}`,
      isPublic: true,
      actorId,
    });

    if (isStudio) {
      await notify({
        userId: request.userId,
        fallbackEmail: request.contactEmail,
        kind: "message",
        title: `New message on ${request.reference}`,
        body: input.body.slice(0, 240),
        href: request.userId
          ? `/dashboard/requests/${request.reference}`
          : `/track/${request.reference}?t=${request.trackingToken}`,
        requestId: request.id,
      });
    } else {
      await notifyStudioMessage(
        { reference: request.reference, contactName: request.contactName },
        input.body,
      );
    }
  }

  return Response.json({ ok: true, id: row.id }, { status: 201 });
});

export const GET = handler(async () => {
  throw new ApiError(405, "Use POST");
});
