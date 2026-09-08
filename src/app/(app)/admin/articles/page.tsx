import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { articles, users } from "@/db/schema";
import AdminShell from "@/components/AdminShell";
import { formatDate, formatWhen } from "@/lib/dates";

export const metadata: Metadata = { title: "Journal", robots: { index: false } };
export const dynamic = "force-dynamic";

const PILL: Record<string, string> = {
  draft: "pill",
  published: "pill pill-done",
  archived: "pill pill-hold",
};

export default async function AdminArticlesPage() {
  const rows = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      status: articles.status,
      access: articles.access,
      readMinutes: articles.readMinutes,
      viewCount: articles.viewCount,
      tags: articles.tags,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
      authorName: users.name,
    })
    .from(articles)
    .leftJoin(users, eq(users.id, articles.authorId))
    .orderBy(desc(articles.updatedAt))
    .limit(200);

  return (
    <AdminShell
      current="/admin/articles"
      title="Journal"
      sub={`${rows.filter((r) => r.status === "published").length} published · ${rows.filter((r) => r.status === "draft").length} in draft`}
      actions={
        <Link className="btn btn-primary btn-sm" href="/admin/articles/new">
          Write something
        </Link>
      }
    >
      {rows.length === 0 ? (
        <div className="panel empty">
          <div className="e-glyph">✎</div>
          <h3>Nothing written yet.</h3>
          <p>
            Build logs and material notes are the cheapest marketing a workshop has — and members
            get to read the good ones.
          </p>
          <Link className="btn btn-primary" href="/admin/articles/new">
            Write the first one
          </Link>
        </div>
      ) : (
        <div className="panel">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Access</th>
                  <th>Views</th>
                  <th>Published</th>
                  <th>Edited</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/admin/articles/${a.id}`}>{a.title}</Link>
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-faint)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                        /articles/{a.slug}
                        {a.readMinutes ? ` · ${a.readMinutes} min` : ""}
                      </span>
                      {a.tags.length ? (
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-faint)", marginTop: 3 }}>
                          {a.tags.join(" · ")}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span className={PILL[a.status] ?? "pill"}>{a.status}</span>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--ink-faint)" }}>{a.access}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{a.viewCount}</td>
                    <td style={{ fontSize: 13, color: "var(--ink-faint)" }}>
                      {a.publishedAt ? formatDate(a.publishedAt) : "—"}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--ink-faint)" }}>{formatWhen(a.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
