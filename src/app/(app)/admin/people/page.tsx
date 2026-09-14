import type { Metadata } from "next";
import Link from "next/link";
import { desc, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, requests } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import AdminShell from "@/components/AdminShell";
import RoleSelect from "./RoleSelect";
import { formatINR } from "@/lib/money";
import { formatDate, formatWhen } from "@/lib/dates";

export const metadata: Metadata = { title: "People", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const session = await requireStaff("/admin/people");
  const isAdmin = session.user.role === "admin";

  const search = q?.trim();

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      company: users.company,
      phone: users.phone,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
      requestCount: sql<number>`(select count(*) from ${requests} where ${requests.userId} = ${users.id})::int`,
      lifetimePaise: sql<number>`(select coalesce(sum(${requests.valuePaise}),0) from ${requests} where ${requests.userId} = ${users.id} and ${requests.stage} in ('approved','in_production','quality_check','shipped','completed'))::bigint`,
    })
    .from(users)
    .where(
      search
        ? or(
            sql`${users.email} ilike ${"%" + search + "%"}`,
            sql`coalesce(${users.name},'') ilike ${"%" + search + "%"}`,
            sql`coalesce(${users.company},'') ilike ${"%" + search + "%"}`,
          )
        : undefined,
    )
    .orderBy(desc(users.createdAt))
    .limit(300);

  return (
    <AdminShell
      current="/admin/people"
      title="People"
      sub={`${rows.length} account${rows.length === 1 ? "" : "s"}`}
      actions={
        <form action="/admin/people" className="row" style={{ gap: 8 }}>
          <input
            className="inp"
            name="q"
            defaultValue={search}
            placeholder="Name, email, company…"
            style={{ width: 220, padding: "7px 11px", fontSize: 13.5 }}
          />
          <button className="btn btn-ghost btn-sm">Search</button>
        </form>
      }
    >
      {rows.length === 0 ? (
        <div className="panel empty">
          <div className="e-glyph">☺</div>
          <h3>{search ? "No match." : "No accounts yet."}</h3>
          <p>
            {search
              ? `Nobody matches “${search}”. Guest enquiries have no account — search the queue instead.`
              : "Accounts appear here as customers sign up or claim their guest enquiries."}
          </p>
          {search ? (
            <Link className="btn btn-ghost" href="/admin/requests">
              Search the queue
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="panel">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>User ID</th>
                  <th>Requests</th>
                  <th>Value</th>
                  <th>Joined</th>
                  <th>Last seen</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.name || <span style={{ color: "var(--ink-faint)" }}>no name</span>}
                      <span style={{ display: "block", fontSize: 12, color: "var(--ink-faint)" }}>
                        {u.email}
                        {u.emailVerified ? "" : " · unconfirmed"}
                      </span>
                      {u.company ? (
                        <span style={{ display: "block", fontSize: 12, color: "var(--ink-faint)" }}>
                          {u.company}
                          {u.phone ? ` · ${u.phone}` : ""}
                        </span>
                      ) : null}
                    </td>
                    {/* Full id, selectable — it is what you paste into a query or
                        quote when chasing something down, so truncating it would
                        defeat the point of showing it. */}
                    <td>
                      <code
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: "var(--ink-faint)",
                          userSelect: "all",
                          wordBreak: "break-all",
                        }}
                        title="Click to select"
                      >
                        {u.id}
                      </code>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                      {u.requestCount ? (
                        <Link href={`/admin/requests?stage=all&q=${encodeURIComponent(u.email)}`}>
                          {u.requestCount}
                        </Link>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                      {Number(u.lifetimePaise) ? formatINR(Number(u.lifetimePaise)) : "—"}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--ink-faint)" }}>{formatDate(u.createdAt)}</td>
                    <td style={{ fontSize: 13, color: "var(--ink-faint)" }}>
                      {u.lastSeenAt ? formatWhen(u.lastSeenAt) : "never"}
                    </td>
                    <td>
                      {isAdmin ? (
                        <RoleSelect userId={u.id} role={u.role} isSelf={u.id === session.user.id} />
                      ) : (
                        <span className="pill">{u.role}</span>
                      )}
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
