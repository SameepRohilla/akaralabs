import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { messages, users } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { getRequestFor, getRequestDetail } from "@/lib/queries";
import AdminShell from "@/components/AdminShell";
import Timeline from "@/components/Timeline";
import MessageThread from "@/components/MessageThread";
import FileUpload from "@/components/FileUpload";
import StageControl from "./StageControl";
import QuoteBuilder from "./QuoteBuilder";
import RequestMetaForm from "./RequestMetaForm";
import { StagePill } from "@/components/RequestCard";
import { humanSize } from "@/lib/storage";
import { formatINR } from "@/lib/money";
import { formatDate, formatWhen } from "@/lib/dates";
import { estimatePrint, MATERIALS, type MaterialKey } from "@/lib/stl";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `${ref.toUpperCase()} — studio`, robots: { index: false } };
}

export default async function AdminRequestPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const session = await requireStaff(`/admin/requests/${ref}`);

  const request = await getRequestFor(ref, {
    kind: "staff",
    userId: session.user.id,
    role: session.user.role as "staff" | "admin",
  });
  if (!request) notFound();

  const [detail, staffList, customer] = await Promise.all([
    getRequestDetail(request.id, true),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.role, ["staff", "admin"])),
    request.userId
      ? db.select().from(users).where(eq(users.id, request.userId)).limit(1)
      : Promise.resolve([] as (typeof users.$inferSelect)[]),
  ]);

  // Opening it counts as the studio reading the customer's messages.
  await db
    .update(messages)
    .set({ readByStudioAt: new Date() })
    .where(
      and(
        eq(messages.requestId, request.id),
        eq(messages.fromStudio, false),
        isNull(messages.readByStudioAt),
      ),
    );

  // Pre-price any STL on the request so the quote builder starts from a number.
  const stlFile = detail.files.find(
    (f) => f.meta && typeof (f.meta as { volumeCm3?: number }).volumeCm3 === "number",
  );
  const stlMeta = stlFile?.meta as { volumeCm3: number; surfaceCm2: number; bbox: { x: number; y: number; z: number }; triangles: number; watertightHint: boolean } | undefined;

  const specMaterial = String(request.spec?.["Material"] ?? "").toUpperCase();
  const guessedMaterial = (Object.keys(MATERIALS) as MaterialKey[]).find((m) =>
    specMaterial.includes(m.toUpperCase()),
  );

  const seed =
    stlMeta && request.kind === "print"
      ? estimatePrint({
          meta: stlMeta,
          material: guessedMaterial ?? "PLA",
          quality: "standard",
          infillPct: 20,
          copies: Math.max(1, parseInt(String(request.quantity ?? "1"), 10) || 1),
        })
      : null;

  const spec = Object.entries(request.spec ?? {}).filter(
    ([k, v]) => !k.startsWith("_") && v && String(v) !== "—",
  ) as [string, string][];

  return (
    <AdminShell
      current="/admin/requests"
      title={request.title || (request.kind === "print" ? "3D-print request" : "Project")}
      sub={`${request.reference} · ${request.contactName}${request.contactCompany ? ` · ${request.contactCompany}` : ""}`}
      actions={
        <>
          <StagePill stage={request.stage} kind={request.kind} />
          <Link className="btn btn-ghost btn-sm" href="/admin/requests">
            ← Queue
          </Link>
        </>
      }
    >
      <div className="split">
        <div className="stack">
          <StageControl
            requestId={request.id}
            currentStage={request.stage}
            kind={request.kind}
          />

          <QuoteBuilder
            requestId={request.id}
            existingQuotes={detail.quotes}
            seed={
              seed
                ? {
                    description: `3D printing — ${request.title || "part"}`,
                    detail: stlMeta
                      ? `${guessedMaterial ?? "PLA"}, ${stlMeta.bbox.x}×${stlMeta.bbox.y}×${stlMeta.bbox.z} mm, ${seed.grams} g each`
                      : undefined,
                    quantity: Math.max(1, parseInt(String(request.quantity ?? "1"), 10) || 1),
                    unitPriceRupees: Math.round(seed.perCopyPaise / 100),
                  }
                : null
            }
          />

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Thread</h3>
                <p className="ph-sub">
                  Replies go to the customer. Internal notes stay here.
                </p>
              </div>
            </div>
            <MessageThread
              reference={request.reference}
              messages={detail.messages}
              canPost
              asStudio
            />
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>History</h3>
                <p className="ph-sub">Including internal events the customer can&apos;t see.</p>
              </div>
            </div>
            <Timeline
              events={detail.events}
              currentStage={request.stage}
              kind={request.kind}
              showInternal
            />
          </div>
        </div>

        <aside className="stack">
          <div className="panel">
            <div className="panel-head">
              <h3>Customer</h3>
            </div>
            <dl className="kv">
              <dt>Name</dt>
              <dd>{request.contactName}</dd>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${request.contactEmail}`} style={{ color: "var(--terra-deep)" }}>
                  {request.contactEmail}
                </a>
              </dd>
              {request.contactPhone ? (
                <>
                  <dt>Phone</dt>
                  <dd>
                    <a
                      href={`https://wa.me/${request.contactPhone.replace(/\D/g, "")}`}
                      style={{ color: "var(--terra-deep)" }}
                    >
                      {request.contactPhone}
                    </a>
                  </dd>
                </>
              ) : null}
              {request.contactCompany ? (
                <>
                  <dt>Company</dt>
                  <dd>{request.contactCompany}</dd>
                </>
              ) : null}
              <dt>Account</dt>
              <dd>
                {request.userId ? (
                  <Link href={`/admin/people?q=${encodeURIComponent(request.contactEmail)}`} style={{ color: "var(--terra-deep)" }}>
                    registered
                  </Link>
                ) : (
                  <span style={{ color: "var(--ink-faint)" }}>guest — no account</span>
                )}
              </dd>
              {customer[0]?.gstin ? (
                <>
                  <dt>GSTIN</dt>
                  <dd style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{customer[0].gstin}</dd>
                </>
              ) : null}
              {customer[0]?.addressLine ? (
                <>
                  <dt>Ship to</dt>
                  <dd>
                    {customer[0].addressLine}
                    {customer[0].city ? `, ${customer[0].city}` : ""}
                    {customer[0].pincode ? ` ${customer[0].pincode}` : ""}
                  </dd>
                </>
              ) : null}
              <dt>Submitted</dt>
              <dd>{formatDate(request.createdAt)}</dd>
              <dt>Track link</dt>
              <dd style={{ fontSize: 12, wordBreak: "break-all", fontFamily: "var(--font-mono)" }}>
                /track/{request.reference}?t={request.trackingToken}
              </dd>
            </dl>
          </div>

          <RequestMetaForm
            request={{
              id: request.id,
              title: request.title ?? "",
              internalNotes: request.internalNotes ?? "",
              assigneeId: request.assigneeId ?? "",
              priority: request.priority,
              promisedAt: request.promisedAt ? request.promisedAt.toISOString().slice(0, 10) : "",
            }}
            staff={staffList}
          />

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>What they asked for</h3>
              </div>
            </div>
            <dl className="kv" style={{ fontSize: 13.5 }}>
              {spec.map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {request.brief ? (
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-soft)", whiteSpace: "pre-wrap", marginTop: 16, marginBottom: 0 }}>
                {request.brief}
              </p>
            ) : null}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Files</h3>
                <p className="ph-sub">{detail.files.length} on this request</p>
              </div>
            </div>

            {stlMeta ? (
              <div className="notice notice-info" style={{ marginBottom: 14, fontSize: 13.5 }}>
                <strong style={{ color: "var(--ink)" }}>Geometry read:</strong>{" "}
                {stlMeta.bbox.x}×{stlMeta.bbox.y}×{stlMeta.bbox.z} mm ·{" "}
                {stlMeta.volumeCm3} cm³ · {stlMeta.triangles.toLocaleString("en-IN")} tris
                {!stlMeta.watertightHint ? " · may not be watertight" : ""}
                {seed ? (
                  <>
                    <br />
                    Rough cost {formatINR(seed.perCopyPaise)}/pc · {seed.grams} g ·{" "}
                    {seed.hours < 1 ? `${Math.round(seed.hours * 60)} min` : `${seed.hours} hr`} each
                  </>
                ) : null}
              </div>
            ) : null}

            {detail.files.length ? (
              <ul className="filelist" style={{ marginBottom: 14 }}>
                {detail.files.map((f) => (
                  <li key={f.id}>
                    <a href={`/api/files/${f.id}`} className="filerow" style={{ textDecoration: "none", color: "inherit" }}>
                      <span className="fr-ext">{(f.filename.split(".").pop() || "").slice(0, 5)}</span>
                      <span className="fr-name">
                        {f.filename}
                        <span style={{ display: "block", fontSize: 11, color: "var(--ink-faint)" }}>
                          {f.uploadedBy === "studio" ? "studio" : "customer"} · {formatWhen(f.createdAt)}
                        </span>
                      </span>
                      <span className="fr-size">{humanSize(Number(f.sizeBytes))}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            <FileUpload reference={request.reference} asStudio label="Post progress shots or drawings" />
          </div>
        </aside>
      </div>
    </AdminShell>
  );
}
