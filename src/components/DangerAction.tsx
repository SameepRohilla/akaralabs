"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = { ok: boolean; error?: string };

/* A destructive action that takes two clicks.
 *
 * Deliberately not window.confirm(): a native dialog is trivial to dismiss on
 * reflex, is not styleable, and blocks the page. Arming the button in place
 * makes the consequence legible at the moment of the second click — the label
 * says what is about to happen, to which row.
 *
 * It disarms itself after a few seconds, so a button left armed in a tab you
 * walked away from doesn't delete something on a stray click later.
 */
export default function DangerAction({
  action,
  id,
  label = "Delete",
  armedLabel = "Really delete?",
  title,
}: {
  action: (formData: FormData) => Promise<Result>;
  id: string;
  label?: string;
  armedLabel?: string;
  /** Shown in the error line so a failure names the row it belongs to. */
  title?: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onClick() {
    if (!armed) {
      setArmed(true);
      setError(null);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    clearTimeout(timer.current);
    setArmed(false);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await action(fd);
      if (res.ok) router.refresh();
      else setError(res.error ?? "That didn't work.");
    });
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="btn btn-sm"
        aria-label={title ? `${armed ? armedLabel : label} — ${title}` : undefined}
        style={{
          borderColor: armed ? "var(--danger, #b3261e)" : undefined,
          color: armed ? "var(--danger, #b3261e)" : "var(--ink-faint)",
          fontWeight: armed ? 600 : undefined,
          whiteSpace: "nowrap",
        }}
      >
        {pending ? "…" : armed ? armedLabel : label}
      </button>
      {error ? (
        <span role="alert" style={{ fontSize: 11.5, color: "var(--danger, #b3261e)", maxWidth: 260 }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
