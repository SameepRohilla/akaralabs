import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { quotes, requests } from "@/db/schema";
import AdminShell from "@/components/AdminShell";
import { formatINR } from "@/lib/money";
import { formatDate, formatWhen, daysUntil } from "@/lib/dates";

export const metadata: Metadata = { title: "Quotes", robots: { index: false } };
export const dynamic = "force-dynamic";

const PILL: Record<string, string> = {
  draft: "pill",
  sent: "pill pill-quoted",
  accepted: "pill pill-done",
  rejected: "pill pill-hold",
  superseded: "pill",
  expired: "pill pill-hold",
};

export default async function AdminQuotesPage() {
  const rows = await db
    .select({
      id: quotes.id,
      number: quotes.number,
      status: quotes.status,
      totalPaise: quotes.totalPaise,
      leadTimeDays: quotes.leadTimeDays,
      sentAt: quotes.sentAt,
      decidedAt: quotes.decidedAt,
      validUntil: quotes.validUntil,
      decisionNote: quotes.decisionNote,
      reference: requests.reference,
      contactName: requests.contactName,
      title: requests.title,
    })
    .from(quotes)
    .innerJoin(requests, eq(requests.id, quotes.requestId))
    .orderBy(desc(quotes.createdAt))
    .limit(200);

  const awaiting = rows.filter((r) => r.status === "sent");
  const expiringSoon = awaiting.filter((r) => {
    const d = daysUntil(r.validUntil);
    return d !== null && d <= 3;
  });

  return (
    <AdminShell
      current="/admin/quotes"
      title="Quotes"
      sub={`${awaiting.length} awaiting a decision · ${formatINR(awaiting.reduce((a, r) => a + r.totalPaise, 0))} in play`}
    >
      {expiringSoon.length ? (
        <div className="notice notice-info" style={{ marginBottom: 18 }}>
          <strong style={{ color: "var(--ink)" }}>
            {expiringSoon.length} quote{expiringSoon.length === 1 ? "" : "s"} expiring within 3 days:
          </strong>{" "}
          {expiringSoon.map((r) => r.reference).join(", ")} — worth a nudge.
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="panel empty">
          <div className="e-glyph">₹</div>
          <h3>No quotes yet.</h3>
          <p>Open a request from the queue and build one — the geometry pre-fills the pricing.</p>
          <Link className="btn btn-primary" href="/admin/requests">
            Open the queue
          </Link>
        </div>
      ) : (
        <div className="panel">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Quote</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Valid until</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/requests/${r.reference}`} className="ref">
                        {r.number}
                      </Link>
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-faint)", marginTop: 2 }}>
                        {r.title || "—"}
                      </span>
                    </td>
                    <td>{r.contactName}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{formatINR(r.totalPaise)}</td>
                    <td>
                      <span className={PILL[r.status] ?? "pill"}>{r.status}</span>
                      {r.decisionNote ? (
                        <span style={{ display: "block", fontSize: 12, color: "var(--ink-soft)", marginTop: 4, maxWidth: 240 }}>
                          “{r.decisionNote}”
                        </span>
                      ) : null}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--ink-faint)" }}>
                      {r.sentAt ? formatWhen(r.sentAt) : "—"}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--ink-faint)" }}>
                      {r.validUntil ? formatDate(r.validUntil) : "—"}
                    </td>
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
