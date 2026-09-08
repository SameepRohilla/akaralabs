import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files as filesTable, requests, requestEvents } from "@/db/schema";
import { handler, ApiError } from "@/lib/guard";
import { limit, clientIp } from "@/lib/ratelimit";
import { resolveRequestAccess } from "@/lib/access";
import * as storage from "@/lib/storage";
import { parseStl } from "@/lib/stl";
import { notify, notifyStudio } from "@/lib/notify";
import { shell, esc } from "@/lib/mail";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = handler(async (req: Request, ctx: { params: Promise<{ ref: string }> }) => {
  const { ref } = await ctx.params;
  const form = await req.formData();
  const trackingToken = typeof form.get("trackingToken") === "string" ? String(form.get("trackingToken")) : undefined;

  const { request, isStudio, actorId } = await resolveRequestAccess(ref, trackingToken);

  await limit({ key: `upload:${actorId ?? clientIp(req)}`, max: 60, windowSeconds: 3600 });

  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!uploads.length) throw new ApiError(400, "No files in that upload.");

  const totalBytes = uploads.reduce((sum, f) => sum + (f.size || 0), 0);
  if (totalBytes > storage.MAX_TOTAL_UPLOAD_BYTES) {
    throw new ApiError(
      413,
      `That's ${storage.humanSize(totalBytes)} in one upload; the limit is ${storage.humanSize(
        storage.MAX_TOTAL_UPLOAD_BYTES,
      )}. Upload them in smaller batches.`,
    );
  }

  const stored: string[] = [];
  const rejected: string[] = [];

  for (const file of uploads.slice(0, storage.MAX_FILES_PER_UPLOAD)) {
    if (!storage.isAllowed(file.name)) {
      rejected.push(`${file.name} (unsupported type)`);
      continue;
    }
    if (file.size > storage.MAX_FILE_BYTES) {
      rejected.push(`${file.name} (over ${storage.humanSize(storage.MAX_FILE_BYTES)})`);
      continue;
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const key = storage.makeKey(`requests/${request.id}`, file.name);
    const { checksum, bytes } = await storage.put(key, buf);
    const meta = storage.extOf(file.name) === ".stl" ? parseStl(buf) : null;

    await db.insert(filesTable).values({
      requestId: request.id,
      // Studio uploads belong to the request, not to a staff member's library.
      userId: isStudio ? request.userId : actorId,
      filename: storage.safeName(file.name),
      mimeType: storage.guessMime(file.name, file.type),
      sizeBytes: bytes,
      storageKey: key,
      checksum,
      uploadedBy: isStudio ? "studio" : "customer",
      inLibrary: !isStudio && !!actorId,
      meta: meta ?? undefined,
    });

    stored.push(file.name);
  }

  if (!stored.length) throw new ApiError(415, `Nothing could be accepted: ${rejected.join(", ")}`);

  await db.update(requests).set({ updatedAt: new Date() }).where(eq(requests.id, request.id));

  await db.insert(requestEvents).values({
    requestId: request.id,
    kind: "file",
    title: isStudio
      ? `${stored.length} file${stored.length > 1 ? "s" : ""} added by the studio`
      : `${stored.length} file${stored.length > 1 ? "s" : ""} added`,
    note: stored.join(", "),
    isPublic: true,
    actorId,
  });

  if (isStudio) {
    await notify({
      userId: request.userId,
      fallbackEmail: request.contactEmail,
      kind: "file_added",
      title: `New files on ${request.reference}`,
      body: stored.join(", "),
      href: request.userId
        ? `/dashboard/requests/${request.reference}`
        : `/track/${request.reference}?t=${request.trackingToken}`,
      requestId: request.id,
    });
  } else {
    await notifyStudio(
      `Files added to ${request.reference}`,
      shell({
        heading: `${request.contactName} added ${stored.length} file${stored.length > 1 ? "s" : ""}`,
        body: `<p>${esc(stored.join(", "))}</p>`,
        cta: { label: "Open in admin", href: `${SITE.url}/admin/requests/${request.reference}` },
      }),
    );
  }

  return Response.json({ ok: true, stored, rejected }, { status: 201 });
});
