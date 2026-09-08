import { requireUser } from "@/lib/guard";
import { dashboardSummary } from "@/lib/queries";
import AppShell, { type SideGroup } from "./AppShell";

/** The customer portal frame. Each page passes its own title and the path it
    lives at, so the sidebar highlights correctly without any client-side
    routing hooks or context plumbing. */
export default async function PortalShell({
  current,
  title,
  sub,
  actions,
  children,
}: {
  current: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const session = await requireUser(current);
  const summary = await dashboardSummary(session.user.id);

  const groups: SideGroup[] = [
    {
      heading: "Your work",
      items: [
        { href: "/dashboard", label: "Overview", icon: "◈", exact: true },
        { href: "/dashboard/requests", label: "Requests", icon: "▤", count: summary.open },
        { href: "/dashboard/files", label: "Model library", icon: "⬡", count: summary.files },
        { href: "/dashboard/notifications", label: "Updates", icon: "◔", count: summary.unread },
      ],
    },
    {
      heading: "Studio",
      items: [
        { href: "/articles", label: "Journal", icon: "✎" },
        { href: "/dashboard/saved", label: "Saved reading", icon: "❑" },
        { href: "/estimate", label: "Print estimator", icon: "≈" },
        { href: "/start", label: "New request", icon: "＋" },
      ],
    },
    { heading: "Account", items: [{ href: "/dashboard/settings", label: "Settings", icon: "⚙" }] },
  ];

  return (
    <AppShell
      groups={groups}
      currentPath={current}
      title={title}
      sub={sub}
      actions={actions}
      footerNote={session.user.emailVerified ? undefined : "Email not confirmed yet — check your inbox."}
    >
      {children}
    </AppShell>
  );
}
