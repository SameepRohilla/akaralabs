import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { apiUser, handler, ApiError } from "@/lib/guard";
import { limit } from "@/lib/ratelimit";

const schema = z.object({
  current: z.string().min(1).max(200).optional(),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export const POST = handler(async (req: Request) => {
  const me = await apiUser();
  await limit({ key: `pwchange:${me.id}`, max: 10, windowSeconds: 3600 });

  const input = schema.parse(await req.json());

  const [user] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  if (!user) throw new ApiError(404, "Account not found");

  // Only require the old password if there is one to check.
  if (user.passwordHash) {
    if (!input.current) throw new ApiError(400, "Enter your current password.");
    const ok = await bcrypt.compare(input.current, user.passwordHash);
    if (!ok) throw new ApiError(403, "That current password isn't right.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
  });

  return Response.json({ ok: true });
});
