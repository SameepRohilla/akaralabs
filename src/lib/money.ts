/** Everything monetary is stored as integer paise. No floats in the DB. */

export function paise(rupees: number | string): number {
  const n = typeof rupees === "string" ? Number(rupees.replace(/[^\d.-]/g, "")) : rupees;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function rupees(p: number | null | undefined): number {
  return (p ?? 0) / 100;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});

export function formatINR(p: number | null | undefined, precise = false): string {
  const v = rupees(p);
  return precise || v % 1 !== 0 ? inrPrecise.format(v) : inr.format(v);
}

/** Recomputes a quote's derived totals from its line items. */
export function quoteTotals(input: {
  items: { quantity: number | string; unitPricePaise: number }[];
  discountPaise?: number;
  shippingPaise?: number;
  taxRate?: number | string;
}) {
  const items = input.items.map((it) => {
    const qty = typeof it.quantity === "string" ? Number(it.quantity) : it.quantity;
    return Math.round((Number.isFinite(qty) ? qty : 0) * it.unitPricePaise);
  });
  const subtotalPaise = items.reduce((a, b) => a + b, 0);
  const discountPaise = Math.max(0, Math.min(input.discountPaise ?? 0, subtotalPaise));
  const shippingPaise = Math.max(0, input.shippingPaise ?? 0);
  const rate = Number(input.taxRate ?? 18) || 0;
  const taxable = subtotalPaise - discountPaise + shippingPaise;
  const taxPaise = Math.round((taxable * rate) / 100);
  return {
    amounts: items,
    subtotalPaise,
    discountPaise,
    shippingPaise,
    taxPaise,
    totalPaise: taxable + taxPaise,
  };
}
