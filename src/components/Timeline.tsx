import { STAGE_FLOW, STAGE_META, stageIndex, stageLabel } from "@/lib/stages";
import type { RequestStage, RequestKind } from "@/db/schema";
import { formatWhen } from "@/lib/dates";

type Event = {
  id: string;
  stage: RequestStage | null;
  kind: string;
  title: string;
  note: string | null;
  isPublic: boolean;
  createdAt: Date;
  actorName?: string | null;
};

/** The stage ladder, with what actually happened threaded through it.
    Future stages are shown greyed rather than hidden — knowing what's coming
    is most of what a customer wants from a tracking page. */
export default function Timeline({
  events,
  currentStage,
  kind,
  showInternal,
}: {
  events: Event[];
  currentStage: RequestStage;
  kind: RequestKind;
  showInternal?: boolean;
}) {
  const current = stageIndex(currentStage);
  const offFlow = current < 0; // on_hold / cancelled

  // Latest event per stage, so a stage that was revisited shows its newest note.
  const byStage = new Map<RequestStage, Event>();
  for (const e of events) if (e.stage) byStage.set(e.stage, e);

  const loose = events.filter((e) => !e.stage && e.kind !== "stage");

  return (
    <>
      {offFlow ? (
        <div className={`notice ${currentStage === "cancelled" ? "notice-err" : ""}`} style={{ marginBottom: 20 }}>
          <strong style={{ color: "var(--ink)" }}>{STAGE_META[currentStage].label}.</strong>{" "}
          {STAGE_META[currentStage].blurb}
        </div>
      ) : null}

      <ol className="timeline">
        {STAGE_FLOW.map((stage, i) => {
          const done = !offFlow && i < current;
          const isCurrent = !offFlow && i === current;
          const event = byStage.get(stage);
          return (
            <li
              key={stage}
              className={`tl-item ${done ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`}
            >
              <p className="tl-title">
                <strong style={{ fontWeight: isCurrent ? 600 : 400 }}>{stageLabel(stage, kind)}</strong>
              </p>
              {event ? (
                <p className="tl-meta">{formatWhen(event.createdAt)}</p>
              ) : isCurrent ? (
                <p className="tl-meta">now</p>
              ) : null}
              {(isCurrent || done) && (event?.note || (isCurrent && STAGE_META[stage].blurb)) ? (
                <p className="tl-note">{event?.note || STAGE_META[stage].blurb}</p>
              ) : null}
            </li>
          );
        })}
      </ol>

      {loose.length ? (
        <>
          <h4
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "var(--ink-faint)",
              margin: "26px 0 12px",
              fontWeight: 500,
            }}
          >
            Activity
          </h4>
          <ol className="timeline">
            {loose
              .slice()
              .reverse()
              .map((e) => (
                <li className="tl-item is-done" key={e.id}>
                  <p className="tl-title">
                    {e.title}
                    {showInternal && !e.isPublic ? (
                      <span className="pill" style={{ marginLeft: 8 }}>
                        internal
                      </span>
                    ) : null}
                  </p>
                  <p className="tl-meta">
                    {formatWhen(e.createdAt)}
                    {e.actorName ? ` · ${e.actorName}` : ""}
                  </p>
                  {e.note ? <p className="tl-note">{e.note}</p> : null}
                </li>
              ))}
          </ol>
        </>
      ) : null}
    </>
  );
}
