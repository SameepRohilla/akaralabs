import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, authTokens } from "@/db/schema";
import { apiUser, handler, ApiError } from "@/lib/guard";
import { limit } from "@/lib/ratelimit";
import { makeAuthToken } from "@/lib/ids";
import { sendMail, shell, esc } from "@/lib/mail";
import { SITE } from "@/lib/site";

export const POST = handler(async () => {
  const me = await apiUser();
  await limit({ key: `verify:${me.id}`, max: 4, windowSeconds: 3600 });

  const [user] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  if (!user) throw new ApiError(404, "Account not found");
  if (user.emailVerified) return Response.json({ ok: true, alreadyVerified: true });

  const { token, hash } = makeAuthToken();
  await db.insert(authTokens).values({
    userId: user.id,
    purpose: "verify_email",
    tokenHash: hash,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
  });

  await sendMail({
    to: user.email,
    subject: "Confirm your email — Akara Labs",
    html: shell({
      heading: "One click to confirm.",
      body: `<p>Hello ${esc((user.name || "").split(" ")[0] || "there")},</p><p>Confirm this address so we can send you quote and progress updates.</p>`,
      cta: { label: "Confirm my email", href: `${SITE.url}/verify?token=${token}` },
      footNote: "This link works for 48 hours.",
    }),
  });

  return Response.json({ ok: true });
});
