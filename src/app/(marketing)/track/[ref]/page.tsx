import type { Metadata } from "next";
import Link from "next/link";
import { getRequestFor, getRequestDetail } from "@/lib/queries";
import RequestDetail from "@/components/RequestDetail";
import { stageLabel } from "@/lib/stages";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `${ref.toUpperCase()}`, robots: { index: false, follow: false } };
}

/** Guest tracking. The link carries a 128-bit token; without it there is
    nothing to see, and the page is never indexed. */
export default async function TrackDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const [{ ref }, { t }] = await Promise.all([params, searchParams]);
  const session = await auth();
  const user = session?.user;

  // A signed-in owner (or staff) doesn't need the token.
  const request =
    (user
      ? await getRequestFor(
          ref,
          user.role === "customer"
            ? { kind: "user", userId: user.id, role: "customer" }
            : { kind: "staff", userId: user.id, role: user.role },
        )
      : null) ?? (t ? await getRequestFor(ref, { kind: "guest", token: t }) : null);

  if (!request) {
    return (
      <main>
        <section className="wrap" style={{ padding: "clamp(60px, 8vw, 110px) 0 90px", maxWidth: 560 }}>
          <p className="kicker">Not found</p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px,4vw,40px)", fontWeight: 460, margin: "0 0 14px" }}>
            That link didn&apos;t open anything.
          </h1>
          <p className="lead">
            Tracking links expire from your inbox, not from us — request a fresh one and it&apos;ll
            work again.
          </p>
          <div className="row" style={{ marginTop: 26 }}>
            <Link className="btn btn-primary" href="/track/">
              Get a new link
            </Link>
            <Link className="btn btn-ghost" href="/signin">
              Sign in instead
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const detail = await getRequestDetail(request.id, false);
  const isOwner = !!user && request.userId === user.id;

  return (
    <main>
      <section className="wrap" style={{ padding: "clamp(34px, 5vw, 60px) 0 80px" }}>
        <div className="row-between" style={{ marginBottom: 26 }}>
          <div>
            <p className="kicker" style={{ marginBottom: 8 }}>
              {request.reference} · {stageLabel(request.stage, request.kind)}
            </p>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px,3.4vw,36px)", fontWeight: 460, margin: 0, lineHeight: 1.15 }}>
              {request.title || (request.kind === "print" ? "3D-print request" : "Your project")}
            </h1>
          </div>
          {isOwner ? (
            <Link className="btn btn-ghost btn-sm" href={`/dashboard/requests/${request.reference}`}>
              Open in dashboard →
            </Link>
          ) : (
            <Link className="btn btn-ghost btn-sm" href={`/signup?email=${encodeURIComponent(request.contactEmail)}`}>
              Create an account
            </Link>
          )}
        </div>

        {!isOwner ? (
          <div className="notice notice-info" style={{ marginBottom: 22 }}>
            You&apos;re viewing this with a private link. Create an account on{" "}
            <strong style={{ color: "var(--ink)" }}>{request.contactEmail}</strong> and this request —
            plus every future one — lands in a single dashboard.
          </div>
        ) : null}

        <RequestDetail
          request={request}
          detail={detail}
          canInteract
          trackingToken={isOwner ? undefined : t}
        />
      </section>
    </main>
  );
}
