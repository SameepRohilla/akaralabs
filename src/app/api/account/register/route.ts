import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, handler } from "@/lib/guard";
import { limit, clientIp } from "@/lib/ratelimit";
import { issueOtp, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/otp";
import { sendOtpMail } from "@/lib/otp-mail";

/* Step one of signup. No account exists at the end of this request.
 *
 * Everything the form collected is validated here, the password is hashed
 * here, and the result is parked on the OTP row until the code comes back to
 * /register/confirm. That ordering matters: validating at confirm time would
 * mean telling someone their email is taken *after* they had gone to their
 * inbox, and hashing at confirm time would mean storing their password in
 * plaintext in the meantime.
 */

const schema = z.object({
  name: z.string().min(1, "Tell us your name").max(120),
  email: z.string().email("That doesn't look like an email address").max(200),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(200, "That password is too long"),
  phone: z.string().max(40).optional(),
  company: z.string().max(160).optional(),
  marketingOptIn: z.boolean().optional(),
  referral: z.string().max(20).optional(),
});

/** Shape of what we park on the OTP row. Mirrored in /register/confirm. */
export type PendingSignup = {
  name: string;
  email: string;
  passwordHash: string;
  phone: string | null;
  company: string | null;
  marketingOptIn: boolean;
  referral: string | null;
};

export const POST = handler(async (req: Request) => {
  const ip = clientIp(req);
  await limit({ key: `register:${ip}`, max: 8, windowSeconds: 3600 });

  const body = schema.parse(await req.json());
  const email = body.email.toLowerCase().trim();

  const [existing] = await db
    .select({ id: users.id, hasPassword: users.passwordHash })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);

  if (existing) {
    throw new ApiError(
      409,
      existing.hasPassword
        ? "There's already an account on this email. Sign in instead."
        : "This email is registered through Google. Use “Continue with Google”.",
    );
  }

  /* A second limiter keyed to the address, not the IP. Without it, one IP's
     budget of eight covers eight different victims' inboxes; with it, nobody
     can be made to receive more than a few codes however many addresses the
     sender cycles through. */
  await limit({
    key: `register-otp:${email}`,
    max: 5,
    windowSeconds: 3600,
    message: "We've already sent several codes to that address. Check your spam folder, or try again later.",
  });

  const pending: PendingSignup = {
    name: body.name.trim(),
    email,
    passwordHash: await bcrypt.hash(body.password, 12),
    phone: body.phone?.trim() || null,
    company: body.company?.trim() || null,
    marketingOptIn: !!body.marketingOptIn,
    referral: body.referral?.trim().toUpperCase() || null,
  };

  const { code, expiresAt } = await issueOtp({
    email,
    purpose: "signup",
    payload: pending as unknown as Record<string, unknown>,
  });

  await sendOtpMail({ to: email, purpose: "signup", code, name: pending.name });

  return Response.json(
    {
      ok: true,
      stage: "otp",
      email,
      expiresAt: expiresAt.toISOString(),
      resendAfter: OTP_RESEND_COOLDOWN_SECONDS,
    },
    { status: 202 },
  );
});
