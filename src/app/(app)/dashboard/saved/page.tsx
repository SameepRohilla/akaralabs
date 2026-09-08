import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { listBookmarks } from "@/lib/queries";
import PortalShell from "@/components/PortalShell";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Saved reading", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const session = await requireUser("/dashboard/saved");
  const rows = await listBookmarks(session.user.id);

  return (
    <PortalShell
      current="/dashboard/saved"
      title="Saved reading"
      sub={`${rows.length} saved from the journal`}
      actions={
        <Link className="btn btn-ghost btn-sm" href="/articles/">
          Browse the journal
        </Link>
      }
    >
      {rows.length === 0 ? (
        <div className="panel empty">
          <div className="e-glyph">❑</div>
          <h3>Nothing saved yet.</h3>
          <p>
            Save build logs, material notes and design guides from the journal and they wait for you
            here.
          </p>
          <Link className="btn btn-primary" href="/articles/">
            Open the journal
          </Link>
        </div>
      ) : (
        <div className="grid-2">
          {rows.map((a) => (
            <Link key={a.slug} href={`/articles/${a.slug}`} className="art-card">
              <div className="ac-body">
                <p className="art-meta">
                  {formatDate(a.publishedAt)}
                  {a.readMinutes ? ` · ${a.readMinutes} min` : ""}
                  {a.access !== "public" ? " · members" : ""}
                </p>
                <h3>{a.title}</h3>
                {a.excerpt ? <p>{a.excerpt}</p> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
