import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { apiUser, handler, ApiError } from "@/lib/guard";
import { limit } from "@/lib/ratelimit";
import { issueOtp, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/otp";
import { sendOtpMail } from "@/lib/otp-mail";

/* Sends a signed-in user a code for their own address.
 *
 * Kept at this path because the dashboard already calls it; what changed is
 * what arrives. It issues rather than resends, so pressing the button twice
 * simply replaces the code instead of failing a cooldown the user never saw —
 * the limiter below is what stops that being abused.
 */
export const POST = handler(async () => {
  const me = await apiUser();
  await limit({ key: `verify:${me.id}`, max: 5, windowSeconds: 3600 });

  const [user] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  if (!user) throw new ApiError(404, "Account not found");
  if (user.emailVerified) return Response.json({ ok: true, alreadyVerified: true });

  const { code, expiresAt } = await issueOtp({
    email: user.email,
    purpose: "verify_account",
    userId: user.id,
  });

  await sendOtpMail({ to: user.email, purpose: "verify_account", code, name: user.name });

  return Response.json({
    ok: true,
    expiresAt: expiresAt.toISOString(),
    resendAfter: OTP_RESEND_COOLDOWN_SECONDS,
  });
});
