import { z } from "zod";
import { handler } from "@/lib/guard";
import { limit, clientIp } from "@/lib/ratelimit";
import { resendOtp, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/otp";
import { sendOtpMail } from "@/lib/otp-mail";
import type { PendingSignup } from "../route";

/* Sends a fresh code for a signup already in flight. The pending account
   details ride along on the existing row, so this never needs the form again —
   which is the point: the tab holding the password may well be gone. */

const schema = z.object({ email: z.string().email().max(200) });

export const POST = handler(async (req: Request) => {
  await limit({ key: `register-resend:${clientIp(req)}`, max: 20, windowSeconds: 3600 });

  const { email } = schema.parse(await req.json());
  const lower = email.toLowerCase().trim();

  /* resendOtp enforces the per-row cooldown and send cap and throws an
     ApiError the form can show as-is. */
  const { code, payload, expiresAt } = await resendOtp({ email: lower, purpose: "signup" });
  const pending = payload as PendingSignup | null;

  await sendOtpMail({ to: lower, purpose: "signup", code, name: pending?.name });

  return Response.json({
    ok: true,
    expiresAt: expiresAt.toISOString(),
    resendAfter: OTP_RESEND_COOLDOWN_SECONDS,
  });
});
