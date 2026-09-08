"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = { ok: true } | { ok: false; error: string };

/** A plain form wired to a server action that returns a Result.
    React's native `<form action>` requires a void-returning action, which
    would throw away our validation messages — this keeps them and shows them
    next to the form. Also gives every submit button a pending state. */
export default function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  submitClass = "btn btn-ghost btn-sm",
  resetOnSuccess,
  successLabel = "✓ Saved",
  className,
  style,
  inline,
}: {
  action: (formData: FormData) => Promise<Result>;
  children: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  submitClass?: string;
  resetOnSuccess?: boolean;
  successLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Lays the button out beside the fields rather than under them. */
  inline?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <form
      ref={formRef}
      className={className}
      style={style}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setDone(false);

        startTransition(async () => {
          const res = await action(fd);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          if (resetOnSuccess) formRef.current?.reset();
          setDone(true);
          router.refresh();
          setTimeout(() => setDone(false), 2500);
        });
      }}
    >
      {error ? (
        <div className="notice notice-err" style={{ marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      {children}

      <div className="row" style={inline ? { display: "inline-flex", gap: 8 } : undefined}>
        <button className={submitClass} disabled={pending}>
          {pending ? (pendingLabel ?? "Saving…") : submitLabel}
        </button>
        {done ? <span style={{ color: "#7FC79B", fontSize: 12.5 }}>{successLabel}</span> : null}
      </div>
    </form>
  );
}
