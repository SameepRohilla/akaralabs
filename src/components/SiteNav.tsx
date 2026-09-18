import Link from "next/link";
import { auth } from "@/auth";
import { isStaff } from "@/lib/guard";

/** The marketing nav, now aware of who's looking at it. Markup mirrors the
    original static nav so akara.css and shared.js (mobile menu, logo
    rendering, language switch) keep working untouched. */
export default async function SiteNav({ activeHash }: { activeHash?: string }) {
  const session = await auth();
  const user = session?.user;
  const initials = (user?.name || user?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("");

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link className="logo" href="/" aria-label="Akara Labs home" />
        <div className="nav-links">
          <Link href="/work/">Work</Link>
          <Link href={activeHash === "services" ? "#services" : "/#services"}>Services</Link>
          {/* A link, not a second button. The 3D-print service needs to be
              visible on every page — someone who already has a file should not
              have to find the services band to discover we quote it — but the
              nav CTA slot holds one primary action, and a second filled button
              beside "Start a project" would leave two primaries competing and
              crowd the mobile bar, which already carries the theme toggle, the
              language switch and the hamburger. */}
          <Link href="/print/">3D print</Link>
          <Link href="/materials/">Materials</Link>
          <Link href="/articles/">Journal</Link>
          <Link href="/about/">About</Link>
          <Link href="/faq/">FAQ</Link>
        </div>
        <div className="nav-cta">
          {user ? (
            <div className="nav-account">
              <Link
                className="btn btn-ghost"
                href={isStaff(user.role) ? "/admin" : "/dashboard"}
              >
                {isStaff(user.role) ? "Studio" : "Dashboard"}
              </Link>
              <Link
                href="/dashboard/settings"
                className="nav-avatar"
                aria-label="Your account"
                title={user.email ?? "Account"}
              >
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.image} alt="" />
                ) : (
                  initials
                )}
              </Link>
            </div>
          ) : (
            <>
              <Link className="btn btn-ghost" href="/signin">
                Sign in
              </Link>
              <Link className="btn btn-primary" href="/start/">
                Start a project
              </Link>
            </>
          )}
          <button className="nav-toggle btn" aria-label="Menu">
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </nav>
  );
}
