import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { apiUser, handler } from "@/lib/guard";

const trimmedOptional = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : null));

const schema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(120),
  phone: trimmedOptional(40),
  company: trimmedOptional(160),
  gstin: z
    .string()
    .trim()
    .max(15)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null))
    .refine(
      (v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v),
      "That doesn't look like a valid GSTIN",
    ),
  addressLine: trimmedOptional(300),
  city: trimmedOptional(80),
  state: trimmedOptional(80),
  pincode: z
    .string()
    .trim()
    .max(6)
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || /^[1-9][0-9]{5}$/.test(v), "That PIN code isn't valid"),
  locale: z.enum(["en", "hi"]).default("en"),
  notifyEmail: z.boolean().default(true),
  marketingOptIn: z.boolean().default(false),
});

export const PATCH = handler(async (req: Request) => {
  const me = await apiUser();
  const input = schema.parse(await req.json());

  await db.update(users).set(input).where(eq(users.id, me.id));
  return Response.json({ ok: true });
});
