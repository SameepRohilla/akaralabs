"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/* The dashboard's "confirm your email" prompt.
 *
 * It used to mail a link and stop there, which meant the person had to leave
 * the portal, find the mail, click through, and land back on a separate page.
 * Now the code comes to them and the box is right here — the same mechanism
 * signup and guest intake use, so there is one thing to explain and one thing
 * to keep working.
 *
 * Confirming only needs a router.refresh(). The banner reads verification off
 * the session, and the JWT callback already re-queries the database whenever
 * the token says unverified — so the very next server render sees the truth.
 * That re-query was added for the old link flow, where the database changed in
 * a mail client the token knew nothing about; it pays for itself again here.
 */
export default function ResendVerification() {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "sending" | "code" | "checking" | "done">("idle");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [bad, setBad] = useState(false);

  function say(text: string | null, isBad = false) {
    setMsg(text);
    setBad(isBad);
  }

  async function send() {
    setStage("sending");
    say(null);
    const res = await fetch("/api/account/resend-verification", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { error?: string; alreadyVerified?: boolean };

    if (body.alreadyVerified) {
      router.refresh();
      setStage("done");
      return;
    }
    if (!res.ok) {
      say(body.error || "We couldn't send a code just now.", true);
      setStage("idle");
      return;
    }
    setStage("code");
    say("Code sent — it's good for ten minutes.");
  }

  async function confirm(value: string) {
    setStage("checking");
    say(null);
    const res = await fetch("/api/account/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: value }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };

    if (!res.ok) {
      say(body.error || "That code didn't work.", true);
      setStage("code");
      return;
    }
    setStage("done");
    router.refresh();
  }

  if (stage === "done") {
    return <span style={{ color: "#7FC79B" }}>Email confirmed. Thanks.</span>;
  }

  if (stage === "code" || stage === "checking") {
    return (
      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
        <input
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(digits);
            if (digits.length === 6 && stage !== "checking") void confirm(digits);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (code.length === 6) void confirm(code);
            }
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="one-time-code"
          aria-label="Six-digit code from the email"
          placeholder="••••••"
          autoFocus
          style={{
            width: 130,
            fontSize: 17,
            letterSpacing: ".28em",
            textAlign: "center",
            padding: "7px 10px",
          }}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={stage === "checking" || code.length !== 6}
          onClick={() => void confirm(code)}
        >
          {stage === "checking" ? "Checking…" : "Confirm"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={send}>
          Send another
        </button>
        {msg ? (
          <span style={{ color: bad ? "var(--terra-deep)" : "var(--ink-soft)", fontSize: 13 }} role="alert">
            {msg}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ marginLeft: 8 }}
        disabled={stage === "sending"}
        onClick={send}
      >
        {stage === "sending" ? "Sending…" : "Send me a code"}
      </button>
      {msg ? (
        <span style={{ color: bad ? "var(--terra-deep)" : "var(--ink-soft)", fontSize: 13, marginLeft: 8 }} role="alert">
          {msg}
        </span>
      ) : null}
    </>
  );
}
