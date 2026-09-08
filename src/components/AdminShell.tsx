import { requireStaff } from "@/lib/guard";
import { adminStats } from "@/lib/queries";
import AppShell, { type SideGroup } from "./AppShell";

export default async function AdminShell({
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
  const session = await requireStaff(current);
  const stats = await adminStats();

  const groups: SideGroup[] = [
    {
      heading: "Studio",
      items: [
        { href: "/admin", label: "Overview", icon: "◈", exact: true },
        { href: "/admin/requests", label: "Queue", icon: "▤", count: stats.pipeline.open },
        { href: "/admin/quotes", label: "Quotes", icon: "₹", count: stats.pipeline.awaitingCustomer },
        { href: "/admin/workshop", label: "Workshop", icon: "⚒" },
      ],
    },
    {
      heading: "Content",
      items: [{ href: "/admin/articles", label: "Journal", icon: "✎" }],
    },
    {
      heading: "Admin",
      items: [
        { href: "/admin/people", label: "People", icon: "☺", count: stats.people.customers },
        ...(session.user.role === "admin"
          ? [{ href: "/admin/audit", label: "Audit log", icon: "❍" }]
          : []),
      ],
    },
  ];

  return (
    <AppShell
      groups={groups}
      currentPath={current}
      title={title}
      sub={sub}
      actions={actions}
      footerNote={`Signed in as ${session.user.name || session.user.email} · ${session.user.role}`}
    >
      {children}
    </AppShell>
  );
}
