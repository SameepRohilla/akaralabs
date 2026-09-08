import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/guard";
import { getNotifications } from "@/lib/queries";
import PortalShell from "@/components/PortalShell";
import { formatWhen } from "@/lib/dates";

export const metadata: Metadata = { title: "Updates", robots: { index: false } };
export const dynamic = "force-dynamic";

const ICONS: Record<string, string> = {
  stage_change: "◈",
  quote_sent: "₹",
  quote_decision: "✓",
  message: "✉",
  file_added: "⬡",
  article_published: "✎",
  system: "·",
};

export default async function NotificationsPage() {
  const session = await requireUser("/dashboard/notifications");
  const rows = await getNotifications(session.user.id);

  // Viewing the list marks it read — nothing to click, nothing to forget.
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, session.user.id), isNull(notifications.readAt)));

  return (
    <PortalShell
      current="/dashboard/notifications"
      title="Updates"
      sub="Every change on your requests, newest first."
    >
      {rows.length === 0 ? (
        <div className="panel empty">
          <div className="e-glyph">◔</div>
          <h3>Nothing yet.</h3>
          <p>
            Stage changes, quotes, replies and new files all land here — and in your inbox unless
            you turn that off in Settings.
          </p>
        </div>
      ) : (
        <div className="panel">
          <ol className="timeline" style={{ paddingTop: 4 }}>
            {rows.map((n) => (
              <li key={n.id} className={`tl-item ${n.readAt ? "is-done" : "is-current"}`}>
                <p className="tl-title">
                  <span aria-hidden="true" style={{ color: "var(--ink-faint)", marginRight: 8 }}>
                    {ICONS[n.kind] ?? "·"}
                  </span>
                  {n.href ? (
                    <Link href={n.href} style={{ color: "inherit", textDecoration: "none", borderBottom: "1px solid var(--line-2)" }}>
                      {n.title}
                    </Link>
                  ) : (
                    n.title
                  )}
                </p>
                <p className="tl-meta">{formatWhen(n.createdAt)}</p>
                {n.body ? <p className="tl-note">{n.body}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      )}
    </PortalShell>
  );
}
