import { sendMail, shell, codeBlock, esc } from "./mail";
import { OTP_TTL_SECONDS, type OtpPurpose } from "./otp";

/* One place that decides what a code email says, so the three flows that send
   one cannot drift apart in wording — or, worse, in what they promise. */

const COPY: Record<OtpPurpose, { subject: string; heading: string; why: string }> = {
  signup: {
    subject: "Your Akara Labs code",
    heading: "Confirm your email to finish.",
    why: "Enter this code on the signup page and your account is ready. We'll only create it once the code checks out.",
  },
  intake: {
    subject: "Confirm your request — Akara Labs",
    heading: "One code and we're on it.",
    why: "Enter this code on the page you just submitted from. It confirms we're replying to the right inbox — until then we hold off on sending you anything else.",
  },
  verify_account: {
    subject: "Your Akara Labs code",
    heading: "Confirm your email.",
    why: "Enter this code in your dashboard so we can send you quote and progress updates for your projects.",
  },
};

export async function sendOtpMail(opts: {
  to: string;
  purpose: OtpPurpose;
  code: string;
  name?: string | null;
}) {
  const copy = COPY[opts.purpose];
  const first = (opts.name || "").trim().split(" ")[0];
  const minutes = Math.round(OTP_TTL_SECONDS / 60);

  return sendMail({
    to: opts.to,
    subject: copy.subject,
    html: shell({
      heading: copy.heading,
      body:
        `<p>${first ? `Hello ${esc(first)},` : "Hello,"}</p>` +
        `<p>${esc(copy.why)}</p>` +
        codeBlock(opts.code),
      footNote: `This code works for ${minutes} minutes and only once. If you didn't ask for it, ignore this email — nothing has been created.`,
    }),
    /* The code in the plaintext part too: some clients show only that, and a
       code the reader cannot see is a support ticket. */
    text: `${copy.heading}\n\n${copy.why}\n\nYour code: ${opts.code}\n\nIt works for ${minutes} minutes and only once. If you didn't ask for it, ignore this email.`,
  });
}
