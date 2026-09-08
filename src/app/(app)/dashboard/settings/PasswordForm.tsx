"use client";

import { useState } from "react";

export default function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = String(fd.get("next") || "");

    if (next !== String(fd.get("confirm") || "")) {
      setError("Those two passwords don't match.");
      return;
    }

    setState("busy");
    setError(null);

    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current: hasPassword ? String(fd.get("current") || "") : undefined,
        password: next,
      }),
    });

    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      setError(b.error || "Couldn't change that.");
      setState("idle");
      return;
    }

    setState("done");
    (e.target as HTMLFormElement).reset();
  }

  if (state === "done") {
    return (
      <div className="notice notice-ok">
        Password updated. Other sessions have been signed out.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error ? <div className="notice notice-err" style={{ marginBottom: 16 }}>{error}</div> : null}

      {hasPassword ? (
        <label className="field">
          <span className="lbl">Current password</span>
          <input name="current" type="password" autoComplete="current-password" required minLength={8} />
        </label>
      ) : null}

      <label className="field">
        <span className="lbl">{hasPassword ? "New password" : "Set a password"}</span>
        <input name="next" type="password" autoComplete="new-password" required minLength={8} />
      </label>

      <label className="field">
        <span className="lbl">Confirm it</span>
        <input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </label>

      <button className="btn btn-ghost btn-sm" disabled={state === "busy"}>
        {state === "busy" ? "Saving…" : hasPassword ? "Change password" : "Set password"}
      </button>
    </form>
  );
}
