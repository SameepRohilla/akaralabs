import { eq } from "drizzle-orm";
import { db } from "@/db";
import { requests, files as filesTable } from "@/db/schema";
import { sendMail, shell, kvBlock, esc } from "./mail";
import { notifyStudio } from "./notify";
import { SITE } from "./site";
import * as storage from "./storage";

/* The two emails an accepted enquiry produces — the customer's receipt and the
 * studio's heads-up.
 *
 * They live here rather than inline in the intake route because they now fire
 * from two places: immediately, when the submitter was already signed in and
 * the address is therefore proven; and later, when a guest comes back with the
 * code. Keeping one implementation means a guest's receipt is identical to a
 * member's, and that a change to either email cannot land on one path only.
 *
 * Everything is re-read from the database, so the delayed path needs nothing
 * carried across from the original request — which is the point: by then the
 * upload, the form and the browser tab are all long gone.
 */
export async function sendIntakeEmails(
  requestId: string,
  opts: { rejected?: string[] } = {},
): Promise<void> {
  const [row] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!row) return;

  const stored = await db
    .select({
      filename: filesTable.filename,
      sizeBytes: filesTable.sizeBytes,
    })
    .from(filesTable)
    .where(eq(filesTable.requestId, requestId));

  const isPrint = row.kind === "print";
  const rejected = opts.rejected ?? [];
  const trackHref = `${SITE.url}/track/${row.reference}?t=${row.trackingToken}`;

  const spec = (row.spec ?? {}) as Record<string, unknown>;
  const specRows: [string, string][] = Object.entries(spec)
    .filter(([k, v]) => !k.startsWith("_") && k !== "Reference" && typeof v === "string" && v && v !== "—")
    .slice(0, 18)
    .map(([k, v]) => [k, esc(String(v))]);

  const contactName = row.contactName;
  const contactEmail = row.contactEmail;

  await sendMail({
    to: contactEmail,
    subject: `We've got it — ${row.reference}`,
    html: shell({
      heading: isPrint ? "On the queue." : "It's on our bench.",
      body:
        `<p>Hello ${esc(contactName.split(" ")[0])},</p>` +
        `<p>${
          isPrint
            ? "Your print request is in. We'll check the model, confirm material and finish, and send you a price."
            : "Thanks for the brief — a real person is reading it. We usually come back within 12 working hours with a quote or a couple of questions."
        }</p>` +
        kvBlock([
          ["Reference", esc(row.reference)],
          ...specRows.slice(0, 8),
          ...(stored.length
            ? ([["Files", stored.map((f) => esc(f.filename)).join("<br>")]] as [string, string][])
            : []),
        ]) +
        (rejected.length
          ? `<p style="color:#E8B0A8;">We couldn't accept: ${esc(rejected.join(", "))}. Send those over WhatsApp and we'll add them.</p>`
          : "") +
        (row.userId
          ? `<p>Follow it in your dashboard any time.</p>`
          : `<p>Track it with the link below — no account needed. Create one and every request lands in a single dashboard.</p>`),
      cta: {
        label: "Track this request",
        href: row.userId ? `${SITE.url}/dashboard/requests/${row.reference}` : trackHref,
      },
      footNote: `Reply to this email or message ${SITE.email} and it lands on the same thread.`,
    }),
  });

  await notifyStudio(
    `${isPrint ? "Print" : "Project"} enquiry — ${contactName} (${row.reference})`,
    shell({
      heading: `${row.reference} · ${isPrint ? "3D print" : "Project"}`,
      body:
        kvBlock([
          ["Name", esc(contactName)],
          ["Email", esc(contactEmail)],
          ["Phone", esc(row.contactPhone || "—")],
          ["Account", row.userId ? "existing customer" : "new / guest"],
          /* Worth stating plainly: a studio reading this needs to know whether
             the address has been proven before quoting into it. */
          ["Email confirmed", row.emailVerifiedAt ? "yes — code entered" : "not yet"],
          ...specRows,
          [
            "Files",
            stored.length
              ? stored
                  .map((f) => `${esc(f.filename)} (${storage.humanSize(f.sizeBytes)})`)
                  .join("<br>")
              : "none",
          ],
        ]) + (rejected.length ? `<p>Rejected: ${esc(rejected.join(", "))}</p>` : ""),
      cta: { label: "Open in admin", href: `${SITE.url}/admin/requests/${row.reference}` },
    }),
  );
}
