import Link from "next/link";
import { STAGE_META, stageLabel, stageProgress } from "@/lib/stages";
import type { RequestStage, RequestKind } from "@/db/schema";
import { formatWhen } from "@/lib/dates";

export function StagePill({ stage, kind }: { stage: RequestStage; kind?: RequestKind }) {
  return <span className={`pill ${STAGE_META[stage].pill}`}>{stageLabel(stage, kind)}</span>;
}

export default function RequestCard({
  request,
  href,
  unread,
}: {
  request: {
    reference: string;
    kind: RequestKind;
    stage: RequestStage;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
    quantity: string | null;
  };
  href: string;
  unread?: number;
}) {
  const pct = stageProgress(request.stage);

  return (
    <Link href={href} className="panel" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <span className="ref" style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--terra-deep)" }}>
            {request.reference}
          </span>
          <h3
            style={{
              margin: "6px 0 0",
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            {request.title || (request.kind === "print" ? "3D-print request" : "Project enquiry")}
          </h3>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {unread ? (
            <span className="pill pill-quoted">
              {unread} new {unread === 1 ? "message" : "messages"}
            </span>
          ) : null}
          <StagePill stage={request.stage} kind={request.kind} />
        </div>
      </div>

      <div
        aria-hidden="true"
        style={{
          height: 3,
          borderRadius: 3,
          background: "var(--line)",
          overflow: "hidden",
          margin: "4px 0 12px",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: request.stage === "cancelled" ? "var(--line-2)" : "var(--grad-saffron)",
            transition: "width .4s ease",
          }}
        />
      </div>

      <div className="row-between" style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>
        <span>
          {request.kind === "print" ? "3D print" : "Project"}
          {request.quantity ? ` · ${request.quantity}` : ""}
        </span>
        <span>Updated {formatWhen(request.updatedAt)}</span>
      </div>
    </Link>
  );
}
