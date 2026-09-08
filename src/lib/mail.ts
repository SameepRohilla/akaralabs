import nodemailer from "nodemailer";
import { SITE } from "./site";

/* Transactional email over plain SMTP — works with Zoho, Google Workspace,
   Amazon SES, Resend's SMTP bridge, or a local Postfix. If SMTP_HOST is
   unset, mail is logged instead of sent so dev never needs a mail server. */

let transport: nodemailer.Transporter | null = null;

function getTransport() {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "1" || Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transport;
}

export type Mail = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  bcc?: string;
};

export async function sendMail(mail: Mail): Promise<{ sent: boolean; error?: string }> {
  const t = getTransport();
  const from = process.env.SMTP_FROM || `Akara Labs <${SITE.email}>`;

  if (!t) {
    console.log(`[mail:dev] to=${mail.to} subject=${mail.subject}`);
    return { sent: false, error: "SMTP not configured" };
  }
  try {
    await t.sendMail({
      from,
      to: mail.to,
      bcc: mail.bcc,
      replyTo: mail.replyTo || SITE.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text || stripTags(mail.html),
    });
    return { sent: true };
  } catch (err) {
    console.error("[mail] send failed:", err);
    return { sent: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

function stripTags(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- Templates -------------------------------------------------- */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One shell for every transactional email — dark, saffron, matches the site. */
export function shell(opts: {
  heading: string;
  body: string;
  cta?: { label: string; href: string };
  footNote?: string;
}) {
  const { heading, body, cta, footNote } = opts;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0C0B09;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0C0B09;padding:34px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#14110C;border:1px solid rgba(244,236,219,.10);border-radius:12px;">
  <tr><td style="padding:26px 30px 0;">
    <div style="font-family:Georgia,serif;font-size:24px;color:#F2A33C;letter-spacing:.02em;">अ&nbsp;<span style="font-size:15px;color:#BFB4A0;letter-spacing:.18em;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">Akara Labs</span></div>
  </td></tr>
  <tr><td style="padding:22px 30px 0;">
    <h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:23px;font-weight:normal;color:#F4ECDB;line-height:1.3;">${esc(heading)}</h1>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#BFB4A0;">${body}</div>
  </td></tr>
  ${
    cta
      ? `<tr><td style="padding:24px 30px 0;">
    <a href="${cta.href}" style="display:inline-block;background:#F2A33C;color:#14110C;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;padding:12px 22px;border-radius:6px;">${esc(cta.label)}</a>
  </td></tr>`
      : ""
  }
  <tr><td style="padding:28px 30px 26px;">
    <div style="border-top:1px solid rgba(244,236,219,.10);padding-top:16px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#877D6A;">
      ${footNote ? esc(footNote) + "<br><br>" : ""}
      Akara Labs · ${SITE.city}<br>
      <a href="${SITE.url}" style="color:#F7B95F;text-decoration:none;">akaralabs.in</a> ·
      <a href="mailto:${SITE.email}" style="color:#F7B95F;text-decoration:none;">${SITE.email}</a>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function kvBlock(rows: [string, string][]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 4px;">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="padding:7px 14px 7px 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#877D6A;vertical-align:top;white-space:nowrap;">${esc(
        k,
      )}</td><td style="padding:7px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#F4ECDB;">${v}</td></tr>`,
  )
  .join("")}
</table>`;
}

export { esc };
