import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { listUserFiles } from "@/lib/queries";
import PortalShell from "@/components/PortalShell";
import { humanSize } from "@/lib/storage";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Model library", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Everything the customer has ever sent us, in one place — so a reorder is
    "print this again" rather than digging through email for the STL. */
export default async function FilesPage() {
  const session = await requireUser("/dashboard/files");
  const files = await listUserFiles(session.user.id);

  const totalBytes = files.reduce((a, f) => a + Number(f.sizeBytes), 0);
  const models = files.filter((f) => /\.(stl|3mf|step|stp|obj|iges|igs)$/i.test(f.filename));

  return (
    <PortalShell
      current="/dashboard/files"
      title="Model library"
      sub={`${files.length} file${files.length === 1 ? "" : "s"} · ${humanSize(totalBytes)}`}
      actions={
        <Link className="btn btn-primary btn-sm" href="/print/">
          Print something
        </Link>
      }
    >
      {files.length === 0 ? (
        <div className="panel empty">
          <div className="e-glyph">⬡</div>
          <h3>No files yet.</h3>
          <p>
            Anything you attach to a request lands here — CAD, STLs, drawings, and the photos we
            send back. Reordering later takes one click.
          </p>
          <Link className="btn btn-primary" href="/print/">
            Send your first model
          </Link>
        </div>
      ) : (
        <>
          {models.length ? (
            <div className="panel" style={{ marginBottom: 18 }}>
              <div className="panel-head">
                <div>
                  <h3>Ready to reprint</h3>
                  <p className="ph-sub">
                    {models.length} printable model{models.length === 1 ? "" : "s"} on file — we
                    already have the geometry.
                  </p>
                </div>
              </div>
              <div className="grid-2">
                {models.slice(0, 6).map((f) => {
                  const meta = f.meta as
                    | { bbox?: { x: number; y: number; z: number }; volumeCm3?: number }
                    | null;
                  return (
                    <div key={f.id} className="filerow" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                      <span className="fr-ext">{(f.filename.split(".").pop() || "").slice(0, 5)}</span>
                      <span className="fr-name" style={{ whiteSpace: "normal" }}>
                        {f.filename}
                        {meta?.bbox ? (
                          <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-faint)", fontFamily: "var(--font-mono)", marginTop: 3 }}>
                            {meta.bbox.x}×{meta.bbox.y}×{meta.bbox.z} mm
                            {meta.volumeCm3 ? ` · ${meta.volumeCm3} cm³` : ""}
                          </span>
                        ) : null}
                      </span>
                      <Link
                        className="btn btn-ghost btn-sm"
                        href={`/print/?reorder=${encodeURIComponent(f.filename)}`}
                      >
                        Reorder
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-head">
              <h3>All files</h3>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Request</th>
                    <th>Source</th>
                    <th>Size</th>
                    <th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <a href={`/api/files/${f.id}`}>{f.filename}</a>
                      </td>
                      <td>
                        {f.requestReference ? (
                          <Link href={`/dashboard/requests/${f.requestReference}`} className="ref">
                            {f.requestReference}
                          </Link>
                        ) : (
                          <span style={{ color: "var(--ink-faint)" }}>—</span>
                        )}
                      </td>
                      <td style={{ color: "var(--ink-faint)", fontSize: 13 }}>
                        {f.uploadedBy === "studio" ? "Akara Labs" : "You"}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                        {humanSize(Number(f.sizeBytes))}
                      </td>
                      <td style={{ color: "var(--ink-faint)", fontSize: 13 }}>{formatDate(f.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </PortalShell>
  );
}
