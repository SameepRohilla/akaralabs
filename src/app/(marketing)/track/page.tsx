import type { Metadata } from "next";
import Link from "next/link";
import TrackLookup from "./TrackLookup";

export const metadata: Metadata = {
  title: "Track a request",
  description:
    "Check where your Akara Labs project or 3D-print request has got to. Enter your reference and the email you enquired with — no account needed.",
  alternates: { canonical: "/track/" },
};

export default function TrackPage() {
  return (
    <main>
      <section className="wrap" style={{ padding: "clamp(48px, 7vw, 96px) 0 80px", maxWidth: 620 }}>
        <p className="kicker">Order tracking</p>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(30px, 4.4vw, 46px)", fontWeight: 460, margin: "0 0 14px", lineHeight: 1.12 }}>
          Where is it?
        </h1>
        <p className="lead" style={{ marginBottom: 34 }}>
          Enter the reference from your confirmation email and the address you enquired with.
          We&apos;ll email you a link straight to the live status.
        </p>

        <div className="panel">
          <TrackLookup />
        </div>

        <p style={{ marginTop: 26, fontSize: 14.5, color: "var(--ink-faint)", lineHeight: 1.65 }}>
          Have an account? <Link href="/signin" style={{ color: "var(--terra-deep)" }}>Sign in</Link>{" "}
          and every request sits in one dashboard, with quotes, files and a message thread per job.
        </p>
      </section>
    </main>
  );
}
