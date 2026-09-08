"use client";

import { useState } from "react";

export default function ResendVerification() {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");

  if (state === "sent") return <span style={{ color: "var(--ink-soft)" }}>Sent — check your inbox.</span>;

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      style={{ marginLeft: 8 }}
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        const res = await fetch("/api/account/resend-verification", { method: "POST" });
        setState(res.ok ? "sent" : "error");
      }}
    >
      {state === "busy" ? "Sending…" : state === "error" ? "Try again" : "Resend link"}
    </button>
  );
}
