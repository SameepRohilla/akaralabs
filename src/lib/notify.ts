import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users, type RequestStage } from "@/db/schema";
import { sendMail, shell, kvBlock, esc } from "./mail";
import { SITE } from "./site";
import { STAGE_META, stageLabel } from "./stages";

type Kind =
  | "stage_change"
  | "quote_sent"
  | "quote_decision"
  | "message"
  | "file_added"
  | "article_published"
  | "system";

/** Writes an in-app notification and, when the user allows it, emails them.
    Never throws into the caller's transaction — notification failure must not
    roll back the thing that happened. */
export async function notify(opts: {
  userId?: string | null;
  /** Used when the request has no account attached yet (guest enquiry). */
  fallbackEmail?: string | null;
  kind: Kind;
  title: string;
  body?: string;
  href?: string;
  requestId?: string;
  email?: { subject: string; html: string } | false;
}): Promise<void> {
  try {
    let to: string | null = opts.fallbackEmail ?? null;
    let allowEmail = true;

    let notificationId: string | null = null;

    if (opts.userId) {
      const [row] = await db
        .insert(notifications)
        .values({
          userId: opts.userId,
          kind: opts.kind,
          title: opts.title,
          body: opts.body,
          href: opts.href,
          requestId: opts.requestId,
        })
        .returning({ id: notifications.id });
      notificationId = row?.id ?? null;

      const [u] = await db.select().from(users).where(eq(users.id, opts.userId)).limit(1);
      if (u) {
        to = u.email;
        allowEmail = u.notifyEmail;
      }
    }

    if (opts.email === false || !to || !allowEmail) return;

    const mail =
      opts.email ??
      {
        subject: opts.title,
        html: shell({
          heading: opts.title,
          body: `<p>${esc(opts.body || "")}</p>`,
          cta: opts.href ? { label: "Open in your dashboard", href: absolute(opts.href) } : undefined,
          footNote: "You're getting this because you have an Akara Labs account. Turn these off in Settings.",
        }),
      };

    const result = await sendMail({ to, subject: mail.subject, html: mail.html });
    if (result.sent && notificationId) {
      await db
        .update(notifications)
        .set({ emailedAt: new Date() })
        .where(eq(notifications.id, notificationId));
    }
  } catch (err) {
    console.error("[notify] failed:", err);
  }
}

export function absolute(href: string): string {
  return href.startsWith("http") ? href : `${SITE.url}${href.startsWith("/") ? "" : "/"}${href}`;
}

/* ---------- Specific notifications ------------------------------------- */

export async function notifyStageChange(req: {
  id: string;
  reference: string;
  userId: string | null;
  contactEmail: string;
  contactName: string;
  kind: "project" | "print";
  title: string | null;
  trackingToken: string;
}, stage: RequestStage, note?: string) {
  const label = stageLabel(stage, req.kind);
  const meta = STAGE_META[stage];
  const href = req.userId ? `/dashboard/requests/${req.reference}` : `/track/${req.reference}?t=${req.trackingToken}`;

  await notify({
    userId: req.userId,
    fallbackEmail: req.contactEmail,
    kind: "stage_change",
    title: `${req.reference} — ${label}`,
    body: note || meta.blurb,
    href,
    requestId: req.id,
    email: {
      subject: `${req.reference} is now: ${label}`,
      html: shell({
        heading: `${label}.`,
        body:
          `<p>Hello ${esc(req.contactName.split(" ")[0] || "there")},</p>` +
          `<p>${esc(meta.blurb)}</p>` +
          (note ? `<p style="color:#F4ECDB;border-left:2px solid #F2A33C;padding-left:14px;margin:18px 0;">${esc(note)}</p>` : "") +
          kvBlock([
            ["Reference", esc(req.reference)],
            ["Project", esc(req.title || "—")],
            ["Stage", esc(label)],
          ]),
        cta: { label: "Track this request", href: absolute(href) },
      }),
    },
  });
}

export async function notifyQuoteSent(req: {
  id: string;
  reference: string;
  userId: string | null;
  contactEmail: string;
  contactName: string;
  trackingToken: string;
}, quote: { number: string; totalLabel: string; leadTimeDays: number | null; validUntil: Date | null }) {
  const href = req.userId ? `/dashboard/requests/${req.reference}` : `/track/${req.reference}?t=${req.trackingToken}`;
  await notify({
    userId: req.userId,
    fallbackEmail: req.contactEmail,
    kind: "quote_sent",
    title: `Quote ready — ${quote.totalLabel}`,
    body: `Quote ${quote.number} for ${req.reference} is waiting for your approval.`,
    href,
    requestId: req.id,
    email: {
      subject: `Your quote for ${req.reference} — ${quote.totalLabel}`,
      html: shell({
        heading: "Your quote is ready.",
        body:
          `<p>Hello ${esc(req.contactName.split(" ")[0] || "there")},</p>` +
          `<p>We've priced up ${esc(req.reference)}. Approve it in your dashboard and it goes into the queue straight away — or reply there if you'd like anything changed.</p>` +
          kvBlock([
            ["Quote", esc(quote.number)],
            ["Total", esc(quote.totalLabel)],
            ["Lead time", quote.leadTimeDays ? `${quote.leadTimeDays} working days` : "—"],
            ["Valid until", quote.validUntil ? quote.validUntil.toDateString() : "—"],
          ]),
        cta: { label: "Review the quote", href: absolute(href) },
      }),
    },
  });
}

export async function notifyStudio(subject: string, html: string) {
  const to = process.env.STUDIO_INBOX || SITE.email;
  await sendMail({ to, subject, html });
}

/** Called when a customer replies so the studio hears about it. */
export async function notifyStudioMessage(req: { reference: string; contactName: string }, body: string) {
  await notifyStudio(
    `New message on ${req.reference}`,
    shell({
      heading: `${req.contactName} replied on ${req.reference}`,
      body: `<p style="white-space:pre-wrap;">${esc(body)}</p>`,
      cta: { label: "Open in admin", href: absolute(`/admin/requests/${req.reference}`) },
    }),
  );
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}
