import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { printers, spools, printJobs, requests } from "@/db/schema";
import AdminShell from "@/components/AdminShell";
import { savePrinter, saveSpool, savePrintJob } from "@/lib/actions/admin";
import ActionForm from "@/components/ActionForm";
import { formatINR } from "@/lib/money";
import { formatWhen } from "@/lib/dates";

export const metadata: Metadata = { title: "Workshop", robots: { index: false } };
export const dynamic = "force-dynamic";

const JOB_PILL: Record<string, string> = {
  queued: "pill pill-new",
  printing: "pill pill-printing",
  paused: "pill pill-hold",
  post_processing: "pill pill-qc",
  done: "pill pill-done",
  failed: "pill pill-hold",
};

const PRINTER_PILL: Record<string, string> = {
  idle: "pill",
  busy: "pill pill-printing",
  maintenance: "pill pill-hold",
  offline: "pill pill-hold",
};

export default async function WorkshopPage() {
  const [machines, filament, jobs, live] = await Promise.all([
    db.select().from(printers).orderBy(asc(printers.name)),
    db.select().from(spools).orderBy(asc(spools.material), desc(spools.remainingGrams)),
    db
      .select({
        id: printJobs.id,
        name: printJobs.name,
        status: printJobs.status,
        material: printJobs.material,
        copies: printJobs.copies,
        estGrams: printJobs.estGrams,
        estMinutes: printJobs.estMinutes,
        startedAt: printJobs.startedAt,
        printerName: printers.name,
        reference: requests.reference,
      })
      .from(printJobs)
      .leftJoin(printers, eq(printers.id, printJobs.printerId))
      .leftJoin(requests, eq(requests.id, printJobs.requestId))
      .where(inArray(printJobs.status, ["queued", "printing", "paused", "post_processing"]))
      .orderBy(asc(printJobs.position), asc(printJobs.createdAt)),
    db
      .select({ id: requests.id, reference: requests.reference, title: requests.title })
      .from(requests)
      .where(inArray(requests.stage, ["approved", "in_production"]))
      .orderBy(desc(requests.priority), asc(requests.promisedAt))
      .limit(40),
  ]);

  const lowStock = filament.filter((s) => s.remainingGrams < 150);
  const totalGrams = filament.reduce((a, s) => a + s.remainingGrams, 0);

  return (
    <AdminShell
      current="/admin/workshop"
      title="Workshop"
      sub={`${machines.length} machine${machines.length === 1 ? "" : "s"} · ${jobs.length} job${jobs.length === 1 ? "" : "s"} on the board · ${(totalGrams / 1000).toFixed(1)} kg filament`}
    >
      {lowStock.length ? (
        <div className="notice notice-info" style={{ marginBottom: 18 }}>
          <strong style={{ color: "var(--ink)" }}>Running low:</strong>{" "}
          {lowStock.map((s) => `${s.material}${s.colour ? ` ${s.colour}` : ""} (${s.remainingGrams} g)`).join(", ")}
          . These drop off the public materials page below 50 g.
        </div>
      ) : null}

      <div className="split">
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>The board</h3>
                <p className="ph-sub">Jobs currently in the workshop.</p>
              </div>
            </div>

            {jobs.length === 0 ? (
              <p style={{ color: "var(--ink-faint)", fontSize: 14, margin: 0 }}>
                Nothing queued. Add a job below from an approved request.
              </p>
            ) : (
              <div className="stack-sm">
                {jobs.map((j) => (
                  <ActionForm
                    key={j.id}
                    action={savePrintJob}
                    className="filerow"
                    style={{ flexWrap: "wrap", gap: 10 }}
                    submitLabel="Set"
                    pendingLabel="…"
                    inline
                  >
                    <input type="hidden" name="id" value={j.id} />
                    <input type="hidden" name="name" value={j.name} />
                    <input type="hidden" name="copies" value={j.copies} />
                    {j.estGrams != null ? <input type="hidden" name="estGrams" value={j.estGrams} /> : null}

                    <span className="fr-name" style={{ whiteSpace: "normal", minWidth: 180 }}>
                      {j.name}
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-faint)", marginTop: 2 }}>
                        {j.reference ? (
                          <Link href={`/admin/requests/${j.reference}`} style={{ color: "var(--terra-deep)" }}>
                            {j.reference}
                          </Link>
                        ) : (
                          "no request"
                        )}
                        {j.printerName ? ` · ${j.printerName}` : ""}
                        {j.material ? ` · ${j.material}` : ""}
                        {j.copies > 1 ? ` · ×${j.copies}` : ""}
                        {j.estGrams ? ` · ${j.estGrams} g` : ""}
                        {j.startedAt ? ` · started ${formatWhen(j.startedAt)}` : ""}
                      </span>
                    </span>

                    <span className={JOB_PILL[j.status] ?? "pill"}>{j.status.replace("_", " ")}</span>

                    <select
                      name="status"
                      defaultValue={j.status}
                      className="inp"
                      style={{ width: "auto", padding: "5px 8px", fontSize: 12.5 }}
                    >
                      <option value="queued">queued</option>
                      <option value="printing">printing</option>
                      <option value="paused">paused</option>
                      <option value="post_processing">post-processing</option>
                      <option value="done">done</option>
                      <option value="failed">failed</option>
                    </select>
                  </ActionForm>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Add a job</h3>
                <p className="ph-sub">
                  Marking one done or failed draws its filament off the spool automatically.
                </p>
              </div>
            </div>
            <ActionForm action={savePrintJob} submitLabel="Add to the board" resetOnSuccess submitClass="btn btn-primary btn-sm" successLabel="✓ Added">
              <label className="field">
                <span className="lbl">What is it</span>
                <input name="name" required placeholder="Drone arm bracket ×5" maxLength={120} />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="field">
                  <span className="lbl">Request</span>
                  <select name="requestId" defaultValue="">
                    <option value="">Not linked</option>
                    {live.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.reference} — {(r.title ?? "").slice(0, 40)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="lbl">Machine</span>
                  <select name="printerId" defaultValue="">
                    <option value="">Unassigned</option>
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="field">
                  <span className="lbl">Spool</span>
                  <select name="spoolId" defaultValue="">
                    <option value="">Not tracked</option>
                    {filament.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.material}
                        {s.colour ? ` ${s.colour}` : ""} — {s.remainingGrams} g
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="lbl">Copies</span>
                  <input name="copies" type="number" min={1} max={999} defaultValue={1} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="field">
                  <span className="lbl">Est. grams</span>
                  <input name="estGrams" type="number" min={0} placeholder="from the estimator" />
                </label>
                <label className="field">
                  <span className="lbl">Est. minutes</span>
                  <input name="estMinutes" type="number" min={0} />
                </label>
              </div>

              <input type="hidden" name="status" value="queued" />
            </ActionForm>
          </div>
        </div>

        <aside className="stack">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Machines</h3>
              </div>
            </div>

            {machines.length ? (
              <div className="stack-sm" style={{ marginBottom: 16 }}>
                {machines.map((m) => (
                  <ActionForm
                    key={m.id}
                    action={savePrinter}
                    className="filerow"
                    style={{ flexWrap: "wrap", gap: 8 }}
                    submitLabel="Set"
                    pendingLabel="…"
                    inline
                  >
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="name" value={m.name} />
                    <input type="hidden" name="technology" value={m.technology} />
                    {m.model ? <input type="hidden" name="model" value={m.model} /> : null}
                    {m.buildVolume ? <input type="hidden" name="buildVolume" value={m.buildVolume} /> : null}

                    <span className="fr-name" style={{ whiteSpace: "normal" }}>
                      {m.name}
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-faint)" }}>
                        {m.technology}
                        {m.buildVolume ? ` · ${m.buildVolume}` : ""}
                      </span>
                    </span>
                    <span className={PRINTER_PILL[m.status] ?? "pill"}>{m.status}</span>
                    <select name="status" defaultValue={m.status} className="inp" style={{ width: "auto", padding: "4px 7px", fontSize: 12 }}>
                      <option value="idle">idle</option>
                      <option value="busy">busy</option>
                      <option value="maintenance">maintenance</option>
                      <option value="offline">offline</option>
                    </select>
                  </ActionForm>
                ))}
              </div>
            ) : null}

            <details>
              <summary style={{ cursor: "pointer", fontSize: 13.5, color: "var(--terra-deep)", marginBottom: 12 }}>
                Add a machine
              </summary>
              <ActionForm action={savePrinter} submitLabel="Add machine" resetOnSuccess successLabel="✓ Added">
                <label className="field">
                  <span className="lbl">Name</span>
                  <input name="name" required placeholder="Bambu P1S #1" maxLength={80} />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label className="field">
                    <span className="lbl">Technology</span>
                    <select name="technology" defaultValue="FDM">
                      <option value="FDM">FDM</option>
                      <option value="SLA">SLA</option>
                      <option value="SLS">SLS</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="lbl">Build volume</span>
                    <input name="buildVolume" placeholder="256×256×256" maxLength={60} />
                  </label>
                </div>
                <input type="hidden" name="status" value="idle" />
              </ActionForm>
            </details>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Filament</h3>
                <p className="ph-sub">Feeds the live stock list on /materials and /estimate.</p>
              </div>
            </div>

            {filament.length ? (
              <div className="tbl-wrap" style={{ margin: "0 0 16px" }}>
                <table className="tbl" style={{ minWidth: 0 }}>
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Left</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filament.map((s) => (
                      <tr key={s.id}>
                        <td>
                          {s.material}
                          {s.colour ? ` · ${s.colour}` : ""}
                          <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-faint)" }}>
                            {s.brand || "—"}
                            {s.showPublicly ? "" : " · hidden"}
                          </span>
                        </td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: s.remainingGrams < 150 ? "#D98A80" : undefined }}>
                          {s.remainingGrams} g
                          <span style={{ display: "block", fontSize: 10.5, color: "var(--ink-faint)" }}>
                            of {s.totalGrams}
                          </span>
                        </td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
                          {s.costPaise ? formatINR(s.costPaise) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <details>
              <summary style={{ cursor: "pointer", fontSize: 13.5, color: "var(--terra-deep)", marginBottom: 12 }}>
                Add a spool
              </summary>
              <ActionForm action={saveSpool} submitLabel="Add spool" resetOnSuccess successLabel="✓ Added">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label className="field">
                    <span className="lbl">Material</span>
                    <input name="material" required placeholder="PETG" maxLength={40} />
                  </label>
                  <label className="field">
                    <span className="lbl">Colour</span>
                    <input name="colour" placeholder="Charcoal" maxLength={40} />
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label className="field">
                    <span className="lbl">Spool grams</span>
                    <input name="totalGrams" type="number" min={1} defaultValue={1000} />
                  </label>
                  <label className="field">
                    <span className="lbl">Remaining</span>
                    <input name="remainingGrams" type="number" min={0} defaultValue={1000} required />
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label className="field">
                    <span className="lbl">Brand</span>
                    <input name="brand" maxLength={60} />
                  </label>
                  <label className="field">
                    <span className="lbl">Cost ₹</span>
                    <input name="costRupees" type="number" min={0} step="any" />
                  </label>
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--ink-faint)", marginBottom: 14 }}>
                  <input name="showPublicly" type="checkbox" defaultChecked />
                  Show in public stock list
                </label>
              </ActionForm>
            </details>
          </div>
        </aside>
      </div>
    </AdminShell>
  );
}
