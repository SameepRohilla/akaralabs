import type { Metadata } from "next";
import Link from "next/link";
import { adminQueue } from "@/lib/queries";
import AdminShell from "@/components/AdminShell";
import { StagePill } from "@/components/RequestCard";
import { STAGE_FLOW, STAGE_META } from "@/lib/stages";
import { formatINR } from "@/lib/money";
import { formatWhen, formatDate } from "@/lib/dates";
import type { RequestStage } from "@/db/schema";

export const metadata: Metadata = { title: "Queue", robots: { index: false } };
export const dynamic = "force-dynamic";

const FILTERS = ["open", "all", ...STAGE_FLOW, "on_hold", "cancelled"] as const;

export default async function AdminQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const stage = (FILTERS as readonly string[]).includes(sp.stage ?? "")
    ? (sp.stage as (typeof FILTERS)[number])
    : "open";

  const rows = await adminQueue({ stage: stage as RequestStage | "open" | "all", q: sp.q });

  return (
    <AdminShell
      current="/admin/requests"
      title="Queue"
      sub={`${rows.length} shown`}
      actions={
        <form action="/admin/requests" className="row" style={{ gap: 8 }}>
          <input type="hidden" name="stage" value={stage} />
          <input
            className="inp"
            name="q"
            defaultValue={sp.q}
            placeholder="Reference, name, email…"
            style={{ width: 220, padding: "7px 11px", fontSize: 13.5 }}
          />
          <button className="btn btn-ghost btn-sm">Search</button>
        </form>
      }
    >
      <div className="tabs">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/admin/requests?stage=${f}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
            className={`tab ${f === stage ? "is-active" : ""}`}
          >
            {f === "open" ? "Open" : f === "all" ? "Everything" : STAGE_META[f as RequestStage].label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="panel empty">
          <div className="e-glyph">▤</div>
          <h3>Nothing here.</h3>
          <p>{sp.q ? `No request matches “${sp.q}”.` : "No requests at this stage."}</p>
        </div>
      ) : (
        <div className="panel">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Customer</th>
                  <th>What</th>
                  <th>Stage</th>
                  <th>Value</th>
                  <th>Target</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/requests/${r.reference}`} className="ref">
                        {r.reference}
                      </Link>
                      <span style={{ display: "block", fontSize: 11, color: "var(--ink-faint)", marginTop: 2 }}>
                        {r.kind === "print" ? "print" : "project"}
                        {r.userId ? "" : " · guest"}
                      </span>
                    </td>
                    <td>
                      {r.contactName}
                      <span style={{ display: "block", fontSize: 12, color: "var(--ink-faint)" }}>
                        {r.contactCompany || r.contactEmail}
                      </span>
                    </td>
                    <td style={{ maxWidth: 280 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.title || "—"}
                      </span>
                      {r.quantity ? (
                        <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>qty {r.quantity}</span>
                      ) : null}
                    </td>
                    <td>
                      <StagePill stage={r.stage} kind={r.kind} />
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                      {r.valuePaise ? formatINR(r.valuePaise) : "—"}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--ink-faint)" }}>
                      {r.promisedAt ? formatDate(r.promisedAt) : "—"}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--ink-faint)" }}>{formatWhen(r.updatedAt)}</td>
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
