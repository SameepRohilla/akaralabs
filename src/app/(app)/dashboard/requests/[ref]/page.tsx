import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { requireUser } from "@/lib/guard";
import { getRequestFor, getRequestDetail, type Viewer } from "@/lib/queries";
import PortalShell from "@/components/PortalShell";
import RequestDetail from "@/components/RequestDetail";
import { stageLabel } from "@/lib/stages";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `${ref.toUpperCase()} — your request`, robots: { index: false } };
}

export default async function RequestPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const session = await requireUser(`/dashboard/requests/${ref}`);
  const user = session.user;

  const viewer: Viewer =
    user.role === "customer"
      ? { kind: "user", userId: user.id, role: "customer" }
      : { kind: "staff", userId: user.id, role: user.role };

  const request = await getRequestFor(ref, viewer);

  if (!request) notFound();

  const detail = await getRequestDetail(request.id, false);

  // Opening the request is reading it.
  await db
    .update(messages)
    .set({ readByCustomerAt: new Date() })
    .where(
      and(
        eq(messages.requestId, request.id),
        eq(messages.fromStudio, true),
        isNull(messages.readByCustomerAt),
      ),
    );

  return (
    <PortalShell
      current="/dashboard/requests"
      title={request.title || (request.kind === "print" ? "3D-print request" : "Project")}
      sub={`${request.reference} · ${stageLabel(request.stage, request.kind)}`}
      actions={
        <Link className="btn btn-ghost btn-sm" href="/dashboard/requests">
          ← All requests
        </Link>
      }
    >
      <RequestDetail request={request} detail={detail} canInteract />
    </PortalShell>
  );
}
