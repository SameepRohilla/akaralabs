import type { RequestStage, RequestKind } from "@/db/schema";

type StageMeta = {
  label: string;
  /** Copy the customer reads on the timeline. */
  blurb: string;
  /** Wording tuned for a 3D-print job vs a design project. */
  printLabel?: string;
  pill: string;
};

export const STAGE_META: Record<RequestStage, StageMeta> = {
  received: {
    label: "Received",
    blurb: "Your enquiry is on our bench. We read every one by hand.",
    pill: "pill-new",
  },
  in_review: {
    label: "In review",
    blurb: "We're going through the brief and files, and working out feasibility.",
    printLabel: "Checking the model",
    pill: "pill-review",
  },
  quoted: {
    label: "Quoted",
    blurb: "A priced quote is waiting for you — approve it and we start.",
    pill: "pill-quoted",
  },
  approved: {
    label: "Approved",
    blurb: "Quote accepted. Scheduled into the queue.",
    pill: "pill-approved",
  },
  in_production: {
    label: "In production",
    blurb: "Being made. We'll post progress shots as it goes.",
    printLabel: "On the build plate",
    pill: "pill-production",
  },
  quality_check: {
    label: "Quality check",
    blurb: "Dimensional check, finishing and a last look before it leaves.",
    pill: "pill-qc",
  },
  shipped: {
    label: "Shipped",
    blurb: "On its way to you. Tracking details are in the timeline.",
    printLabel: "Dispatched",
    pill: "pill-shipped",
  },
  completed: {
    label: "Completed",
    blurb: "Delivered and closed. Reorder any time in one click.",
    pill: "pill-done",
  },
  on_hold: {
    label: "On hold",
    blurb: "Paused — we need something from you before we can carry on.",
    pill: "pill-hold",
  },
  cancelled: {
    label: "Cancelled",
    blurb: "This request was closed without going ahead.",
    pill: "pill-cancelled",
  },
};

/** The happy path, in order. on_hold and cancelled sit outside it. */
export const STAGE_FLOW: RequestStage[] = [
  "received",
  "in_review",
  "quoted",
  "approved",
  "in_production",
  "quality_check",
  "shipped",
  "completed",
];

export const TERMINAL_STAGES: RequestStage[] = ["completed", "cancelled"];
export const OPEN_STAGES: RequestStage[] = [
  ...STAGE_FLOW.filter((s) => s !== "completed"),
  "on_hold",
];

export function stageLabel(stage: RequestStage, kind?: RequestKind): string {
  const m = STAGE_META[stage];
  return kind === "print" && m.printLabel ? m.printLabel : m.label;
}

export function stageIndex(stage: RequestStage): number {
  return STAGE_FLOW.indexOf(stage);
}

/** 0–100 for a progress read-out. Off-flow stages report their last known point. */
export function stageProgress(stage: RequestStage): number {
  if (stage === "cancelled") return 0;
  const i = stageIndex(stage);
  if (i < 0) return 30; // on_hold — mid-flight, position unknown
  return Math.round((i / (STAGE_FLOW.length - 1)) * 100);
}

/** Which stages an admin may move to. Keeps the timeline sane without boxing
    the studio in — every stage ahead, one step back, plus hold/cancel from
    anywhere. Ordered forward-first so a UI that picks the first option gets a
    sensible default rather than the backward step. */
export function allowedTransitions(from: RequestStage): RequestStage[] {
  if (from === "cancelled") return ["received"];
  if (from === "on_hold") return [...STAGE_FLOW, "cancelled"];

  const i = stageIndex(from);
  const forward = STAGE_FLOW.slice(i + 1);
  const back = i > 0 ? [STAGE_FLOW[i - 1]] : [];
  return [...forward, ...back, "on_hold", "cancelled"];
}

/** The single next step along the happy path, or null at the end of it.
    This is what the primary button in the admin should do — never a step
    backwards, and never straight to hold or cancel. */
export function nextStage(from: RequestStage): RequestStage | null {
  if (from === "on_hold" || from === "cancelled") return null;
  const i = stageIndex(from);
  if (i < 0 || i >= STAGE_FLOW.length - 1) return null;
  return STAGE_FLOW[i + 1];
}

export function isOpen(stage: RequestStage): boolean {
  return !TERMINAL_STAGES.includes(stage);
}
