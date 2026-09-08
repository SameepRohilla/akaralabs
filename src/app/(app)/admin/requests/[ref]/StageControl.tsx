"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStage } from "@/lib/actions/admin";
import { STAGE_META, allowedTransitions, nextStage, stageLabel, stageProgress } from "@/lib/stages";
import type { RequestStage, RequestKind } from "@/db/schema";

export default function StageControl({
  requestId,
  currentStage,
  kind,
}: {
  requestId: string;
  currentStage: RequestStage;
  kind: RequestKind;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<RequestStage | "">("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const options = allowedTransitions(currentStage);
  const next = nextStage(currentStage);

  function submit(stage: RequestStage) {
    setError(null);
    const fd = new FormData();
    fd.set("requestId", requestId);
    fd.set("stage", stage);
    if (note.trim()) fd.set("note", note.trim());
    fd.set("notify", notify ? "true" : "false");

    startTransition(async () => {
      const res = await setStage(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNote("");
      setTarget("");
      router.refresh();
    });
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Stage</h3>
          <p className="ph-sub">
            {STAGE_META[currentStage].label} — {stageProgress(currentStage)}% through the flow.
          </p>
        </div>
        {next ? (
          <button
            className="btn btn-primary btn-sm"
            disabled={pending}
            onClick={() => submit(next)}
          >
            {pending ? "Moving…" : `Move to ${stageLabel(next, kind)} →`}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="notice notice-err" style={{ marginBottom: 14 }}>
          {error}
        </div>
      ) : null}

      <label className="field" style={{ marginBottom: 12 }}>
        <span className="lbl">Note for the customer (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Printing tonight, ready for QC tomorrow morning…"
          style={{ minHeight: 70 }}
          maxLength={2000}
        />
        <span className="hint">
          This shows on their timeline and goes out in the email. Leave it blank and we use the
          standard wording for that stage.
        </span>
      </label>

      <div className="row-between">
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--ink-faint)" }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Email the customer
        </label>

        <div className="row" style={{ gap: 8 }}>
          <select
            className="inp"
            value={target}
            onChange={(e) => setTarget(e.target.value as RequestStage)}
            style={{ width: "auto", padding: "7px 10px", fontSize: 13.5 }}
          >
            <option value="">Or jump to…</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {STAGE_META[s].label}
              </option>
            ))}
          </select>
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending || !target}
            onClick={() => target && submit(target)}
          >
            Set
          </button>
        </div>
      </div>
    </div>
  );
}
