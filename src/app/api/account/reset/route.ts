import { and, eq, gt, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { users, authTokens, sessions } from "@/db/schema";
import { ApiError, handler } from "@/lib/guard";
import { limit, clientIp } from "@/lib/ratelimit";
import { hashToken } from "@/lib/ids";

const schema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export const POST = handler(async (req: Request) => {
  await limit({ key: `reset:${clientIp(req)}`, max: 12, windowSeconds: 3600 });

  const body = schema.parse(await req.json());

  const [row] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(body.token)),
        eq(authTokens.purpose, "reset_password"),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) throw new ApiError(400, "That reset link has expired or already been used.");

  const passwordHash = await bcrypt.hash(body.password, 12);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, emailVerified: new Date() })
      .where(eq(users.id, row.userId));
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
    // A password reset should end every other session.
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
  });

  return Response.json({ ok: true });
});
