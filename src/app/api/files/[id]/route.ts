import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { files as filesTable, requests } from "@/db/schema";
import { handler, ApiError, isStaff } from "@/lib/guard";
import { auth } from "@/auth";
import * as storage from "@/lib/storage";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { Readable } from "node:stream";

export const runtime = "nodejs";

/* Files never sit under /public — every download goes through this check.
   A customer gets their own files; staff get everything; a guest holding a
   valid tracking token gets that request's files and nothing else. */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t");

  const [row] = await db
    .select({ file: filesTable, request: requests })
    .from(filesTable)
    .leftJoin(requests, eq(requests.id, filesTable.requestId))
    .where(and(eq(filesTable.id, id), isNull(filesTable.deletedAt)))
    .limit(1);

  if (!row) throw new ApiError(404, "File not found");
  const { file, request } = row;

  const session = await auth();
  const user = session?.user;

  const allowed =
    file.isPublic ||
    (user && isStaff(user.role)) ||
    (user && file.userId === user.id) ||
    (user && request && request.userId === user.id) ||
    (!!token && !!request && timingSafeEqual(request.trackingToken, token));

  if (!allowed) throw new ApiError(user ? 403 : 401, "You don't have access to that file.");

  let size: number;
  try {
    size = await storage.size(file.storageKey);
  } catch {
    throw new ApiError(410, "That file is no longer on disk.");
  }

  const stream = Readable.toWeb(storage.stream(file.storageKey)) as WebReadableStream<Uint8Array>;

  // Images and PDFs preview inline; CAD and archives download.
  const inline = /^(image\/|application\/pdf)/.test(file.mimeType);

  return new Response(stream as unknown as BodyInit, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      // Private: this URL is per-user authorised, never shared-cacheable.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
