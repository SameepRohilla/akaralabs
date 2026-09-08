import Link from "next/link";
import SignOutButton from "./SignOutButton";

export type SideItem = {
  href: string;
  label: string;
  icon: string;
  count?: number;
  exact?: boolean;
};

export type SideGroup = { heading: string; items: SideItem[] };

/** Sidebar + header chrome shared by the customer portal and the admin. */
export default function AppShell({
  groups,
  currentPath,
  title,
  sub,
  actions,
  children,
  footerNote,
}: {
  groups: SideGroup[];
  currentPath: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footerNote?: string;
}) {
  const isCurrent = (item: SideItem) =>
    item.exact ? currentPath === item.href : currentPath === item.href || currentPath.startsWith(item.href + "/");

  return (
    <div className="app-shell">
      <aside className="app-side">
        <div className="side-brand">
          <Link className="logo" href="/" aria-label="Akara Labs home" />
        </div>

        {groups.map((group) => (
          <div className="side-group" key={group.heading}>
            <h5>{group.heading}</h5>
            <nav>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="side-link"
                  aria-current={isCurrent(item) ? "page" : undefined}
                >
                  <span className="sl-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.label}
                  {item.count ? <span className="sl-count">{item.count}</span> : null}
                </Link>
              ))}
            </nav>
          </div>
        ))}

        <div className="side-group" style={{ marginTop: "auto" }}>
          <nav>
            <Link href="/" className="side-link">
              <span className="sl-icon" aria-hidden="true">
                ↗
              </span>
              Back to site
            </Link>
            <SignOutButton />
          </nav>
          {footerNote ? (
            <p style={{ padding: "10px 10px 0", fontSize: 11.5, color: "var(--ink-faint)", lineHeight: 1.5 }}>
              {footerNote}
            </p>
          ) : null}
        </div>
      </aside>

      <main className="app-main">
        <header className="app-head">
          <div>
            <h1>{title}</h1>
            {sub ? <p className="sub">{sub}</p> : null}
          </div>
          {actions ? <div className="row">{actions}</div> : null}
        </header>
        <div className="app-body">{children}</div>
      </main>
    </div>
  );
}
