import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requests, requestEvents, files as filesTable, users } from "@/db/schema";
import { handler, ApiError } from "@/lib/guard";
import { limit, clientIp } from "@/lib/ratelimit";
import { makeReference, makeTrackingToken } from "@/lib/ids";
import { auth } from "@/auth";
import * as storage from "@/lib/storage";
import { SITE } from "@/lib/site";
import { parseStl } from "@/lib/stl";
import { sendIntakeEmails } from "@/lib/intake-notify";
import { issueOtp, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/otp";
import { sendOtpMail } from "@/lib/otp-mail";

/* Public endpoint behind the /start and /print wizards. Replaces the
   Web3Forms hop: the enquiry becomes a tracked row, the files land on our
   own disk (no 5 MB email cap), and the customer gets a reference they can
   follow — signed in or not. */

export const runtime = "nodejs";
export const maxDuration = 120;

const fieldsSchema = z.record(z.string(), z.string()).default({});

const payloadSchema = z.object({
  form: z.enum(["project", "print"]),
  fields: fieldsSchema,
  utm: z.record(z.string(), z.string()).optional(),
});

/** Maps the wizard's human-labelled fields onto our columns. Anything not
    named here still survives verbatim in requests.spec. */
const CONTACT_KEYS = {
  name: ["Name"],
  email: ["Email"],
  phone: ["Phone", "WhatsApp"],
  company: ["Company"],
} as const;

function pick(fields: Record<string, string>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = fields[k];
    if (v && v !== "—" && v.trim()) return v.trim();
  }
  return undefined;
}

/** The print form has no title field, so we make a short one — the first
    clause of the description, not the whole paragraph, which reads badly as a
    page heading. The full text is kept in `brief`. */
function printTitle(fields: Record<string, string>): string {
  const desc = (fields["Description"] || "").trim();
  if (!desc) return "3D-print request";

  const firstClause = desc.split(/[.\n;]/)[0].trim();
  const short = firstClause.length >= 8 && firstClause.length <= 70 ? firstClause : desc;
  if (short.length <= 70) return short;

  const cut = short.slice(0, 70);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 30 ? cut.slice(0, lastSpace) : cut) + "…";
}

