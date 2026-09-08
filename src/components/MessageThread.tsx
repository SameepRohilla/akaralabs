"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatWhen } from "@/lib/dates";

type Msg = {
  id: string;
  body: string;
  fromStudio: boolean;
  isInternal: boolean;
  createdAt: Date;
  authorName: string | null;
};

export default function MessageThread({
  reference,
  messages,
  canPost,
  asStudio,
  trackingToken,
}: {
  reference: string;
  messages: Msg[];
  canPost: boolean;
  /** Studio side: posts land as "from the studio" and can be marked internal. */
  asStudio?: boolean;
  trackingToken?: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;

    setBusy(true);
    setError(null);

    const res = await fetch(`/api/requests/${reference}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text, isInternal: asStudio ? internal : false, trackingToken }),
    });

    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      setError(b.error || "That didn't send. Try again.");
      setBusy(false);
      return;
    }

    setBody("");
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      {messages.length ? (
        <div className="thread" style={{ marginBottom: canPost ? 18 : 0 }}>
          {messages.map((m) => {
            // "mine" is whichever side is reading: the studio sees its own
            // messages on the right, the customer sees theirs.
            const mine = asStudio ? m.fromStudio : !m.fromStudio;
            return (
              <div key={m.id} className={`msg ${mine ? "mine" : ""} ${m.fromStudio && !asStudio ? "staff" : ""}`}>
                <div
                  className="msg-body"
                  style={
                    m.isInternal
                      ? { borderStyle: "dashed", borderColor: "var(--line-2)", opacity: 0.9 }
                      : undefined
                  }
                >
                  {m.isInternal ? (
                    <span className="pill" style={{ marginBottom: 7, display: "inline-flex" }}>
                      internal note
                    </span>
                  ) : null}
                  {m.body}
                </div>
                <div className="msg-meta">
                  {m.authorName || (m.fromStudio ? "Akara Labs" : "You")} · {formatWhen(m.createdAt)}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      ) : (
        <p style={{ color: "var(--ink-faint)", fontSize: 14, margin: canPost ? "0 0 16px" : 0 }}>
          {canPost
            ? "No messages yet. Anything you ask here stays attached to this request."
            : "No messages on this request yet."}
        </p>
      )}

      {canPost ? (
        <form onSubmit={send}>
          {error ? (
            <div className="notice notice-err" style={{ marginBottom: 12 }}>
              {error}
            </div>
          ) : null}
          <label className="field" style={{ marginBottom: 10 }}>
            <span className="sr-only">Your message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                asStudio ? "Reply to the customer…" : "Ask us anything about this job…"
              }
              style={{ minHeight: 88 }}
              maxLength={5000}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(e);
              }}
            />
          </label>
          <div className="row-between">
            {asStudio ? (
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--ink-faint)" }}>
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                Internal note — the customer won&apos;t see this
              </label>
            ) : (
              <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>⌘↵ to send</span>
            )}
            <button className="btn btn-primary btn-sm" disabled={busy || !body.trim()}>
              {busy ? "Sending…" : asStudio && internal ? "Save note" : "Send"}
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}
