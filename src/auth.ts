import NextAuth, { type DefaultSession } from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { eq, sql as raw } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { makeReferralCode } from "@/lib/ids";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "customer" | "staff" | "admin";
      emailVerified: Date | null;
    } & DefaultSession["user"];
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

/** Emails listed in ADMIN_EMAILS are promoted to admin on first sign-in. */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  trustHost: true,
  pages: {
    signIn: "/signin",
    error: "/signin",
    verifyRequest: "/signin/check-email",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true, // same human, two doors
    }),
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw_) {
        const parsed = credentialsSchema.safeParse(raw_);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();

        const [user] = await db
          .select()
          .from(users)
          .where(eq(raw`lower(${users.email})`, email))
          .limit(1);

        if (!user?.passwordHash) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user?.id) token.uid = user.id;
      const uid = (token.uid as string) || undefined;
      if (!uid) return token;

      // Refresh role/verification on sign-in and on session update, not on
      // every request — keeps the hot path free of a DB round trip.
      if (user || trigger === "update" || token.role === undefined) {
        const [row] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
        if (row) {
          token.role = row.role;
          token.emailVerified = row.emailVerified ? row.emailVerified.toISOString() : null;
          token.name = row.name;
          token.picture = row.image;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? session.user.id;
        session.user.role = (token.role as "customer" | "staff" | "admin") ?? "customer";
        session.user.emailVerified = token.emailVerified
          ? new Date(token.emailVerified as string)
          : null;
      }
      return session;
    },
  },
  events: {
    /** New accounts get a referral code, an admin promotion if listed, and
        any guest requests submitted with the same email get claimed. */
    async createUser({ user }) {
      if (!user.id || !user.email) return;
      const email = user.email.toLowerCase();
      const isAdmin = adminEmails().includes(email);

      await db
        .update(users)
        .set({
          referralCode: makeReferralCode(),
          ...(isAdmin ? { role: "admin" as const } : {}),
        })
        .where(eq(users.id, user.id));
    },
    async signIn({ user, account }) {
      if (!user?.id) return;
      await db
        .update(users)
        .set({
          lastSeenAt: new Date(),
          // Google has already proven the address — don't ask the user again.
          ...(account?.provider === "google" ? { emailVerified: new Date() } : {}),
        })
        .where(eq(users.id, user.id));
    },
  },
});
