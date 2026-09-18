import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { apiUser, handler, ApiError } from "@/lib/guard";
import { limit } from "@/lib/ratelimit";
import { consumeOtp } from "@/lib/otp";

const schema = z.object({ code: z.string().min(4).max(12) });

export const POST = handler(async (req: Request) => {
  const me = await apiUser();
  await limit({ key: `verify-code:${me.id}`, max: 30, windowSeconds: 3600 });

  const { code } = schema.parse(await req.json());

  const [user] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  if (!user) throw new ApiError(404, "Account not found");
  if (user.emailVerified) return Response.json({ ok: true, alreadyVerified: true });

  /* Checked against the account's address, never one supplied by the caller.
     Codes are bound to an address at issue time, so a signed-in user cannot
     use this to confirm somebody else's. */
  const otp = await consumeOtp({ email: user.email, purpose: "verify_account", code });

  if (otp.userId && otp.userId !== user.id) {
    throw new ApiError(403, "That code belongs to a different account.");
  }

  await db.update(users).set({ emailVerified: new Date() }).where(eq(users.id, user.id));

  return Response.json({ ok: true });
});
