import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { handler } from "@/lib/guard";
import { limit, clientIp } from "@/lib/ratelimit";
import { resendOtp, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/otp";
import { sendOtpMail } from "@/lib/otp-mail";

const schema = z.object({ email: z.string().email().max(200) });

export const POST = handler(async (req: Request) => {
  await limit({ key: `intake-resend:${clientIp(req)}`, max: 20, windowSeconds: 3600 });

  const { email } = schema.parse(await req.json());
  const lower = email.toLowerCase().trim();

  const { code, requestId, expiresAt } = await resendOtp({ email: lower, purpose: "intake" });

  /* Only for the greeting — the code is bound to the address, not the name,
     and an unknown request id simply means a plainer email. */
  let name: string | null = null;
  if (requestId) {
    const [row] = await db
      .select({ contactName: requests.contactName })
      .from(requests)
      .where(eq(requests.id, requestId))
      .limit(1);
    name = row?.contactName ?? null;
  }

  await sendOtpMail({ to: lower, purpose: "intake", code, name });

  return Response.json({
    ok: true,
    expiresAt: expiresAt.toISOString(),
    resendAfter: OTP_RESEND_COOLDOWN_SECONDS,
  });
});
