import { auth } from "@/auth";
import { ApiError } from "./guard";
import { getRequestFor, type Viewer } from "./queries";
import type { Request as RequestRow } from "@/db/schema";

/** Resolves who is asking and whether they may touch this request.
    One place, so a route can never accidentally skip the ownership check. */
export async function resolveRequestAccess(
  reference: string,
  trackingToken?: string,
): Promise<{
  request: RequestRow;
  viewer: Viewer;
  isStudio: boolean;
  actorId: string | null;
}> {
  const session = await auth();
  const user = session?.user;

  let viewer: Viewer | null = null;

  if (user?.id) {
    viewer =
      user.role === "staff" || user.role === "admin"
        ? { kind: "staff", userId: user.id, role: user.role }
        : { kind: "user", userId: user.id, role: "customer" };
  } else if (trackingToken) {
    viewer = { kind: "guest", token: trackingToken };
  }

  if (!viewer) throw new ApiError(401, "Sign in to continue, or use your tracking link.");

  const request = await getRequestFor(reference, viewer);
  if (!request) throw new ApiError(404, "We couldn't find that request.");

  const isStudio = viewer.kind === "staff";
  return { request, viewer, isStudio, actorId: user?.id ?? null };
}
