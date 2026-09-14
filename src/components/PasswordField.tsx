"use client";

import { useId, useState } from "react";

/* A password input with a show/hide control.
 *
 * Worth having for the obvious reason — people mistype passwords, especially
 * long ones on a phone keyboard — and it removes the commonest cause of a
 * failed sign-in that looks like a broken site.
 *
 * The button is type="button" so it never submits the form, and it is excluded
 * from the tab order: someone tabbing email → password → Sign in should not
 * land on it, and anyone who wants it can still click or reach it directly.
 */
export default function PasswordField({
  name,
  label,
  autoComplete,
  required,
  minLength,
  placeholder,
  hint,
}: {
  name: string;
  label: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  hint?: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const id = useId();

  return (
    <label className="field" htmlFor={id}>
      <span className="lbl">{label}</span>
      <span style={{ position: "relative", display: "block" }}>
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          style={{ paddingInlineEnd: 44, width: "100%" }}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          title={shown ? "Hide password" : "Show password"}
          style={{
            position: "absolute",
            insetInlineEnd: 6,
            top: "50%",
            transform: "translateY(-50%)",
            display: "grid",
            placeItems: "center",
            width: 32,
            height: 32,
            padding: 0,
            border: 0,
            background: "none",
            cursor: "pointer",
            color: "var(--ink-faint)",
            lineHeight: 0,
          }}
        >
          {shown ? (
            /* eye with a slash — currently visible, click to hide */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a2 2 0 002.8 2.8" />
              <path d="M9.4 5.2A9.8 9.8 0 0112 5c5 0 9 4.5 9 7a11 11 0 01-2.4 3.5" />
              <path d="M6.2 6.7C3.9 8.2 3 10.4 3 12c0 2.5 4 7 9 7a9.6 9.6 0 004-.85" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12s3.6-7 9-7 9 7 9 7-3.6 7-9 7-9-7-9-7z" />
              <circle cx="12" cy="12" r="2.6" />
            </svg>
          )}
        </button>
      </span>
      {hint}
    </label>
  );
}
