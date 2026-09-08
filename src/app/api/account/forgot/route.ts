import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, authTokens } from "@/db/schema";
import { handler } from "@/lib/guard";
import { limit, clientIp } from "@/lib/ratelimit";
import { makeAuthToken } from "@/lib/ids";
import { sendMail, shell, esc } from "@/lib/mail";
import { SITE } from "@/lib/site";

const schema = z.object({ email: z.string().email().max(200) });

export const POST = handler(async (req: Request) => {
  await limit({ key: `forgot:${clientIp(req)}`, max: 6, windowSeconds: 3600 });

  const { email: rawEmail } = schema.parse(await req.json());
  const email = rawEmail.toLowerCase().trim();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);

  // Always report success — never reveal whether an address is registered.
  if (user) {
    await limit({ key: `forgot-user:${user.id}`, max: 4, windowSeconds: 3600 });

    const { token, hash } = makeAuthToken();
    await db.insert(authTokens).values({
      userId: user.id,
      purpose: "reset_password",
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    const link = `${SITE.url}/reset?token=${token}`;
    await sendMail({
      to: user.email,
      subject: "Reset your Akara Labs password",
      html: shell({
        heading: "Set a new password.",
        body: user.passwordHash
          ? `<p>Hello ${esc((user.name || "").split(" ")[0] || "there")},</p><p>Use the button below to choose a new password. The link is good for one hour.</p>`
          : `<p>Hello ${esc((user.name || "").split(" ")[0] || "there")},</p><p>Your account signs in with Google, so there's no password to reset. You can set one below if you'd rather use email and password.</p>`,
        cta: { label: "Choose a new password", href: link },
        footNote: "If you didn't ask for this, you can safely ignore this email — nothing has changed.",
      }),
    });
  }

  return Response.json({ ok: true });
});
