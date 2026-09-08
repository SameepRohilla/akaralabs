import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/guard";
import {
  dashboardSummary,
  listRequestsForUser,
  listUnreadMessageCounts,
  listArticles,
  isClient,
} from "@/lib/queries";
import PortalShell from "@/components/PortalShell";
import RequestCard from "@/components/RequestCard";
import { humanSize } from "@/lib/storage";
import { formatDate } from "@/lib/dates";
import ResendLink from "@/components/ResendVerification";

export const metadata: Metadata = { title: "Your dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireUser("/dashboard");
  const user = session.user;

  const [summary, all, unread, reading, client] = await Promise.all([
    dashboardSummary(user.id),
    listRequestsForUser(user.id),
    listUnreadMessageCounts(user.id),
    listArticles({ viewerRole: user.role, limit: 3 }),
    isClient(user.id),
  ]);

  const open = all.filter((r) => r.stage !== "completed" && r.stage !== "cancelled");
  const awaiting = all.filter((r) => r.stage === "quoted");
  const firstName = (user.name || "").split(" ")[0];

  return (
    <PortalShell
      current="/dashboard"
      title={firstName ? `Hello, ${firstName}.` : "Your dashboard"}
      sub={
        open.length
          ? `${open.length} request${open.length === 1 ? "" : "s"} on the bench.`
          : "Nothing on the bench right now."
      }
      actions={
        <Link className="btn btn-primary btn-sm" href="/start/">
          New request
        </Link>
      }
    >
      {!user.emailVerified ? (
        <div className="notice notice-info" style={{ marginBottom: 20 }}>
          Confirm your email so we can send you quote and progress updates.{" "}
          <ResendLink />
        </div>
      ) : null}

      {awaiting.length ? (
        <div className="panel" style={{ borderColor: "color-mix(in srgb, var(--terra) 40%, transparent)", marginBottom: 18 }}>
          <div className="panel-head" style={{ marginBottom: 10 }}>
            <div>
              <h3>A quote is waiting for you.</h3>
              <p className="ph-sub">Approve it and we schedule the work straight away.</p>
            </div>
          </div>
          <div className="stack-sm">
            {awaiting.map((r) => (
              <Link
                key={r.id}
                href={`/dashboard/requests/${r.reference}`}
                className="filerow"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <span className="fr-ext">quote</span>
                <span className="fr-name">
                  {r.reference} · {r.title || "Request"}
                </span>
                <span className="btn btn-primary btn-sm">Review →</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid-4" style={{ marginBottom: 22 }}>
        <div className="metric">
          <div className="m-label">On the bench</div>
          <div className="m-value">{summary.open}</div>
          <div className="m-foot">{summary.inProduction} in production</div>
        </div>
        <div className="metric">
          <div className="m-label">Awaiting you</div>
          <div className="m-value" style={{ color: summary.awaitingYou ? "var(--terra-deep)" : undefined }}>
            {summary.awaitingYou}
          </div>
          <div className="m-foot">{summary.awaitingYou ? "quote to approve" : "nothing pending"}</div>
        </div>
        <div className="metric">
          <div className="m-label">Completed</div>
          <div className="m-value">{summary.completed}</div>
          <div className="m-foot">since you joined</div>
        </div>
        <div className="metric">
          <div className="m-label">Model library</div>
          <div className="m-value">{summary.files}</div>
          <div className="m-foot">{humanSize(summary.fileBytes)} stored</div>
        </div>
      </div>

      <div className="split">
        <div>
          <div className="panel-head">
            <div>
              <h3 style={{ fontSize: 18 }}>Your requests</h3>
              <p className="ph-sub">Everything you&apos;ve sent us, newest first.</p>
            </div>
            {all.length > 6 ? (
              <Link className="btn btn-ghost btn-sm" href="/dashboard/requests">
                See all {all.length}
              </Link>
            ) : null}
          </div>

          {all.length === 0 ? (
            <div className="panel empty">
              <div className="e-glyph">अ</div>
              <h3>Nothing here yet.</h3>
              <p>
                Send us a brief or a model and it&apos;ll appear here with a live status, a quote, and
                a thread you can talk to us on.
              </p>
              <div className="row" style={{ justifyContent: "center" }}>
                <Link className="btn btn-primary" href="/start/">
                  Start a project
                </Link>
                <Link className="btn btn-ghost" href="/print/">
                  Send a 3D print
                </Link>
              </div>
            </div>
          ) : (
            <div className="stack">
              {all.slice(0, 6).map((r) => (
                <RequestCard
                  key={r.id}
                  request={r}
                  href={`/dashboard/requests/${r.reference}`}
                  unread={unread.get(r.id)}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="stack">
          <div className="panel">
            <div className="panel-head">
              <h3>Quick actions</h3>
            </div>
            <div className="stack-sm">
              <Link className="btn btn-ghost btn-sm" href="/estimate/" style={{ justifyContent: "flex-start" }}>
                ≈ Estimate a print in seconds
              </Link>
              <Link className="btn btn-ghost btn-sm" href="/dashboard/files" style={{ justifyContent: "flex-start" }}>
                ⬡ Reorder from your models
              </Link>
              <Link className="btn btn-ghost btn-sm" href="/materials/" style={{ justifyContent: "flex-start" }}>
                ◇ What&apos;s in stock today
              </Link>
            </div>
          </div>

          {reading.length ? (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>From the journal</h3>
                  <p className="ph-sub">{client ? "Including client-only notes." : "Build logs and material notes."}</p>
                </div>
              </div>
              <div className="stack-sm">
                {reading.map((a) => (
                  <Link
                    key={a.id}
                    href={`/articles/${a.slug}`}
                    style={{ textDecoration: "none", color: "inherit", display: "block" }}
                  >
                    <p className="art-meta">
                      {formatDate(a.publishedAt)}
                      {a.readMinutes ? ` · ${a.readMinutes} min` : ""}
                      {a.access !== "public" ? " · members" : ""}
                    </p>
                    <p style={{ margin: "4px 0 12px", fontSize: 14.5, lineHeight: 1.45 }}>{a.title}</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </PortalShell>
  );
}
