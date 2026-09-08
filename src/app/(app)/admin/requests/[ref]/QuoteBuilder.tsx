"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveQuote } from "@/lib/actions/admin";
import { quoteTotals, formatINR, paise } from "@/lib/money";
import { formatDate } from "@/lib/dates";

type Line = {
  description: string;
  detail: string;
  quantity: number;
  unit: string;
  unitPriceRupees: number;
};

type ExistingQuote = {
  id: string;
  number: string;
  status: string;
  totalPaise: number;
  leadTimeDays: number | null;
  sentAt: Date | null;
  decidedAt: Date | null;
  decisionNote: string | null;
};

const STATUS_PILL: Record<string, string> = {
  draft: "pill",
  sent: "pill pill-quoted",
  accepted: "pill pill-done",
  rejected: "pill pill-hold",
  superseded: "pill",
  expired: "pill pill-hold",
};

export default function QuoteBuilder({
  requestId,
  existingQuotes,
  seed,
}: {
  requestId: string;
  existingQuotes: ExistingQuote[];
  /** Pre-priced from the STL geometry, when there is one. */
  seed: { description: string; detail?: string; quantity: number; unitPriceRupees: number } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(existingQuotes.length === 0);
  const [error, setError] = useState<string | null>(null);

  const [lines, setLines] = useState<Line[]>([
    seed
      ? {
          description: seed.description,
          detail: seed.detail ?? "",
          quantity: seed.quantity,
          unit: "nos",
          unitPriceRupees: seed.unitPriceRupees,
        }
      : { description: "", detail: "", quantity: 1, unit: "nos", unitPriceRupees: 0 },
  ]);
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [taxRate, setTaxRate] = useState(18);
  const [leadTime, setLeadTime] = useState(7);
  const [validDays, setValidDays] = useState(14);
  const [notes, setNotes] = useState("");

  const totals = useMemo(
    () =>
      quoteTotals({
        items: lines.map((l) => ({ quantity: l.quantity, unitPricePaise: paise(l.unitPriceRupees) })),
        discountPaise: paise(discount),
        shippingPaise: paise(shipping),
        taxRate,
      }),
    [lines, discount, shipping, taxRate],
  );

  function update(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function submit(send: boolean) {
    setError(null);
    const usable = lines.filter((l) => l.description.trim());
    if (!usable.length) {
      setError("Add at least one line with a description.");
      return;
    }

    startTransition(async () => {
      const res = await saveQuote({
        requestId,
        items: usable.map((l) => ({
          description: l.description.trim(),
          detail: l.detail.trim() || undefined,
          quantity: l.quantity,
          unit: l.unit,
          unitPriceRupees: l.unitPriceRupees,
        })),
        discountRupees: discount,
        shippingRupees: shipping,
        taxRate,
        leadTimeDays: leadTime,
        notes: notes.trim() || undefined,
        validDays,
        send,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Quote</h3>
          <p className="ph-sub">
            {existingQuotes.length
              ? `${existingQuotes.length} version${existingQuotes.length === 1 ? "" : "s"} — sending a new one supersedes the last.`
              : "Nothing quoted yet."}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide builder" : existingQuotes.length ? "Re-quote" : "Build a quote"}
        </button>
      </div>

      {existingQuotes.length ? (
        <ul className="filelist" style={{ marginBottom: open ? 20 : 0 }}>
          {existingQuotes.map((q) => (
            <li key={q.id} className="filerow" style={{ flexWrap: "wrap" }}>
              <span className="fr-ext">{q.number.split("-").pop()}</span>
              <span className="fr-name" style={{ whiteSpace: "normal" }}>
                {formatINR(q.totalPaise)}
                {q.leadTimeDays ? ` · ${q.leadTimeDays} days` : ""}
                <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-faint)" }}>
                  {q.sentAt ? `sent ${formatDate(q.sentAt)}` : "not sent"}
                  {q.decidedAt ? ` · decided ${formatDate(q.decidedAt)}` : ""}
                </span>
                {q.decisionNote ? (
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>
                    “{q.decisionNote}”
                  </span>
                ) : null}
              </span>
              <span className={STATUS_PILL[q.status] ?? "pill"}>{q.status}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {!open ? null : (
        <>
          {seed && lines[0]?.unitPriceRupees === seed.unitPriceRupees ? (
            <div className="notice notice-info" style={{ marginBottom: 16, fontSize: 13.5 }}>
              Pre-filled from the model geometry. Check it against reality before sending —
              supports and finishing aren&apos;t in that figure.
            </div>
          ) : null}

          {error ? (
            <div className="notice notice-err" style={{ marginBottom: 16 }}>
              {error}
            </div>
          ) : null}

          <div className="stack-sm" style={{ marginBottom: 16 }}>
            {lines.map((l, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: 14,
                  background: "var(--paper)",
                }}
              >
                <div className="row-between" style={{ marginBottom: 10 }}>
                  <span className="art-meta">Line {i + 1}</span>
                  {lines.length > 1 ? (
                    <button
                      className="btn btn-ghost btn-sm btn-danger"
                      onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <label className="field" style={{ marginBottom: 10 }}>
                  <span className="lbl">Description</span>
                  <input
                    value={l.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                    placeholder="3D printing — drone arm bracket"
                  />
                </label>

                <label className="field" style={{ marginBottom: 10 }}>
                  <span className="lbl">Detail (optional)</span>
                  <input
                    value={l.detail}
                    onChange={(e) => update(i, { detail: e.target.value })}
                    placeholder="CF-Nylon, 0.2 mm, 40% infill, sanded"
                  />
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr auto", gap: 10, alignItems: "end" }}>
                  <label className="field" style={{ marginBottom: 0 }}>
                    <span className="lbl">Qty</span>
                    <input
                      type="number"
                      min={0.001}
                      step="any"
                      value={l.quantity}
                      onChange={(e) => update(i, { quantity: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <label className="field" style={{ marginBottom: 0 }}>
                    <span className="lbl">Unit</span>
                    <input value={l.unit} onChange={(e) => update(i, { unit: e.target.value })} />
                  </label>
                  <label className="field" style={{ marginBottom: 0 }}>
                    <span className="lbl">Rate ₹</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={l.unitPriceRupees}
                      onChange={(e) => update(i, { unitPriceRupees: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 14,
                      color: "var(--terra-deep)",
                      paddingBottom: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatINR(totals.amounts[i] ?? 0)}
                  </span>
                </div>
              </div>
            ))}

            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setLines((p) => [...p, { description: "", detail: "", quantity: 1, unit: "nos", unitPriceRupees: 0 }])
              }
            >
              + Add a line
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
            <label className="field">
              <span className="lbl">Discount ₹</span>
              <input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
            </label>
            <label className="field">
              <span className="lbl">Shipping ₹</span>
              <input type="number" min={0} value={shipping} onChange={(e) => setShipping(Number(e.target.value) || 0)} />
            </label>
            <label className="field">
              <span className="lbl">GST %</span>
              <input type="number" min={0} max={50} step="0.01" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value) || 0)} />
            </label>
            <label className="field">
              <span className="lbl">Lead days</span>
              <input type="number" min={0} max={365} value={leadTime} onChange={(e) => setLeadTime(Number(e.target.value) || 0)} />
            </label>
            <label className="field">
              <span className="lbl">Valid days</span>
              <input type="number" min={1} max={365} value={validDays} onChange={(e) => setValidDays(Number(e.target.value) || 14)} />
            </label>
          </div>

          <label className="field">
            <span className="lbl">Notes on the quote</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Price holds for this batch size. Includes light sanding; painting quoted separately."
              style={{ minHeight: 80 }}
            />
          </label>

          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13.5,
              color: "var(--ink-faint)",
              borderTop: "1px solid var(--line)",
              paddingTop: 14,
            }}
          >
            <div className="row-between" style={{ padding: "2px 0" }}>
              <span>Subtotal</span>
              <span>{formatINR(totals.subtotalPaise)}</span>
            </div>
            {totals.discountPaise ? (
              <div className="row-between" style={{ padding: "2px 0" }}>
                <span>Discount</span>
                <span>−{formatINR(totals.discountPaise)}</span>
              </div>
            ) : null}
            {totals.shippingPaise ? (
              <div className="row-between" style={{ padding: "2px 0" }}>
                <span>Shipping</span>
                <span>{formatINR(totals.shippingPaise)}</span>
              </div>
            ) : null}
            <div className="row-between" style={{ padding: "2px 0" }}>
              <span>GST @ {taxRate}%</span>
              <span>{formatINR(totals.taxPaise)}</span>
            </div>
          </div>

          <div className="quote-total">
            <span className="qt-label">Total</span>
            <span className="qt-value">{formatINR(totals.totalPaise, true)}</span>
          </div>

          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn btn-primary" disabled={pending} onClick={() => submit(true)}>
              {pending ? "Sending…" : "Send to the customer →"}
            </button>
            <button className="btn btn-ghost" disabled={pending} onClick={() => submit(false)}>
              Save as draft
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 12, marginBottom: 0 }}>
            Sending emails the customer, moves the request to Quoted, and gives them approve /
            ask-for-changes buttons.
          </p>
        </>
      )}
    </div>
  );
}
