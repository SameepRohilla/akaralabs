"use client";

import { useState } from "react";
import PasswordField from "@/components/PasswordField";
import CodeField from "@/components/CodeField";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

/* Signup in two steps: collect, then confirm.
 *
 * Nothing is created by step one — the server holds the details against a code
 * and waits. So "back to the details" is genuinely free, and abandoning the
 * form halfway leaves no half-account behind for someone to later fail to sign
 * into.
 *
 * The password is kept in component state across the two steps for one reason:
 * to sign them in automatically once the account exists, exactly as the
 * one-step version did. It never leaves the tab except in the step-one request.
 */
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
  const [step, setStep] = useState<"details" | "code">("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<number | null>(null);
  const [pending, setPending] = useState<{ email: string; password: string } | null>(null);
  const [resendAfter, setResendAfter] = useState(60);

  async function onDetails(e: React.FormEvent<HTMLFormElement>) {
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

    const body = (await res.json().catch(() => ({}))) as { error?: string; resendAfter?: number };

    if (!res.ok) {
      setError(body.error || "We couldn't start that signup.");
      setBusy(false);
      return;
    }

    setPending({ email, password });
    setResendAfter(body.resendAfter ?? 60);
    setStep("code");
    setBusy(false);
  }

  async function onCode(code: string) {
    if (!pending) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    const res = await fetch("/api/account/register/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pending.email, code }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      claimedRequests?: number;
    };

    if (!res.ok) {
      setError(body.error || "We couldn't confirm that code.");
      setBusy(false);
      return;
    }

    if (body.claimedRequests) setClaimed(body.claimedRequests);

    // Straight into the portal — no second password prompt.
    const signInRes = await signIn("credentials", {
      email: pending.email,
      password: pending.password,
      redirect: false,
    });
    if (signInRes?.error) {
      router.push("/signin?registered=1");
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function onResend() {
    if (!pending) return;
    setError(null);
    setNotice(null);
    const res = await fetch("/api/account/register/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pending.email }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) setError(body.error || "We couldn't send another code.");
    else setNotice("A new code is on its way.");
  }

  if (step === "code" && pending) {
    return (
      <>
        {claimed ? (
          <div className="notice notice-ok" style={{ marginBottom: 16 }}>
            Found {claimed} earlier {claimed === 1 ? "request" : "requests"} on this email — added
            to your dashboard.
          </div>
        ) : null}
        <CodeField
          email={pending.email}
          onSubmit={onCode}
          onResend={onResend}
          resendAfter={resendAfter}
          busy={busy}
          error={error}
          notice={notice}
          submitLabel="Create my account"
        >
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setStep("details");
              setError(null);
              setNotice(null);
            }}
          >
            Wrong email?
          </button>
        </CodeField>
      </>
    );
  }

  return (
    <form onSubmit={onDetails} noValidate>
      {error ? (
        <div className="notice notice-err" style={{ marginBottom: 16 }}>
          {error}
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
          defaultValue={pending?.email ?? presetEmail}
          placeholder="you@company.in"
        />
        <span className="hint">
          We&apos;ll send a code here to confirm it. Use the same email you submitted enquiries with
          and we&apos;ll pull them in automatically.
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

      <PasswordField
        name="password"
        label="Password"
        autoComplete="new-password"
        required
        minLength={8}
        placeholder="At least 8 characters"
      />

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
        {busy ? "Sending a code…" : "Continue"}
      </button>
    </form>
  );
}
