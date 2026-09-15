"use client";

import { useState } from "react";
import PasswordField from "@/components/PasswordField";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);

    const res = await signIn("credentials", {
      email: String(data.get("email") || "").trim(),
      password: String(data.get("password") || ""),
      redirect: false,
    });

    if (res?.error) {
      setError("That email and password don't match. Try again, or reset your password.");
      setBusy(false);
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

      <label className="field">
        <span className="lbl">Email</span>
        <input name="email" type="email" autoComplete="email" required placeholder="you@company.in" />
      </label>

      <PasswordField
        name="password"
        label="Password"
        autoComplete="current-password"
        required
        minLength={8}
        placeholder="••••••••"
      />

      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
