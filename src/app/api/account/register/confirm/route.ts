import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, handler } from "@/lib/guard";
import { limit, clientIp } from "@/lib/ratelimit";
import { consumeOtp } from "@/lib/otp";
import { makeReferralCode } from "@/lib/ids";
import { claimRequestsForUser } from "@/lib/claim";
import type { PendingSignup } from "../route";

/* Step two of signup — and the only place an account is created from the
 * signup form. The code is proof the address exists and belongs to whoever is
 * sitting at the form, so the account is born verified: there is nothing left
 * to confirm, and no "please confirm your email" banner to greet them with.
 */

const schema = z.object({
  email: z.string().email().max(200),
  code: z.string().min(4).max(12),
});

export const POST = handler(async (req: Request) => {
  const ip = clientIp(req);
  /* Generous next to the five guesses a code allows, because this also counts
     expired-code and wrong-address attempts. It is the outer wall; consumeOtp
     is the inner one. */
  await limit({ key: `register-confirm:${ip}`, max: 30, windowSeconds: 3600 });

  const body = schema.parse(await req.json());
  const email = body.email.toLowerCase().trim();

  const otp = await consumeOtp({ email, purpose: "signup", code: body.code });
  const pending = otp.payload as PendingSignup | null;

  if (!pending?.passwordHash) {
    /* The row existed and the code matched, but the payload is gone or was
       never written. Nothing sensible to recover — better to say so than to
       create a half-formed account. */
    throw new ApiError(410, "That signup has expired. Please start again.", "otp_gone");
  }

  /* Re-check: someone else may have taken the address in the ten minutes
     between the code going out and coming back, and the unique index would
     otherwise surface as a 500. */
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);

  if (taken) {
    throw new ApiError(409, "There's already an account on this email. Sign in instead.");
  }

  const adminList = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  let referredBy: string | null = null;
  if (pending.referral) {
    const [r] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.referralCode, pending.referral))
      .limit(1);
    referredBy = r?.id ?? null;
  }

  const [user] = await db
    .insert(users)
    .values({
      name: pending.name,
      email,
      passwordHash: pending.passwordHash,
      phone: pending.phone,
      company: pending.company,
      marketingOptIn: pending.marketingOptIn,
      referralCode: makeReferralCode(),
      referredBy,
      role: adminList.includes(email) ? "admin" : "customer",
      // The code was the proof. Nothing further to ask them for.
      emailVerified: new Date(),
    })
    .returning({ id: users.id, email: users.email, name: users.name });

  // Pull in anything they submitted as a guest on this address.
  const claimedRequests = await claimRequestsForUser(user.id, email);

  return Response.json({ ok: true, claimedRequests }, { status: 201 });
});
