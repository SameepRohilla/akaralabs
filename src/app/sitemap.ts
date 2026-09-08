import type { MetadataRoute } from "next";
import { desc, eq, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { articles } from "@/db/schema";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

/** The marketing pages plus every published article. Members-only pieces are
    included because they render an indexable teaser — the gate is on the body,
    not the page. Client-only pieces are left out: their teaser says nothing
    useful to someone who can't read the rest. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE.url}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE.url}/work/`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE.url}/materials/`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE.url}/about/`, changeFrequency: "yearly", priority: 0.7 },
    { url: `${SITE.url}/faq/`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE.url}/start/`, changeFrequency: "yearly", priority: 0.9 },
    { url: `${SITE.url}/print/`, changeFrequency: "yearly", priority: 0.9 },
    { url: `${SITE.url}/estimate/`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE.url}/articles/`, changeFrequency: "weekly", priority: 0.8 },
  ];

  try {
    const published = await db
      .select({
        slug: articles.slug,
        updatedAt: articles.updatedAt,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(and(eq(articles.status, "published"), inArray(articles.access, ["public", "members"])))
      .orderBy(desc(articles.publishedAt))
      .limit(1000);

    return [
      ...staticPages,
      ...published.map((a) => ({
        url: `${SITE.url}/articles/${a.slug}`,
        lastModified: a.updatedAt ?? a.publishedAt ?? undefined,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ];
  } catch {
    // A database blip should degrade the sitemap, not 500 it.
    return staticPages;
  }
}
