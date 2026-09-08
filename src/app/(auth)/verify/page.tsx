import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, users } from "@/db/schema";
import { hashToken } from "@/lib/ids";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let state: "ok" | "bad" = "bad";

  if (token) {
    const [row] = await db
      .select()
      .from(authTokens)
      .where(
        and(
          eq(authTokens.tokenHash, hashToken(token)),
          eq(authTokens.purpose, "verify_email"),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (row) {
      await db.transaction(async (tx) => {
        await tx.update(users).set({ emailVerified: new Date() }).where(eq(users.id, row.userId));
        await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
      });
      state = "ok";
    }
  }

  return state === "ok" ? (
    <>
      <h1>Email confirmed.</h1>
      <p className="ac-sub">
        You&apos;ll get progress and quote updates for every request from here on.
      </p>
      <Link className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} href="/dashboard">
        Go to your dashboard
      </Link>
    </>
  ) : (
    <>
      <h1>That link didn&apos;t work.</h1>
      <p className="ac-sub">
        It may have expired or already been used. You can send yourself a fresh one from your
        dashboard.
      </p>
      <Link className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }} href="/dashboard">
        Open dashboard
      </Link>
    </>
  );
}
