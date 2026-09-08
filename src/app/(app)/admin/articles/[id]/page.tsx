import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { articles } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import AdminShell from "@/components/AdminShell";
import ArticleEditor from "./ArticleEditor";

export const metadata: Metadata = { title: "Edit article", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ArticleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff(`/admin/articles/${id}`);

  const isNew = id === "new";

  const article = isNew
    ? null
    : (await db.select().from(articles).where(eq(articles.id, id)).limit(1))[0];

  if (!isNew && !article) notFound();

  return (
    <AdminShell
      current="/admin/articles"
      title={isNew ? "New piece" : article!.title}
      sub={isNew ? "Markdown in, sanitised HTML out." : `/articles/${article!.slug}`}
      actions={
        <>
          {article?.status === "published" ? (
            <Link className="btn btn-ghost btn-sm" href={`/articles/${article.slug}`}>
              View live →
            </Link>
          ) : null}
          <Link className="btn btn-ghost btn-sm" href="/admin/articles">
            ← Journal
          </Link>
        </>
      }
    >
      <ArticleEditor
        article={
          article
            ? {
                id: article.id,
                title: article.title,
                subtitle: article.subtitle ?? "",
                slug: article.slug,
                bodyMd: article.bodyMd,
                excerpt: article.excerpt ?? "",
                tags: article.tags.join(", "),
                access: article.access,
                status: article.status,
              }
            : null
        }
      />
    </AdminShell>
  );
}
