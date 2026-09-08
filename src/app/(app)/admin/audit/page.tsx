import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import AdminShell from "@/components/AdminShell";
import { formatWhen } from "@/lib/dates";

export const metadata: Metadata = { title: "Audit log", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requireAdmin("/admin/audit");

  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .orderBy(desc(auditLog.createdAt))
    .limit(200);

  return (
    <AdminShell current="/admin/audit" title="Audit log" sub="Every staff action, last 200 entries.">
      {rows.length === 0 ? (
        <div className="panel empty">
          <div className="e-glyph">❍</div>
          <h3>Nothing logged yet.</h3>
          <p>Stage changes, quotes, article edits and role changes all land here.</p>
        </div>
      ) : (
        <div className="panel">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 13, color: "var(--ink-faint)", whiteSpace: "nowrap" }}>
                      {formatWhen(r.createdAt)}
                    </td>
                    <td style={{ fontSize: 13 }}>{r.actorName || r.actorEmail || "system"}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--terra-deep)" }}>
                      {r.action}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-faint)" }}>
                      {r.entity}
                      <span style={{ display: "block" }}>{r.entityId?.slice(0, 14)}</span>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-faint)", maxWidth: 320 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.after ? JSON.stringify(r.after) : "—"}
                      </span>
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
