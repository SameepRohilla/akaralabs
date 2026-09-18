import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailOtps } from "@/db/schema";
import { ApiError } from "./guard";

/* Six-digit email codes, and the rules that stop them being a doorbell anyone
 * can ring.
 *
 * A six-digit code is one-in-a-million per guess, which sounds fine until you
 * notice that an unthrottled attacker gets a million guesses. Everything below
 * exists to make sure they don't:
 *
 *   - ten-minute life, so the window is short
 *   - five wrong guesses and the code is dead, not merely wrong
 *   - one code live per (email, purpose) — a resend replaces its predecessor,
 *     so you cannot widen the target by requesting fifty codes
 *   - a send cap, so nobody can use us to mail-bomb a stranger
 *
 * Together those bound an attacker to a handful of guesses per code and a
 * handful of codes per hour, which is where a six-digit code is safe. Drop any
 * one of them and it is not.
 */

export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
/** Codes per row, across resends, before the address has to start over. */
export const OTP_MAX_SENDS = 5;

export type OtpPurpose = "signup" | "intake" | "verify_account";

/** Uniformly distributed, from the CSPRNG — `Math.random()` is not acceptable
    for something that guards account creation, and `% 1000000` on raw bytes
    would bias the low codes. */
export function makeOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/* The pepper is a server secret, not a per-row salt. A salt would not help
   here: the input space is a million values, so an attacker holding the
   database could exhaust any unkeyed hash — salted or not — in milliseconds.
   Keying the hash with a secret that lives only in the environment means a
   stolen dump alone is useless. */
function pepper(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    /* Not a warning. Without this, codes in a leaked dump are crackable by
       hand, and AUTH_SECRET is already required for sessions — an environment
       missing it is broken in more ways than this one. */
    throw new Error("AUTH_SECRET is not set — email codes cannot be hashed safely");
  }
  return secret;
}

export function hashOtp(email: string, purpose: OtpPurpose, code: string): string {
  /* The address and purpose are bound into the hash, so a code issued to
     confirm one thing can never be replayed against another. */
  return createHmac("sha256", pepper())
    .update(`${email.toLowerCase().trim()}\0${purpose}\0${code}`)
    .digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export type IssuedOtp = {
  code: string;
  otpId: string;
  expiresAt: Date;
  /** Seconds until a resend is allowed. */
  resendAfter: number;
};

/** Mints a code, retiring any earlier live one for the same address+purpose. */
export async function issueOtp(opts: {
  email: string;
  purpose: OtpPurpose;
  payload?: Record<string, unknown>;
  requestId?: string | null;
  userId?: string | null;
}): Promise<IssuedOtp> {
  const email = opts.email.toLowerCase().trim();
  const code = makeOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  const issued = await db.transaction(async (tx) => {
    /* Retire the old one first. Two live codes for the same address doubles an
       attacker's chances for free, and leaves the user guessing which of the
       two emails in their inbox is the real one. */
    await tx
      .update(emailOtps)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(sql`lower(${emailOtps.email})`, email),
          eq(emailOtps.purpose, opts.purpose),
          isNull(emailOtps.consumedAt),
        ),
      );

    const [row] = await tx
      .insert(emailOtps)
      .values({
        email,
        purpose: opts.purpose,
        codeHash: hashOtp(email, opts.purpose, code),
        payload: opts.payload,
        requestId: opts.requestId ?? null,
        userId: opts.userId ?? null,
        expiresAt,
      })
      .returning({ id: emailOtps.id });

    return row;
  });

  return { code, otpId: issued.id, expiresAt, resendAfter: OTP_RESEND_COOLDOWN_SECONDS };
}

/** Mints a replacement code on the *same* row, so the send count and the
    original intent (the pending signup, the request being confirmed) carry
    over. Enforces the cooldown and the send cap. */