export const POST = handler(async (req: Request) => {
  const ip = clientIp(req);
  await limit({
    key: `intake:${ip}`,
    max: 10,
    windowSeconds: 3600,
    message: "That's a lot of enquiries from one place. Message us on WhatsApp and we'll sort it out.",
  });

  const form = await req.formData();

  const rawPayload = form.get("payload");
  if (typeof rawPayload !== "string") throw new ApiError(400, "Malformed submission");
  const payload = payloadSchema.parse(JSON.parse(rawPayload));

  const contactName = pick(payload.fields, CONTACT_KEYS.name);
  const contactEmail = pick(payload.fields, CONTACT_KEYS.email);
  if (!contactName) throw new ApiError(400, "Please tell us your name.");
  if (!contactEmail || !z.string().email().safeParse(contactEmail).success) {
    throw new ApiError(400, "Please give us an email we can reply to.");
  }

  // Honeypot — the wizards leave this empty; bots fill everything.
  if (typeof form.get("_gotcha") === "string" && String(form.get("_gotcha"))) {
    return Response.json({ ok: true, reference: makeReference() });
  }

  const session = await auth();
  let userId = session?.user?.id ?? null;

  /* Signed in AND submitting under their own address: the account already
     proves this inbox, so there is nothing to confirm.

     The address check is not pedantry. The form lets a signed-in user type any
     email — quite reasonably, when they're briefing on behalf of a colleague —
     and a session proves the *account's* address, not whichever one they
     happened to type. Without this comparison, being signed in would be a way
     to make us email anyone. */
  const preVerified =
    !!session?.user?.id &&
    (session.user.email || "").toLowerCase() === contactEmail.toLowerCase();

  // Not signed in? If this email already has an account, attach it anyway so
  // the request shows up next time they log in.
  if (!userId) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, contactEmail.toLowerCase()))
      .limit(1);
    userId = existing?.id ?? null;
  }

  const isPrint = payload.form === "print";
  const title = isPrint
    ? printTitle(payload.fields)
    : payload.fields["Project name"] || payload.fields["Service"] || "New project";

  // Reference: honour the wizard's if it's well-formed and unused, else mint one.
  let reference = (payload.fields["Reference"] || "").trim().toUpperCase();
  if (!/^AKR-\d{6}$/.test(reference)) reference = makeReference();
  for (let attempt = 0; attempt < 6; attempt++) {
    const [clash] = await db
      .select({ id: requests.id })
      .from(requests)
      .where(eq(requests.reference, reference))
      .limit(1);
    if (!clash) break;
    reference = makeReference();
  }

  const trackingToken = makeTrackingToken();

  const [row] = await db
    .insert(requests)
    .values({
      reference,
      trackingToken,
      kind: isPrint ? "print" : "project",
      stage: "received",
      userId,
      contactName,
      contactEmail: contactEmail.toLowerCase(),
      contactPhone: pick(payload.fields, CONTACT_KEYS.phone) ?? null,
      contactCompany: pick(payload.fields, CONTACT_KEYS.company) ?? null,
      emailVerifiedAt: preVerified ? new Date() : null,
      title,
      brief: payload.fields["Brief"] || payload.fields["Description"] || null,
      quantity: payload.fields["Quantity"] || null,
      timelineWanted: payload.fields["Timeline"] || payload.fields["Needed by"] || null,
      spec: payload.fields,
      utm: payload.utm,
      source: "website",
    })
    .returning();

  await db.insert(requestEvents).values({
    requestId: row.id,
    stage: "received",
    kind: "stage",
    title: "Request received",
    note: isPrint
      ? "Your print request is queued for review. We'll check the model and get a price to you."
      : "We've got your brief. We read every enquiry by hand and come back with questions or a quote.",
    isPublic: true,
  });

  /* ---- Attachments ---------------------------------------------------- */

  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  const stored: { name: string; size: number }[] = [];
  const rejected: string[] = [];

  const totalBytes = uploads.reduce((sum, f) => sum + (f.size || 0), 0);
  if (totalBytes > storage.MAX_TOTAL_UPLOAD_BYTES) {
    throw new ApiError(
      413,
      `Those files come to ${storage.humanSize(totalBytes)} together, and we can accept ${storage.humanSize(
        storage.MAX_TOTAL_UPLOAD_BYTES,
      )} in one go. Send the largest separately, or share a link and we'll pull them down.`,
    );
  }

  for (const file of uploads.slice(0, storage.MAX_FILES_PER_UPLOAD)) {
    if (!storage.isAllowed(file.name)) {
      rejected.push(`${file.name} (unsupported type)`);
      continue;
    }
    if (file.size > storage.MAX_FILE_BYTES) {
      rejected.push(`${file.name} (over ${storage.humanSize(storage.MAX_FILE_BYTES)})`);
      continue;
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const key = storage.makeKey(`requests/${row.id}`, file.name);
    const { checksum, bytes } = await storage.put(key, buf);

    // Read geometry out of STLs so the studio sees size/volume immediately.
    const meta = storage.extOf(file.name) === ".stl" ? parseStl(buf) : null;

    await db.insert(filesTable).values({
      requestId: row.id,
      userId,
      filename: storage.safeName(file.name),
      mimeType: storage.guessMime(file.name, file.type),
      sizeBytes: bytes,
      storageKey: key,
      checksum,
      uploadedBy: "customer",
      inLibrary: !!userId,
      meta: meta ?? undefined,
    });

    stored.push({ name: file.name, size: bytes });
  }

  if (stored.length) {
    await db.insert(requestEvents).values({
      requestId: row.id,
      kind: "file",
      title: `${stored.length} file${stored.length > 1 ? "s" : ""} received`,
      note: stored.map((f) => f.name).join(", "),
      isPublic: true,
    });
  }

  /* ---- Email, or ask them to prove the address first -------------------- */

  const trackHref = `${SITE.url}/track/${reference}?t=${trackingToken}`;

  if (preVerified) {
    /* Signed in, so the address was proven when they made the account. Nothing
       to confirm; both emails go straight out. */
    await sendIntakeEmails(row.id, { rejected });

    return Response.json({
      ok: true,
      reference,
      trackingUrl: trackHref,
      filesStored: stored.length,
      filesRejected: rejected,
      hasAccount: !!userId,
      verification: "not_required",
    });
  }

  /* A guest. The request is already saved — losing a real enquiry because
     someone closed the tab before checking their email would be far worse than
     carrying an unconfirmed row — but nothing else happens yet.

     Specifically: no receipt, no studio ping, and the tracking link is withheld
     from the response. Anyone can type a stranger's address into a public form;
     until a code comes back, sending that stranger mail (or paging the studio
     about them) is something an attacker chose, not something the owner of the
     inbox did. */
  const { code, expiresAt } = await issueOtp({
    email: contactEmail.toLowerCase(),
    purpose: "intake",
    requestId: row.id,
  });

  await sendOtpMail({
    to: contactEmail,
    purpose: "intake",
    code,
    name: contactName,
  });

  return Response.json({
    ok: true,
    reference,
    filesStored: stored.length,
    filesRejected: rejected,
    hasAccount: !!userId,
    verification: "required",
    email: contactEmail,
    expiresAt: expiresAt.toISOString(),
    resendAfter: OTP_RESEND_COOLDOWN_SECONDS,
  });
});

export const GET = handler(async () => {
  throw new ApiError(405, "Use POST");
});
