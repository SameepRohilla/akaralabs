import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { listRequestsForUser, listUnreadMessageCounts } from "@/lib/queries";
import PortalShell from "@/components/PortalShell";
import RequestCard from "@/components/RequestCard";
import { isOpen } from "@/lib/stages";
import type { RequestStage } from "@/db/schema";

export const metadata: Metadata = { title: "Your requests", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const session = await requireUser("/dashboard/requests");

  const [all, unread] = await Promise.all([
    listRequestsForUser(session.user.id),
    listUnreadMessageCounts(session.user.id),
  ]);

  const tabs = [
    { key: "open", label: "On the bench", test: (s: RequestStage) => isOpen(s) },
    { key: "done", label: "Completed", test: (s: RequestStage) => s === "completed" },
    { key: "all", label: "Everything", test: () => true },
  ] as const;

  const active = tabs.find((t) => t.key === filter) ?? tabs[0];
  const shown = all.filter((r) => active.test(r.stage));

  return (
    <PortalShell
      current="/dashboard/requests"
      title="Your requests"
      sub={`${all.length} in total`}
      actions={
        <Link className="btn btn-primary btn-sm" href="/start/">
          New request
        </Link>
      }
    >
      <div className="tabs">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/requests?filter=${t.key}`}
            className={`tab ${t.key === active.key ? "is-active" : ""}`}
          >
            {t.label}
            {t.key !== "all" ? ` (${all.filter((r) => t.test(r.stage)).length})` : ""}
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="panel empty">
          <div className="e-glyph">अ</div>
          <h3>Nothing in this view.</h3>
          <p>
            {active.key === "done"
              ? "Once a job is delivered it moves here, with its files and quote kept for reorders."
              : "Send us a brief or a model and it shows up here with a live status."}
          </p>
          <Link className="btn btn-primary" href="/start/">
            Start a project
          </Link>
        </div>
      ) : (
        <div className="stack">
          {shown.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              href={`/dashboard/requests/${r.reference}`}
              unread={unread.get(r.id)}
            />
          ))}
        </div>
      )}
    </PortalShell>
  );
}