export async function resendOtp(opts: {
  email: string;
  purpose: OtpPurpose;
}): Promise<IssuedOtp & { payload: Record<string, unknown> | null; requestId: string | null; userId: string | null }> {
  const email = opts.email.toLowerCase().trim();

  const [row] = await db
    .select()
    .from(emailOtps)
    .where(
      and(
        eq(sql`lower(${emailOtps.email})`, email),
        eq(emailOtps.purpose, opts.purpose),
        isNull(emailOtps.consumedAt),
      ),
    )
    .orderBy(sql`${emailOtps.createdAt} desc`)
    .limit(1);

  if (!row) {
    throw new ApiError(410, "That request has expired. Please start again.", "otp_gone");
  }

  const since = (Date.now() - row.lastSentAt.getTime()) / 1000;
  if (since < OTP_RESEND_COOLDOWN_SECONDS) {
    const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - since);
    throw new ApiError(429, `Hang on ${wait} more second${wait === 1 ? "" : "s"} before asking for another code.`, "otp_cooldown");
  }

  if (row.sends >= OTP_MAX_SENDS) {
    throw new ApiError(
      429,
      "We've sent that address several codes already. Check your spam folder, or start again in a little while.",
      "otp_send_cap",
    );
  }

  const code = makeOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  await db
    .update(emailOtps)
    .set({
      codeHash: hashOtp(email, opts.purpose, code),
      expiresAt,
      lastSentAt: new Date(),
      sends: row.sends + 1,
      /* A fresh code deserves a fresh budget of guesses — otherwise someone
         who fat-fingered the last one is locked out of the new one too. */
      attempts: 0,
    })
    .where(eq(emailOtps.id, row.id));

  return {
    code,
    otpId: row.id,
    expiresAt,
    resendAfter: OTP_RESEND_COOLDOWN_SECONDS,
    payload: row.payload,
    requestId: row.requestId,
    userId: row.userId,
  };
}

export type ConsumedOtp = {
  id: string;
  email: string;
  payload: Record<string, unknown> | null;
  requestId: string | null;
  userId: string | null;
};

/** Checks a code and, on success, burns it. Throws an ApiError the client can
    show verbatim on every failure path. */
export async function consumeOtp(opts: {
  email: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<ConsumedOtp> {
  const email = opts.email.toLowerCase().trim();
  const code = opts.code.replace(/\D/g, "");

  if (code.length !== 6) {
    throw new ApiError(400, "Enter the six-digit code from the email.", "otp_malformed");
  }

  const [row] = await db
    .select()
    .from(emailOtps)
    .where(
      and(
        eq(sql`lower(${emailOtps.email})`, email),
        eq(emailOtps.purpose, opts.purpose),
        isNull(emailOtps.consumedAt),
      ),
    )
    .orderBy(sql`${emailOtps.createdAt} desc`)
    .limit(1);

  if (!row) {
    throw new ApiError(410, "That code has expired or was already used. Ask for a new one.", "otp_gone");
  }

  if (row.expiresAt.getTime() < Date.now()) {
    throw new ApiError(410, "That code has expired. Ask for a new one.", "otp_expired");
  }

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(429, "Too many wrong codes. Ask for a new one.", "otp_locked");
  }

  if (!sameHash(row.codeHash, hashOtp(email, opts.purpose, code))) {
    /* Count the miss before telling them, so a client that ignores the
       response still burns an attempt. */
    const [after] = await db
      .update(emailOtps)
      .set({ attempts: row.attempts + 1 })
      .where(eq(emailOtps.id, row.id))
      .returning({ attempts: emailOtps.attempts });

    const left = Math.max(0, OTP_MAX_ATTEMPTS - (after?.attempts ?? row.attempts + 1));
    throw new ApiError(
      400,
      left > 0
        ? `That code isn't right. ${left} attempt${left === 1 ? "" : "s"} left.`
        : "That code isn't right, and that was the last attempt. Ask for a new one.",
      "otp_wrong",
    );
  }

  /* Burn it conditionally: `consumed_at is null` in the WHERE means two
     simultaneous correct submissions cannot both win, so a double-clicked
     button cannot create two accounts. */
  const [burned] = await db
    .update(emailOtps)
    .set({ consumedAt: new Date() })
    .where(and(eq(emailOtps.id, row.id), isNull(emailOtps.consumedAt)))
    .returning({ id: emailOtps.id });

  if (!burned) {
    throw new ApiError(409, "That code was just used. Try signing in.", "otp_raced");
  }

  return {
    id: row.id,
    email: row.email,
    payload: row.payload,
    requestId: row.requestId,
    userId: row.userId,
  };
}

/** Housekeeping for the cron route — consumed and long-expired rows are dead
    weight, and a signup payload should not sit in the table forever. */
export async function pruneOtps() {
  await db.execute(
    sql`DELETE FROM email_otps WHERE expires_at < now() - interval '1 day' OR consumed_at < now() - interval '1 day'`,
  );
}
