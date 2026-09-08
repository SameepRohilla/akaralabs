"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRequestMeta } from "@/lib/actions/admin";

const PRIORITIES = [
  { value: 0, label: "Normal" },
  { value: 1, label: "Watch" },
  { value: 2, label: "High" },
  { value: 3, label: "Drop everything" },
];

export default function RequestMetaForm({
  request,
  staff,
}: {
  request: {
    id: string;
    title: string;
    internalNotes: string;
    assigneeId: string;
    priority: number;
    promisedAt: string;
  };
  staff: { id: string; name: string | null; email: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Studio notes</h3>
          <p className="ph-sub">Internal only — never shown to the customer.</p>
        </div>
      </div>

      {error ? <div className="notice notice-err" style={{ marginBottom: 14 }}>{error}</div> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set("requestId", request.id);
          setError(null);
          startTransition(async () => {
            const res = await updateRequestMeta(fd);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            setSaved(true);
            router.refresh();
            setTimeout(() => setSaved(false), 2500);
          });
        }}
      >
        <label className="field">
          <span className="lbl">Title</span>
          <input name="title" defaultValue={request.title} maxLength={200} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label className="field">
            <span className="lbl">Owner</span>
            <select name="assigneeId" defaultValue={request.assigneeId}>
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.email}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="lbl">Priority</span>
            <select name="priority" defaultValue={request.priority}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span className="lbl">Target date</span>
          <input name="promisedAt" type="date" defaultValue={request.promisedAt} />
          <span className="hint">Shown to the customer as the date to expect it.</span>
        </label>

        <label className="field">
          <span className="lbl">Internal notes</span>
          <textarea
            name="internalNotes"
            defaultValue={request.internalNotes}
            placeholder="Wants it for a demo on the 22nd — don't slip. Check wall thickness at the boss."
            style={{ minHeight: 100 }}
            maxLength={5000}
          />
        </label>

        <div className="row">
          <button className="btn btn-ghost btn-sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
          {saved ? <span style={{ color: "#7FC79B", fontSize: 13 }}>✓ Saved</span> : null}
        </div>
      </form>
    </div>
  );
}
