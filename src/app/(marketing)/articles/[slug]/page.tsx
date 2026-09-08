import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { articles } from "@/db/schema";
import { auth } from "@/auth";
import { getArticle, isClient, isBookmarked, listArticles } from "@/lib/queries";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate } from "@/lib/dates";
import { humanSize } from "@/lib/storage";
import BookmarkButton from "@/components/BookmarkButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const row = await getArticle(slug);
  if (!row || row.article.status !== "published") return { title: "Not found", robots: { index: false } };

  const a = row.article;
  const gated = a.access !== "public";

  return {
    title: a.title,
    description: a.excerpt ?? undefined,
    alternates: { canonical: `/articles/${a.slug}/` },
    // Gated pieces show a teaser to everyone, so they stay indexable — but
    // the full text isn't in the HTML for a crawler to lift.
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      title: a.title,
      description: a.excerpt ?? undefined,
      url: `/articles/${a.slug}/`,
      publishedTime: a.publishedAt?.toISOString(),
      authors: row.authorName ? [row.authorName] : undefined,
    },
    other: gated ? { "article:content_tier": "locked" } : undefined,
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await getArticle(slug);
  const session = await auth();
  const user = session?.user;
  const staff = user?.role === "staff" || user?.role === "admin";

  if (!row) notFound();
  const a = row.article;
  if (a.status !== "published" && !staff) notFound();

  const client = user ? await isClient(user.id) : false;

  const canRead =
    a.access === "public" ||
    staff ||
    (a.access === "members" && !!user) ||
    (a.access === "clients" && client);

  const bookmarked = user ? await isBookmarked(user.id, a.id) : false;
  const more = await listArticles({ viewerRole: user ? user.role : "guest", isClient: client, limit: 4 });

  if (canRead) {
    // Fire-and-forget view count; never let analytics break the page.
    db.update(articles)
      .set({ viewCount: sql`${articles.viewCount} + 1` })
      .where(eq(articles.id, a.id))
      .catch(() => {});
  }

  const html = canRead ? renderMarkdown(a.bodyMd) : renderMarkdown(teaser(a.bodyMd));

  return (
    <main>
      <article className="wrap" style={{ padding: "clamp(40px, 5.5vw, 76px) 0 40px", maxWidth: 780 }}>
        <Link href="/articles/" className="kicker" style={{ textDecoration: "none", display: "inline-block", marginBottom: 18 }}>
          ← The journal
        </Link>

        <div className="row" style={{ gap: 10, marginBottom: 12 }}>
          <span className="art-meta">
            {formatDate(a.publishedAt)}
            {a.readMinutes ? ` · ${a.readMinutes} min read` : ""}
          </span>
          {a.access !== "public" ? (
            <span className="members-badge">{a.access === "clients" ? "clients only" : "members"}</span>
          ) : null}
          {a.status !== "published" ? <span className="pill pill-hold">{a.status}</span> : null}
        </div>

        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(30px, 4.4vw, 46px)",
            fontWeight: 460,
            lineHeight: 1.12,
            margin: "0 0 14px",
          }}
        >
          {a.title}
        </h1>

        {a.subtitle ? (
          <p className="lead" style={{ marginBottom: 22 }}>
            {a.subtitle}
          </p>
        ) : null}

        <div className="row-between" style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", padding: "14px 0", marginBottom: 34 }}>
          <span style={{ fontSize: 13.5, color: "var(--ink-faint)" }}>
            {row.authorName ? `By ${row.authorName}` : "Akara Labs"}
          </span>
          {user ? <BookmarkButton articleId={a.id} initial={bookmarked} /> : null}
        </div>

        <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />

        {!canRead ? (
          <div
            className="panel"
            style={{
              marginTop: -60,
              paddingTop: 60,
              background: "linear-gradient(to bottom, transparent, var(--paper-2) 42%)",
              border: 0,
              textAlign: "center",
            }}
          >
            <div style={{ paddingTop: 30 }}>
              <div style={{ fontFamily: "var(--font-deva)", fontSize: 32, color: "var(--terra)", marginBottom: 12 }}>
                अ
              </div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 23, fontWeight: 460, margin: "0 0 10px" }}>
                {a.access === "clients" ? "This one's for clients." : "The rest is for members."}
              </h3>
              <p style={{ color: "var(--ink-faint)", fontSize: 15, maxWidth: "48ch", margin: "0 auto 22px", lineHeight: 1.65 }}>
                {a.access === "clients"
                  ? "Process notes like this open up once you've had a job through the workshop. Send us a brief and it unlocks."
                  : "Free account, no card, nothing sent to you unless you ask. It opens every members piece in the journal."}
              </p>
              <div className="row" style={{ justifyContent: "center" }}>
                {user ? (
                  <Link className="btn btn-primary" href="/start/">
                    Start a project
                  </Link>
                ) : (
                  <>
                    <Link className="btn btn-primary" href={`/signup?next=/articles/${a.slug}`}>
                      Create a free account
                    </Link>
                    <Link className="btn btn-ghost" href={`/signin?next=/articles/${a.slug}`}>
                      Sign in
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {canRead && a.attachments.length ? (
          <div className="panel" style={{ marginTop: 40 }}>
            <div className="panel-head">
              <div>
                <h3>Files from this piece</h3>
                <p className="ph-sub">Free to use on your own machines.</p>
              </div>
            </div>
            <ul className="filelist">
              {a.attachments.map((f) => (
                <li key={f.key}>
                  <a href={`/api/articles/${a.slug}/files/${encodeURIComponent(f.key)}`} className="filerow" style={{ textDecoration: "none", color: "inherit" }}>
                    <span className="fr-ext">{(f.name.split(".").pop() || "").slice(0, 5)}</span>
                    <span className="fr-name">{f.name}</span>
                    {f.size ? <span className="fr-size">{humanSize(f.size)}</span> : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {a.tags.length ? (
          <div className="row" style={{ marginTop: 36 }}>
            {a.tags.map((t) => (
              <Link key={t} href={`/articles/?tag=${encodeURIComponent(t)}`} className="spec-badge" style={{ textDecoration: "none" }}>
                {t}
              </Link>
            ))}
          </div>
        ) : null}
      </article>

      {more.filter((m) => m.slug !== a.slug).length ? (
        <section className="wrap" style={{ paddingTop: 20, paddingBottom: 90 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 460, margin: "0 0 18px" }}>
            More from the workshop
          </h2>
          <div className="grid-2">
            {more
              .filter((m) => m.slug !== a.slug)
              .slice(0, 3)
              .map((m) => (
                <Link key={m.id} href={`/articles/${m.slug}`} className="art-card">
                  <div className="ac-body">
                    <p className="art-meta">
                      {formatDate(m.publishedAt)}
                      {m.readMinutes ? ` · ${m.readMinutes} min` : ""}
                    </p>
                    <h3>{m.title}</h3>
                    {m.excerpt ? <p>{m.excerpt}</p> : null}
                  </div>
                </Link>
              ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

/** Roughly the first quarter, cut at a paragraph break so the teaser never
    ends mid-sentence. */
function teaser(md: string): string {
  const paras = md.split(/\n{2,}/);
  const take = Math.max(2, Math.ceil(paras.length * 0.25));
  return paras.slice(0, take).join("\n\n");
}
