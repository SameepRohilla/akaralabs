"use client";

import { useState } from "react";

export default function TrackLookup() {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("busy");
    setError(null);

    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference: String(fd.get("reference") || "").trim(),
        email: String(fd.get("email") || "").trim(),
      }),
    });

    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      setError(b.error || "We couldn't look that up.");
      setState("idle");
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div className="notice notice-ok">
        If that reference and email match, a tracking link is on its way to your inbox. It works
        without a password.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error ? (
        <div className="notice notice-err" style={{ marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      <label className="field">
        <span className="lbl">Reference</span>
        <input
          name="reference"
          required
          placeholder="AKR-123456"
          autoComplete="off"
          spellCheck={false}
          style={{ fontFamily: "var(--font-mono)", textTransform: "uppercase" }}
        />
        <span className="hint">It&apos;s at the top of the email we sent when you enquired.</span>
      </label>

      <label className="field">
        <span className="lbl">Email you used</span>
        <input name="email" type="email" required autoComplete="email" placeholder="you@company.in" />
      </label>

      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={state === "busy"}>
        {state === "busy" ? "Looking…" : "Email me the tracking link"}
      </button>
    </form>
  );
}
