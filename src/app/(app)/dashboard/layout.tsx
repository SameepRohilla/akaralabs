import { requireUser } from "@/lib/guard";
import { claimRequestsForUser } from "@/lib/claim";

export const dynamic = "force-dynamic";

/** Guards the whole portal and does the one job that belongs at this level:
    attaching any guest enquiries this person made before they had an account.
    (Someone who enquired as a guest and later signed up with Google never
    passes through our register route, so the sweep has to live here.)
    Page chrome is rendered per page by <PortalShell>, which needs the page's
    own title and current path. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser("/dashboard");
  if (session.user.email) await claimRequestsForUser(session.user.id, session.user.email);
  return <>{children}</>;
}
