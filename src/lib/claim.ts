import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { requests, requestEvents } from "@/db/schema";

/** A guest can submit /start or /print without an account. When they later
    sign up (or sign in) with the same email, those requests become theirs.
    Called on register and on every portal load, so Google sign-ups pick them
    up too without a separate step. */
export async function claimRequestsForUser(userId: string, email: string): Promise<number> {
  const rows = await db
    .update(requests)
    .set({ userId, updatedAt: new Date() })
    .where(
      and(
        isNull(requests.userId),
        eq(sql`lower(${requests.contactEmail})`, email.toLowerCase()),
      ),
    )
    .returning({ id: requests.id, reference: requests.reference });

  if (rows.length) {
    await db.insert(requestEvents).values(
      rows.map((r) => ({
        requestId: r.id,
        kind: "system" as const,
        title: "Linked to your account",
        note: "This enquiry is now tracked in your dashboard.",
        isPublic: true,
        actorId: userId,
      })),
    );
  }

  return rows.length;
}
