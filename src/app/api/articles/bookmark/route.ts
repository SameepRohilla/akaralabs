import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { articleBookmarks, articles } from "@/db/schema";
import { apiUser, handler, ApiError } from "@/lib/guard";

const schema = z.object({ articleId: z.string().min(1).max(64), saved: z.boolean() });

export const POST = handler(async (req: Request) => {
  const me = await apiUser();
  const { articleId, saved } = schema.parse(await req.json());

  const [exists] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  if (!exists) throw new ApiError(404, "No such article");

  if (saved) {
    await db
      .insert(articleBookmarks)
      .values({ userId: me.id, articleId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(articleBookmarks)
      .where(and(eq(articleBookmarks.userId, me.id), eq(articleBookmarks.articleId, articleId)));
  }

  return Response.json({ ok: true, saved });
});
