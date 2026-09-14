"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignUpForm({
  next,
  presetEmail,
  referral,
}: {
  next: string;
  presetEmail?: string;
  referral?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<number | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");

    const res = await fetch("/api/account/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(fd.get("name") || "").trim(),
        email,
        phone: String(fd.get("phone") || "").trim() || undefined,
        company: String(fd.get("company") || "").trim() || undefined,
        password,
        marketingOptIn: fd.get("marketingOptIn") === "on",
        referral,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as { error?: string; claimedRequests?: number };

    if (!res.ok) {
      setError(body.error || "We couldn't create that account.");
      setBusy(false);
      return;
    }

    if (body.claimedRequests) setClaimed(body.claimedRequests);

    // Straight into the portal — no second password prompt.
    const signInRes = await signIn("credentials", { email, password, redirect: false });
    if (signInRes?.error) {
      router.push("/signin?registered=1");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error ? (
        <div className="notice notice-err" style={{ marginBottom: 16 }}>
          {error}
        </div>
      ) : null}
      {claimed ? (
        <div className="notice notice-ok" style={{ marginBottom: 16 }}>
          Found {claimed} earlier {claimed === 1 ? "request" : "requests"} on this email — added to
          your dashboard.
        </div>
      ) : null}

      <label className="field">
        <span className="lbl">Your name</span>
        <input name="name" type="text" autoComplete="name" required placeholder="Sameep Rohilla" />
      </label>

      <label className="field">
        <span className="lbl">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={presetEmail}
          placeholder="you@company.in"
        />
        <span className="hint">
          Use the same email you submitted enquiries with and we&apos;ll pull them in automatically.
        </span>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <label className="field">
          <span className="lbl">Phone</span>
          <input name="phone" type="tel" autoComplete="tel" placeholder="+91 …" />
        </label>
        <label className="field">
          <span className="lbl">Company</span>
          <input name="company" type="text" autoComplete="organization" placeholder="Optional" />
        </label>
      </div>

      <label className="field">
        <span className="lbl">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
        />
      </label>

      <label
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          fontSize: 13.5,
          color: "var(--ink-soft)",
          margin: "4px 0 20px",
          lineHeight: 1.5,
        }}
      >
        <input name="marketingOptIn" type="checkbox" style={{ marginTop: 3 }} />
        <span>Send me build logs and material notes from the studio. No more than monthly.</span>
      </label>

      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}
