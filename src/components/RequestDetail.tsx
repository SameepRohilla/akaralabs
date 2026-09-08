import { Fragment } from "react";
import Link from "next/link";
import Timeline from "./Timeline";
import QuotePanel from "./QuotePanel";
import MessageThread from "./MessageThread";
import FileUpload from "./FileUpload";
import { StagePill } from "./RequestCard";
import { humanSize } from "@/lib/storage";
import { formatDate, formatWhen } from "@/lib/dates";
import type { Request } from "@/db/schema";
import type { getRequestDetail } from "@/lib/queries";

type Detail = Awaited<ReturnType<typeof getRequestDetail>>;

/* Spec keys that already have a dedicated row above, or that are noise in a
   customer-facing summary. Without this the panel repeats itself — "Quantity"
   appeared twice, once from the column and once from the raw form field. */
const HIDDEN_SPEC_KEYS = new Set([
  "Reference", "Name", "Email", "Phone", "WhatsApp", "Company", "Files",
  "Quantity", "Timeline", "Needed by", "Brief", "Description", "Project name",
]);

/** The customer-facing view of one request. Reused by /dashboard and the
    guest /track page — the only difference is whether interaction is allowed. */
export default function RequestDetail({
  request,
  detail,
  canInteract,
  trackingToken,
}: {
  request: Request;
  detail: Detail;
  canInteract: boolean;
  trackingToken?: string;
}) {
  const spec = Object.entries(request.spec ?? {}).filter(
    ([k, v]) => !HIDDEN_SPEC_KEYS.has(k) && !k.startsWith("_") && v && String(v) !== "—",
  ) as [string, string][];

  const liveQuote = detail.quotes.find((q) => q.status === "sent");
  const decidedQuote = detail.quotes.find((q) => q.status === "accepted" || q.status === "rejected");


  return (
    <div className="split">
      <div className="stack">
        {liveQuote ? (
          <QuotePanel
            quote={liveQuote}
            reference={request.reference}
            canDecide={canInteract}
            expired={liveQuote.expired}
            trackingToken={trackingToken}
          />
        ) : null}

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Progress</h3>
              <p className="ph-sub">Every step, as it happens. We update this as we work.</p>
            </div>
            <StagePill stage={request.stage} kind={request.kind} />
          </div>
          <Timeline events={detail.events} currentStage={request.stage} kind={request.kind} />
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Messages</h3>
              <p className="ph-sub">
                Anything about this job — ask here and it stays with the request.
              </p>
            </div>
          </div>
          <MessageThread
            reference={request.reference}
            messages={detail.messages}
            canPost={canInteract}
            trackingToken={trackingToken}
          />
        </div>

        {decidedQuote && !liveQuote ? (
          <QuotePanel
            quote={decidedQuote}
            reference={request.reference}
            canDecide={false}
            expired={decidedQuote.expired}
          />
        ) : null}
      </div>

      <aside className="stack">
        <div className="panel">
          <div className="panel-head">
            <h3>Details</h3>
          </div>
          <dl className="kv">
            <dt>Reference</dt>
            <dd style={{ fontFamily: "var(--font-mono)", color: "var(--terra-deep)" }}>{request.reference}</dd>
            <dt>Type</dt>
            <dd>{request.kind === "print" ? "3D print" : "Design project"}</dd>
            <dt>Submitted</dt>
            <dd>{formatDate(request.createdAt)}</dd>
            {request.promisedAt ? (
              <>
                <dt>Target</dt>
                <dd>{formatDate(request.promisedAt)}</dd>
              </>
            ) : null}
            {request.quantity ? (
              <>
                <dt>Quantity</dt>
                <dd>{request.quantity}</dd>
              </>
            ) : null}
            {request.timelineWanted ? (
              <>
                <dt>Needed by</dt>
                <dd>{request.timelineWanted}</dd>
              </>
            ) : null}
            {spec.map(([k, v]) => (
              <Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </Fragment>
            ))}
          </dl>

          {request.brief ? (
            <>
              <h4
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  letterSpacing: ".14em",
                  textTransform: "uppercase",
                  color: "var(--ink-faint)",
                  margin: "22px 0 8px",
                  fontWeight: 500,
                }}
              >
                Your brief
              </h4>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--ink-soft)", whiteSpace: "pre-wrap", margin: 0 }}>
                {request.brief}
              </p>
            </>
          ) : null}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Files</h3>
              <p className="ph-sub">{detail.files.length ? `${detail.files.length} on this request` : "Nothing attached yet"}</p>
            </div>
          </div>

          {detail.files.length ? (
            <ul className="filelist" style={{ marginBottom: canInteract ? 14 : 0 }}>
              {detail.files.map((f) => {
                const meta = f.meta as { bbox?: { x: number; y: number; z: number }; volumeCm3?: number } | null;
                return (
                  <li key={f.id}>
                    <a
                      href={`/api/files/${f.id}`}
                      className="filerow"
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <span className="fr-ext">{(f.filename.split(".").pop() || "file").slice(0, 5)}</span>
                      <span className="fr-name">
                        {f.filename}
                        {meta?.bbox ? (
                          <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-faint)", fontFamily: "var(--font-mono)" }}>
                            {meta.bbox.x}×{meta.bbox.y}×{meta.bbox.z} mm
                            {meta.volumeCm3 ? ` · ${meta.volumeCm3} cm³` : ""}
                          </span>
                        ) : null}
                      </span>
                      <span className="fr-size">{humanSize(f.sizeBytes)}</span>
                    </a>
                    {f.uploadedBy === "studio" ? (
                      <span className="art-meta" style={{ display: "block", padding: "4px 0 0 4px" }}>
                        from the studio · {formatWhen(f.createdAt)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {canInteract ? <FileUpload reference={request.reference} /> : null}
        </div>

        {canInteract ? (
          <div className="panel">
            <div className="panel-head">
              <h3>Need something else?</h3>
            </div>
            <div className="stack-sm">
              <Link className="btn btn-ghost btn-sm" href="/start/" style={{ justifyContent: "flex-start" }}>
                Start another project
              </Link>
              <a
                className="btn btn-ghost btn-sm"
                style={{ justifyContent: "flex-start" }}
                href={`https://wa.me/917082089049?text=${encodeURIComponent(`Hi Akara Labs — about ${request.reference}`)}`}
              >
                Message on WhatsApp
              </a>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
