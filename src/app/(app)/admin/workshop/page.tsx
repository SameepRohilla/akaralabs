import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { printers, spools, printJobs, requests } from "@/db/schema";
import AdminShell from "@/components/AdminShell";
import { savePrinter, saveSpool, savePrintJob, deletePrinter, deleteSpool } from "@/lib/actions/admin";
import ActionForm from "@/components/ActionForm";
import DangerAction from "@/components/DangerAction";
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
                  <details key={m.id} className="filerow" style={{ display: "block", padding: "8px 10px" }}>
                    <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span className="fr-name" style={{ whiteSpace: "normal", flex: 1, minWidth: 140 }}>
                        {m.name}
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-faint)" }}>
                          {m.technology}
                          {m.model ? ` · ${m.model}` : ""}
                          {m.buildVolume ? ` · ${m.buildVolume}` : ""}
                        </span>
                      </span>
                      <span className={PRINTER_PILL[m.status] ?? "pill"}>{m.status}</span>
                    </summary>

                    <div style={{ paddingTop: 12 }}>
                      <ActionForm action={savePrinter} submitLabel="Save changes" successLabel="✓ Saved">
                        <input type="hidden" name="id" value={m.id} />
                        <label className="field">
                          <span className="lbl">Name</span>
                          <input name="name" defaultValue={m.name} required maxLength={80} />
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <label className="field">
                            <span className="lbl">Technology</span>
                            <select name="technology" defaultValue={m.technology}>
                              <option value="FDM">FDM</option>
                              <option value="SLA">SLA</option>
                              <option value="SLS">SLS</option>
                            </select>
                          </label>
                          <label className="field">
                            <span className="lbl">Status</span>
                            <select name="status" defaultValue={m.status}>
                              <option value="idle">idle</option>
                              <option value="busy">busy</option>
                              <option value="maintenance">maintenance</option>
                              <option value="offline">offline</option>
                            </select>
                          </label>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <label className="field">
                            <span className="lbl">Model</span>
                            <input name="model" defaultValue={m.model ?? ""} maxLength={80} placeholder="Bambu Lab P1S" />
                          </label>
                          <label className="field">
                            <span className="lbl">Build volume</span>
                            <input name="buildVolume" defaultValue={m.buildVolume ?? ""} maxLength={60} placeholder="256×256×256" />
                          </label>
                        </div>
                      </ActionForm>

                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--rule)" }}>
                        <DangerAction action={deletePrinter} id={m.id} title={m.name} label="Delete machine" />
                      </div>
                    </div>
                  </details>
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
              <div className="stack-sm" style={{ marginBottom: 16 }}>
                {filament.map((sp) => (
                  <details key={sp.id} className="filerow" style={{ display: "block", padding: "8px 10px" }}>
                    <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span className="fr-name" style={{ whiteSpace: "normal", flex: 1, minWidth: 140 }}>
                        {sp.material}
                        {sp.colour ? ` · ${sp.colour}` : ""}
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-faint)" }}>
                          {sp.brand || "—"}
                          {sp.showPublicly ? "" : " · hidden"}
                        </span>
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 13,
                          color: sp.remainingGrams < 150 ? "#D98A80" : undefined,
                        }}
                      >
                        {sp.remainingGrams} g
                        <span style={{ fontSize: 10.5, color: "var(--ink-faint)" }}> / {sp.totalGrams}</span>
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--ink-faint)" }}>
                        {sp.costPaise ? formatINR(sp.costPaise) : "—"}
                      </span>
                    </summary>

                    <div style={{ paddingTop: 12 }}>
                      <ActionForm action={saveSpool} submitLabel="Save changes" successLabel="✓ Saved">
                        <input type="hidden" name="id" value={sp.id} />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <label className="field">
                            <span className="lbl">Material</span>
                            <input name="material" defaultValue={sp.material} required maxLength={40} />
                          </label>
                          <label className="field">
                            <span className="lbl">Colour</span>
                            <input name="colour" defaultValue={sp.colour ?? ""} maxLength={40} />
                          </label>
                        </div>
                        <label className="field">
                          <span className="lbl">Brand</span>
                          <input name="brand" defaultValue={sp.brand ?? ""} maxLength={60} />
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                          <label className="field">
                            <span className="lbl">Spool holds (g)</span>
                            <input name="totalGrams" type="number" min={1} max={20000} defaultValue={sp.totalGrams} required />
                          </label>
                          <label className="field">
                            <span className="lbl">Left (g)</span>
                            <input name="remainingGrams" type="number" min={0} max={20000} defaultValue={sp.remainingGrams} required />
                          </label>
                          <label className="field">
                            <span className="lbl">Cost (₹)</span>
                            <input
                              name="costRupees"
                              type="number"
                              min={0}
                              step="0.01"
                              defaultValue={sp.costPaise != null ? sp.costPaise / 100 : ""}
                            />
                          </label>
                        </div>
                        <label className="check">
                          <input type="checkbox" name="showPublicly" defaultChecked={sp.showPublicly} />
                          <span>Show on /materials and /estimate</span>
                        </label>
                      </ActionForm>

                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--rule)" }}>
                        <DangerAction
                          action={deleteSpool}
                          id={sp.id}
                          title={`${sp.material}${sp.colour ? " · " + sp.colour : ""}`}
                          label="Delete spool"
                        />
                      </div>
                    </div>
                  </details>
                ))}
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
