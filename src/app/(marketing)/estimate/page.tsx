import type { Metadata } from "next";
import Link from "next/link";
import { materialAvailability } from "@/lib/queries";
import Estimator from "./Estimator";

export const metadata: Metadata = {
  title: "Instant print estimate",
  description:
    "Drop in an STL and get an indicative 3D-printing price and lead time in seconds — material, layer height, infill and quantity, priced the way we price it.",
  alternates: { canonical: "/estimate/" },
  openGraph: { title: "Instant print estimate — Akara Labs", url: "/estimate/" },
};

export const dynamic = "force-dynamic";

export default async function EstimatePage() {
  // Live spool stock, so the estimator only offers what we can actually print.
  const stock = await materialAvailability();

  return (
    <main>
      <section className="wrap" style={{ padding: "clamp(44px, 6vw, 80px) 0 24px", maxWidth: 900 }}>
        <p className="kicker">Instant estimate</p>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(30px, 4.4vw, 46px)",
            fontWeight: 460,
            margin: "0 0 16px",
            lineHeight: 1.12,
          }}
        >
          Drop in a model.{" "}
          <span style={{ color: "var(--ink-faint)" }}>Get a number.</span>
        </h1>
        <p className="lead" style={{ maxWidth: "60ch" }}>
          Your file is read in your browser — nothing is uploaded until you decide to send it. The
          figure is indicative: a real quote comes from us after we&apos;ve looked at the geometry.
        </p>
      </section>

      <section className="wrap" style={{ paddingTop: 0, paddingBottom: 90, maxWidth: 900 }}>
        <Estimator stock={stock} />

        <div className="panel" style={{ marginTop: 20 }}>
          <div className="panel-head">
            <div>
              <h3>How this number is worked out</h3>
              <p className="ph-sub">No black box — here&apos;s the whole method.</p>
            </div>
          </div>
          <ul style={{ fontSize: 14.5, lineHeight: 1.75, color: "var(--ink-soft)", margin: 0, paddingLeft: 20 }}>
            <li>
              We read the mesh volume and surface area straight from your STL, then take walls at
              about 1.2&nbsp;mm plus your infill share of the remaining solid.
            </li>
            <li>
              That gives grams, which we price at the material&apos;s per-gram rate. Machine time
              comes from extruded volume at a nominal flow rate, adjusted for layer height.
            </li>
            <li>
              A flat setup charge covers slicing, plate prep and part removal — which is why one
              copy costs more per part than ten.
            </li>
            <li>
              Supports, tricky geometry, post-processing and finishing aren&apos;t in here. Those are
              exactly the things we look at before quoting properly.
            </li>
          </ul>
          <p style={{ fontSize: 14, color: "var(--ink-faint)", marginBottom: 0, marginTop: 16 }}>
            Prefer we just tell you? <Link href="/print/" style={{ color: "var(--terra-deep)" }}>Send the model</Link>{" "}
            and you&apos;ll have a real quote within 12 working hours.
          </p>
        </div>
      </section>
    </main>
  );
}
