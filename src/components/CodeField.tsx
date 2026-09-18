"use client";

import { useEffect, useId, useRef, useState } from "react";

/* A six-digit code entry, plus the resend control that belongs with it.
 *
 * One input, not six boxes. Six boxes look tidier in a screenshot and are
 * worse in every other respect: they fight paste, they confuse screen readers,
 * they need per-box focus choreography that breaks on backspace, and on
 * Android the SMS/email autofill only reliably targets a single field. One
 * input with autoComplete="one-time-code" gets the iOS keyboard suggestion and
 * the Android autofill for free.
 *
 * The resend button is disabled on a live countdown rather than hidden, so the
 * wait is visible instead of leaving people clicking a button that isn't
 * there yet.
 */
export default function CodeField({
  email,
  onSubmit,
  onResend,
  resendAfter = 60,
  busy = false,
  error,
  notice,
  submitLabel = "Confirm",
  children,
}: {
  /** Shown back to the reader so a typo in the address is obvious here, not
      after ten minutes of waiting for an email that went elsewhere. */
  email: string;
  onSubmit: (code: string) => void | Promise<void>;
  onResend?: () => void | Promise<void>;
  resendAfter?: number;
  busy?: boolean;
  error?: string | null;
  notice?: string | null;
  submitLabel?: string;
  /** e.g. a "wrong address?" link back to the previous step. */
  children?: React.ReactNode;
}) {
  const id = useId();
  const [code, setCode] = useState("");
  const [left, setLeft] = useState(resendAfter);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(t);
  }, [left]);

  function change(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    /* Submit as soon as the sixth digit lands. Someone who has just typed all
       six has finished; making them find a button as well is friction for no
       gain, and the button stays for keyboard and assistive-tech users. */
    if (digits.length === 6 && !busy) void onSubmit(digits);
  }

  async function resend() {
    if (!onResend || left > 0) return;
    setLeft(resendAfter);
    setCode("");
    await onResend();
    inputRef.current?.focus();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void onSubmit(code);
      }}
      noValidate
    >
      {error ? (
        <div className="notice notice-err" style={{ marginBottom: 16 }} role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="notice notice-ok" style={{ marginBottom: 16 }} role="status">
          {notice}
        </div>
      ) : null}

      <p className="ac-sub" style={{ marginTop: 0 }}>
        We sent a six-digit code to <strong style={{ color: "var(--ink)" }}>{email}</strong>. It
        works for ten minutes.
      </p>

      <label className="field" htmlFor={id}>
        <span className="lbl">Code from the email</span>
        <input
          id={id}
          ref={inputRef}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => change(e.target.value)}
          placeholder="••••••"
          aria-describedby={`${id}-hint`}
          style={{
            fontSize: 26,
            letterSpacing: ".38em",
            textAlign: "center",
            fontFamily: "var(--mono, ui-monospace, Menlo, Consolas, monospace)",
            paddingBlock: 12,
          }}
        />
        <span className="hint" id={`${id}-hint`}>
          Check your spam folder if it hasn&apos;t arrived within a minute.
        </span>
      </label>

      <button
        className="btn btn-primary"
        style={{ width: "100%", justifyContent: "center" }}
        disabled={busy || code.length !== 6}
      >
        {busy ? "Checking…" : submitLabel}
      </button>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginTop: 14,
          fontSize: 13.5,
        }}
      >
        {onResend ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={resend}
            disabled={left > 0 || busy}
          >
            {left > 0 ? `Resend in ${left}s` : "Send a new code"}
          </button>
        ) : (
          <span />
        )}
        {children}
      </div>
    </form>
  );
}
