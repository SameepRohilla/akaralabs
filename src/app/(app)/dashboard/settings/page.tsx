import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, accounts } from "@/db/schema";
import { requireUser } from "@/lib/guard";
import PortalShell from "@/components/PortalShell";
import SettingsForm from "./SettingsForm";
import PasswordForm from "./PasswordForm";
import { SITE } from "@/lib/site";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireUser("/dashboard/settings");

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  const linked = await db
    .select({ provider: accounts.provider })
    .from(accounts)
    .where(eq(accounts.userId, session.user.id));

  if (!user) throw new Error("Account not found");

  const referralUrl = user.referralCode ? `${SITE.url}/signup?ref=${user.referralCode}` : null;

  return (
    <PortalShell current="/dashboard/settings" title="Settings" sub={user.email}>
      <div className="split">
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Your details</h3>
                <p className="ph-sub">
                  We prefill new requests from this, so keeping it current saves you typing.
                </p>
              </div>
            </div>
            <SettingsForm
              user={{
                name: user.name ?? "",
                phone: user.phone ?? "",
                company: user.company ?? "",
                gstin: user.gstin ?? "",
                addressLine: user.addressLine ?? "",
                city: user.city ?? "",
                state: user.state ?? "",
                pincode: user.pincode ?? "",
                notifyEmail: user.notifyEmail,
                marketingOptIn: user.marketingOptIn,
                locale: user.locale,
              }}
            />
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Password</h3>
                <p className="ph-sub">
                  {user.passwordHash
                    ? "Change it here. Every other session gets signed out."
                    : "You sign in with Google. Set a password if you'd like email sign-in too."}
                </p>
              </div>
            </div>
            <PasswordForm hasPassword={!!user.passwordHash} />
          </div>
        </div>

        <aside className="stack">
          <div className="panel">
            <div className="panel-head">
              <h3>Account</h3>
            </div>
            <dl className="kv">
              <dt>Email</dt>
              <dd>
                {user.email}
                <br />
                <span style={{ fontSize: 12.5, color: user.emailVerified ? "#7FC79B" : "var(--terra-deep)" }}>
                  {user.emailVerified ? "✓ confirmed" : "not confirmed yet"}
                </span>
              </dd>
              <dt>Sign-in</dt>
              <dd>
                {[
                  ...(user.passwordHash ? ["email & password"] : []),
                  ...linked.map((l) => (l.provider === "google" ? "Google" : l.provider)),
                ].join(" · ") || "—"}
              </dd>
              <dt>Member since</dt>
              <dd>{formatDate(user.createdAt)}</dd>
            </dl>
          </div>

          {referralUrl ? (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Refer a builder</h3>
                  <p className="ph-sub">
                    They get 10% off their first job; you get studio credit when it ships.
                  </p>
                </div>
              </div>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12.5,
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  padding: "10px 12px",
                  wordBreak: "break-all",
                  margin: 0,
                  color: "var(--terra-deep)",
                }}
              >
                {referralUrl}
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </PortalShell>
  );
}
