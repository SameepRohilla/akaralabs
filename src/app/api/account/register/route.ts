import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, handler } from "@/lib/guard";
import { limit, clientIp } from "@/lib/ratelimit";
import { makeAuthToken, makeReferralCode } from "@/lib/ids";
import { authTokens } from "@/db/schema";
import { sendMail, shell, esc } from "@/lib/mail";
import { SITE } from "@/lib/site";
import { claimRequestsForUser } from "@/lib/claim";

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

  const passwordHash = await bcrypt.hash(body.password, 12);
  const adminList = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  let referredBy: string | null = null;
  if (body.referral) {
    const [r] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.referralCode, body.referral.toUpperCase()))
      .limit(1);
    referredBy = r?.id ?? null;
  }

  const [user] = await db
    .insert(users)
    .values({
      name: body.name.trim(),
      email,
      passwordHash,
      phone: body.phone?.trim() || null,
      company: body.company?.trim() || null,
      marketingOptIn: !!body.marketingOptIn,
      referralCode: makeReferralCode(),
      referredBy,
      role: adminList.includes(email) ? "admin" : "customer",
    })
    .returning({ id: users.id, email: users.email, name: users.name });

  // Pull in anything they submitted as a guest on this address.
  const claimedRequests = await claimRequestsForUser(user.id, email);

  // Verification email — non-blocking for sign-in, but nudged in the portal.
  const { token, hash } = makeAuthToken();
  await db.insert(authTokens).values({
    userId: user.id,
    purpose: "verify_email",
    tokenHash: hash,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
  });

  const link = `${SITE.url}/verify?token=${token}`;
  await sendMail({
    to: email,
    subject: "Confirm your email — Akara Labs",
    html: shell({
      heading: "One click to confirm.",
      body: `<p>Hello ${esc((user.name || "").split(" ")[0] || "there")},</p><p>Confirm this address so we can send you quote and progress updates for your projects.</p>`,
      cta: { label: "Confirm my email", href: link },
      footNote: "This link works for 48 hours. If you didn't create an account, ignore this email.",
    }),
  });

  return Response.json({ ok: true, claimedRequests }, { status: 201 });
});
