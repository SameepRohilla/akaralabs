import { eq } from "drizzle-orm";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { db } from "@/db";
import { articles } from "@/db/schema";
import { handler, ApiError, isStaff } from "@/lib/guard";
import { auth } from "@/auth";
import { isClient } from "@/lib/queries";
import * as storage from "@/lib/storage";

export const runtime = "nodejs";

/* Article downloads follow the article's own access level, so a members-only
   STL can't be lifted by guessing its URL. */
export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ slug: string; key: string }> }) => {
    const { slug, key } = await ctx.params;

    const [row] = await db.select().from(articles).where(eq(articles.slug, slug)).limit(1);
    if (!row || row.status !== "published") throw new ApiError(404, "Not found");

    const attachment = row.attachments.find((f) => f.key === decodeURIComponent(key));
    if (!attachment) throw new ApiError(404, "Not found");

    const session = await auth();
    const user = session?.user;
    const staff = user && isStaff(user.role);

    const allowed =
      row.access === "public" ||
      staff ||
      (row.access === "members" && !!user) ||
      (row.access === "clients" && !!user && (await isClient(user.id)));

    if (!allowed) throw new ApiError(user ? 403 : 401, "This download is for members.");

    let size: number;
    try {
      size = await storage.size(attachment.key);
    } catch {
      throw new ApiError(410, "That file is no longer available.");
    }

    const stream = Readable.toWeb(storage.stream(attachment.key)) as WebReadableStream<Uint8Array>;

    return new Response(stream as unknown as BodyInit, {
      headers: {
        "Content-Type": storage.guessMime(attachment.name),
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        "Cache-Control": row.access === "public" ? "public, max-age=86400" : "private, max-age=600",
      },
    });
  },
);
