"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";

type Item = {
  id: string;
  description: string;
  detail: string | null;
  quantity: string;
  unit: string;
  unitPricePaise: number;
  amountPaise: number;
};

type Quote = {
  id: string;
  number: string;
  status: string;
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  taxRate: string;
  taxPaise: number;
  totalPaise: number;
  leadTimeDays: number | null;
  notes: string | null;
  terms: string | null;
  validUntil: Date | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  items: Item[];
};

export default function QuotePanel({
  quote,
  reference,
  canDecide,
  expired,
  trackingToken,
}: {
  quote: Quote;
  reference: string;
  canDecide: boolean;
  /** Decided on the server. Reading the clock during render is impure and
      would make the rendered output depend on when React happened to run. */
  expired: boolean;
  trackingToken?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [note, setNote] = useState("");

  const decided = quote.status === "accepted" || quote.status === "rejected";

  async function decide(decision: "accept" | "reject") {
    setBusy(decision);
    setError(null);

    const res = await fetch(`/api/requests/${reference}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteId: quote.id,
        decision,
        note: note.trim() || undefined,
        trackingToken,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error || "We couldn't record that. Try again in a moment.");
      setBusy(null);
      return;
    }
    router.refresh();
  }

  return (
    <div
      className="panel"
      style={{
        borderColor: decided
          ? undefined
          : "color-mix(in srgb, var(--terra) 45%, transparent)",
      }}
    >
      <div className="panel-head">
        <div>
          <h3>
            {quote.status === "accepted"
              ? "Quote accepted"
              : quote.status === "rejected"
                ? "Quote declined"
                : "Your quote"}
          </h3>
          <p className="ph-sub">
            {quote.number}
            {quote.validUntil ? ` · valid until ${formatDate(quote.validUntil)}` : ""}
            {quote.decidedAt ? ` · ${formatDate(quote.decidedAt)}` : ""}
          </p>
        </div>
        {quote.leadTimeDays ? (
          <span className="pill">{quote.leadTimeDays} working days</span>
        ) : null}
      </div>

      <div className="tbl-wrap">
        <table className="quote-tbl">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Qty</th>
              <th className="num">Rate</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((it) => (
              <tr key={it.id}>
                <td>
                  {it.description}
                  {it.detail ? (
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-faint)", marginTop: 3 }}>
                      {it.detail}
                    </span>
                  ) : null}
                </td>
                <td className="num">
                  {Number(it.quantity)} {it.unit}
                </td>
                <td className="num">{formatINR(it.unitPricePaise)}</td>
                <td className="num">{formatINR(it.amountPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, fontSize: 14, color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
        <div className="row-between" style={{ padding: "3px 0" }}>
          <span>Subtotal</span>
          <span>{formatINR(quote.subtotalPaise)}</span>
        </div>
        {quote.discountPaise > 0 ? (
          <div className="row-between" style={{ padding: "3px 0" }}>
            <span>Discount</span>
            <span>−{formatINR(quote.discountPaise)}</span>
          </div>
        ) : null}
        {quote.shippingPaise > 0 ? (
          <div className="row-between" style={{ padding: "3px 0" }}>
            <span>Shipping</span>
            <span>{formatINR(quote.shippingPaise)}</span>
          </div>
        ) : null}
        <div className="row-between" style={{ padding: "3px 0" }}>
          <span>GST @ {Number(quote.taxRate)}%</span>
          <span>{formatINR(quote.taxPaise)}</span>
        </div>
      </div>

      <div className="quote-total">
        <span className="qt-label">Total</span>
        <span className="qt-value">{formatINR(quote.totalPaise, true)}</span>
      </div>

      {quote.notes ? (
        <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--ink-soft)", marginTop: 18, whiteSpace: "pre-wrap" }}>
          {quote.notes}
        </p>
      ) : null}

      {quote.decisionNote ? (
        <div className="notice" style={{ marginTop: 16 }}>
          <strong style={{ color: "var(--ink)" }}>Your note:</strong> {quote.decisionNote}
        </div>
      ) : null}

      {error ? (
        <div className="notice notice-err" style={{ marginTop: 16 }}>
          {error}
        </div>
      ) : null}

      {canDecide && !decided ? (
        expired ? (
          <div className="notice notice-info" style={{ marginTop: 18 }}>
            This quote has passed its validity date. Send us a message and we&apos;ll refresh it —
            prices usually hold.
          </div>
        ) : (
          <>
            {showReject ? (
              <div style={{ marginTop: 18 }}>
                <label className="field" style={{ marginBottom: 12 }}>
                  <span className="lbl">What would you like changed?</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Too high for this batch size / can we try PETG instead / timeline is too long…"
                    style={{ minHeight: 90 }}
                  />
                  <span className="hint">
                    We&apos;ll come back with a revised quote — this doesn&apos;t close the job.
                  </span>
                </label>
                <div className="row">
                  <button className="btn btn-ghost" disabled={busy !== null} onClick={() => decide("reject")}>
                    {busy === "reject" ? "Sending…" : "Send this back"}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowReject(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="row" style={{ marginTop: 20 }}>
                <button className="btn btn-primary" disabled={busy !== null} onClick={() => decide("accept")}>
                  {busy === "accept" ? "Approving…" : "Approve this quote →"}
                </button>
                <button className="btn btn-ghost" onClick={() => setShowReject(true)}>
                  Ask for changes
                </button>
              </div>
            )}
            <p style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 14, marginBottom: 0 }}>
              Approving schedules the work and confirms the price. Nothing is charged here —
              we invoice separately.
            </p>
          </>
        )
      ) : null}
    </div>
  );
}
