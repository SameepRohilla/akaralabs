import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { listArticles, isClient } from "@/lib/queries";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Journal",
  description:
    "Build logs, material notes and hard-won process detail from the Akara Labs workshop — what actually worked, what warped, and why.",
  alternates: { canonical: "/articles/" },
  openGraph: { title: "Journal — Akara Labs", url: "/articles/" },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;
  const session = await auth();
  const user = session?.user;

  const client = user ? await isClient(user.id) : false;
  const articles = await listArticles({
    viewerRole: user ? user.role : "guest",
    isClient: client,
    tag,
    limit: 40,
  });

  const tags = [...new Set(articles.flatMap((a) => a.tags))].slice(0, 10);

  return (
    <main>
      <section className="wrap" style={{ padding: "clamp(46px, 6vw, 84px) 0 28px" }}>
        <p className="kicker">The journal</p>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(32px, 4.6vw, 50px)",
            fontWeight: 460,
            margin: "0 0 16px",
            lineHeight: 1.1,
          }}
        >
          What we learned making it.{" "}
          <span className="soft" style={{ color: "var(--ink-faint)" }}>
            Written down.
          </span>
        </h1>
        <p className="lead" style={{ maxWidth: "62ch" }}>
          Build logs, material behaviour, and the failures worth publishing. Some pieces are
          members-only — sign in and they open up.
        </p>

        {tags.length ? (
          <div className="row" style={{ marginTop: 26 }}>
            <Link className={`btn btn-ghost btn-sm ${!tag ? "btn-primary" : ""}`} href="/articles/">
              Everything
            </Link>
            {tags.map((t) => (
              <Link
                key={t}
                className={`btn btn-ghost btn-sm ${tag === t ? "btn-primary" : ""}`}
                href={`/articles/?tag=${encodeURIComponent(t)}`}
              >
                {t}
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <section className="wrap" style={{ paddingTop: 0, paddingBottom: 90 }}>
        {articles.length === 0 ? (
          <div className="panel empty">
            <div className="e-glyph">✎</div>
            <h3>Nothing published here yet.</h3>
            <p>
              The first build logs are being written up. In the meantime, the materials guide has
              most of what people ask us.
            </p>
            <Link className="btn btn-ghost" href="/materials/">
              Read the materials guide
            </Link>
          </div>
        ) : (
          <div className="grid-2">
            {articles.map((a) => (
              <Link key={a.id} href={`/articles/${a.slug}`} className="art-card">
                <div className="ac-body">
                  <div className="row-between" style={{ gap: 10 }}>
                    <p className="art-meta" style={{ margin: 0 }}>
                      {formatDate(a.publishedAt)}
                      {a.readMinutes ? ` · ${a.readMinutes} min read` : ""}
                    </p>
                    {a.access !== "public" ? (
                      <span className="members-badge">
                        {a.access === "clients" ? "clients" : "members"}
                      </span>
                    ) : null}
                  </div>
                  <h3>{a.title}</h3>
                  {a.excerpt ? <p>{a.excerpt}</p> : null}
                </div>
              </Link>
            ))}
          </div>
        )}

        {!user ? (
          <div className="panel" style={{ marginTop: 30, textAlign: "center" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 460, margin: "0 0 10px" }}>
              There&apos;s more behind the door.
            </h3>
            <p style={{ color: "var(--ink-faint)", fontSize: 14.5, maxWidth: "52ch", margin: "0 auto 18px", lineHeight: 1.65 }}>
              Members get the full build logs — settings, failures, and the tolerances we actually
              hit. Clients get the process notes we don&apos;t publish at all.
            </p>
            <div className="row" style={{ justifyContent: "center" }}>
              <Link className="btn btn-primary" href="/signup">
                Create a free account
              </Link>
              <Link className="btn btn-ghost" href="/signin">
                Sign in
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
