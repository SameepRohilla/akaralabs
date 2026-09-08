import type { Metadata } from "next";
import Link from "next/link";
import { adminStats, adminQueue, adminAttention } from "@/lib/queries";
import AdminShell from "@/components/AdminShell";
import { StagePill } from "@/components/RequestCard";
import { formatINR } from "@/lib/money";
import { formatWhen } from "@/lib/dates";

export const metadata: Metadata = { title: "Studio", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [stats, recent, attention] = await Promise.all([
    adminStats(),
    adminQueue({ stage: "open", limit: 8 }),
    adminAttention(),
  ]);

  return (
    <AdminShell
      current="/admin"
      title="The bench"
      sub={`${stats.pipeline.open} open · ${stats.pipeline.newThisWeek} new this week`}
      actions={
        <Link className="btn btn-ghost btn-sm" href="/admin/requests">
          Full queue →
        </Link>
      }
    >
      <div className="grid-4" style={{ marginBottom: 22 }}>
        <div className="metric">
          <div className="m-label">Needs a quote</div>
          <div className="m-value" style={{ color: stats.pipeline.awaitingQuote ? "var(--terra-deep)" : undefined }}>
            {stats.pipeline.awaitingQuote}
          </div>
          <div className="m-foot">
            {stats.medianQuoteHours != null
              ? `median ${stats.medianQuoteHours} hrs to quote`
              : "no quotes sent yet"}
          </div>
        </div>
        <div className="metric">
          <div className="m-label">Waiting on customer</div>
          <div className="m-value">{stats.pipeline.awaitingCustomer}</div>
          <div className="m-foot">{formatINR(stats.money.pendingPaise)} in play</div>
        </div>
        <div className="metric">
          <div className="m-label">In production</div>
          <div className="m-value">{stats.pipeline.inProduction}</div>
          <div className="m-foot">{stats.pipeline.onHold} on hold</div>
        </div>
        <div className="metric">
          <div className="m-label">Won · last 30 days</div>
          <div className="m-value">{formatINR(stats.money.wonPaise30)}</div>
          <div className="m-foot">
            {stats.money.winRate != null ? `${stats.money.winRate}% of quotes accepted` : "—"}
          </div>
        </div>
      </div>

      <div className="split">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Open queue</h3>
              <p className="ph-sub">Highest priority first.</p>
            </div>
          </div>

          {recent.length === 0 ? (
            <p style={{ color: "var(--ink-faint)", fontSize: 14, margin: 0 }}>
              Nothing open. Quiet bench.
            </p>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Customer</th>
                    <th>What</th>
                    <th>Stage</th>
                    <th>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/admin/requests/${r.reference}`} className="ref">
                          {r.reference}
                        </Link>
                      </td>
                      <td>
                        {r.contactName}
                        {r.contactCompany ? (
                          <span style={{ display: "block", fontSize: 12, color: "var(--ink-faint)" }}>
                            {r.contactCompany}
                          </span>
                        ) : null}
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.title || (r.kind === "print" ? "3D print" : "Project")}
                        </span>
                      </td>
                      <td>
                        <StagePill stage={r.stage} kind={r.kind} />
                      </td>
                      <td style={{ fontSize: 13, color: "var(--ink-faint)" }}>{formatWhen(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="stack">
          <div
            className="panel"
            style={{
              borderColor: attention.length ? "rgba(217,138,128,.45)" : undefined,
            }}
          >
            <div className="panel-head">
              <div>
                <h3>Needs a nudge</h3>
                <p className="ph-sub">Unquoted over a day, stalled a week, or on hold.</p>
              </div>
            </div>
            {attention.length === 0 ? (
              <p style={{ color: "#7FC79B", fontSize: 14, margin: 0 }}>
                ✓ Nothing overdue. Everything has moved recently.
              </p>
            ) : (
              <ul className="filelist">
                {attention.slice(0, 8).map((a) => (
                  <li key={a.reference}>
                    <Link
                      href={`/admin/requests/${a.reference}`}
                      className="filerow"
                      style={{ textDecoration: "none", color: "inherit", alignItems: "flex-start" }}
                    >
                      <span className="fr-name" style={{ whiteSpace: "normal" }}>
                        <span className="ref" style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--terra-deep)" }}>
                          {a.reference}
                        </span>
                        <span style={{ display: "block", fontSize: 13.5, marginTop: 2 }}>
                          {a.contactName} — {a.title || "untitled"}
                        </span>
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-faint)", marginTop: 3 }}>
                          {a.stage === "on_hold"
                            ? "on hold"
                            : a.staleHours > 168
                              ? `no movement in ${Math.round(a.staleHours / 24)} days`
                              : `unquoted for ${a.ageHours} hrs`}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Quotes</h3>
            </div>
            <dl className="kv" style={{ gridTemplateColumns: "1fr auto" }}>
              <dt>Sent</dt>
              <dd style={{ textAlign: "right" }}>{stats.money.sent}</dd>
              <dt>Accepted</dt>
              <dd style={{ textAlign: "right", color: "#7FC79B" }}>{stats.money.accepted}</dd>
              <dt>Sent back</dt>
              <dd style={{ textAlign: "right" }}>{stats.money.rejected}</dd>
              <dt>Won all-time</dt>
              <dd style={{ textAlign: "right" }}>{formatINR(stats.money.wonPaise)}</dd>
              <dt>New customers</dt>
              <dd style={{ textAlign: "right" }}>{stats.people.newCustomers30} / 30d</dd>
            </dl>
          </div>
        </aside>
      </div>
    </AdminShell>
  );
}
