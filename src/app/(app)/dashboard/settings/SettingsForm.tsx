"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Profile = {
  name: string;
  phone: string;
  company: string;
  gstin: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  notifyEmail: boolean;
  marketingOptIn: boolean;
  locale: string;
};

export default function SettingsForm({ user }: { user: Profile }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("busy");
    setError(null);

    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(fd.get("name") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        company: String(fd.get("company") || "").trim(),
        gstin: String(fd.get("gstin") || "").trim(),
        addressLine: String(fd.get("addressLine") || "").trim(),
        city: String(fd.get("city") || "").trim(),
        state: String(fd.get("state") || "").trim(),
        pincode: String(fd.get("pincode") || "").trim(),
        locale: String(fd.get("locale") || "en"),
        notifyEmail: fd.get("notifyEmail") === "on",
        marketingOptIn: fd.get("marketingOptIn") === "on",
      }),
    });

    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      setError(b.error || "Couldn't save that.");
      setState("idle");
      return;
    }

    setState("saved");
    router.refresh();
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error ? <div className="notice notice-err" style={{ marginBottom: 16 }}>{error}</div> : null}

      <label className="field">
        <span className="lbl">Name</span>
        <input name="name" defaultValue={user.name} required maxLength={120} />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <label className="field">
          <span className="lbl">Phone / WhatsApp</span>
          <input name="phone" type="tel" defaultValue={user.phone} placeholder="+91 …" />
        </label>
        <label className="field">
          <span className="lbl">Company</span>
          <input name="company" defaultValue={user.company} />
        </label>
      </div>

      <label className="field">
        <span className="lbl">GSTIN</span>
        <input name="gstin" defaultValue={user.gstin} placeholder="Optional — for GST invoices" maxLength={15} style={{ textTransform: "uppercase" }} />
        <span className="hint">Add this and we&apos;ll put it on every invoice automatically.</span>
      </label>

      <label className="field">
        <span className="lbl">Delivery address</span>
        <input name="addressLine" defaultValue={user.addressLine} placeholder="Street, area, landmark" />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr .8fr", gap: 14 }}>
        <label className="field">
          <span className="lbl">City</span>
          <input name="city" defaultValue={user.city} />
        </label>
        <label className="field">
          <span className="lbl">State</span>
          <input name="state" defaultValue={user.state} />
        </label>
        <label className="field">
          <span className="lbl">PIN</span>
          <input name="pincode" defaultValue={user.pincode} maxLength={6} inputMode="numeric" />
        </label>
      </div>

      <label className="field">
        <span className="lbl">Language</span>
        <select name="locale" defaultValue={user.locale}>
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
        </select>
      </label>

      <div className="stack-sm" style={{ margin: "4px 0 20px" }}>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>
          <input name="notifyEmail" type="checkbox" defaultChecked={user.notifyEmail} style={{ marginTop: 3 }} />
          <span>Email me when a request changes stage, a quote lands, or we reply.</span>
        </label>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>
          <input name="marketingOptIn" type="checkbox" defaultChecked={user.marketingOptIn} style={{ marginTop: 3 }} />
          <span>Send me build logs and material notes. Monthly at most.</span>
        </label>
      </div>

      <div className="row">
        <button className="btn btn-primary btn-sm" disabled={state === "busy"}>
          {state === "busy" ? "Saving…" : "Save changes"}
        </button>
        {state === "saved" ? <span style={{ color: "#7FC79B", fontSize: 13.5 }}>✓ Saved</span> : null}
      </div>
    </form>
  );
}
