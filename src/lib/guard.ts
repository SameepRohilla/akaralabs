import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Session } from "next-auth";

export type Role = "customer" | "staff" | "admin";

export async function getSession() {
  return auth();
}

/** Server-component guard for /dashboard. */
export async function requireUser(returnTo?: string): Promise<Session & { user: NonNullable<Session["user"]> }> {
  const session = await auth();
  if (!session?.user?.id) {
    const q = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
    redirect(`/signin${q}`);
  }
  return session as Session & { user: NonNullable<Session["user"]> };
}

/** Server-component guard for /admin. Staff can see the queue; admin can do everything. */
export async function requireStaff(returnTo?: string) {
  const session = await requireUser(returnTo);
  if (session.user.role !== "staff" && session.user.role !== "admin") redirect("/dashboard");
  return session;
}

export async function requireAdmin(returnTo?: string) {
  const session = await requireUser(returnTo);
  if (session.user.role !== "admin") redirect("/dashboard");
  return session;
}

/* ---- Route-handler variants: return a Response instead of redirecting ---- */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function apiUser() {
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "Sign in to continue");
  return session.user;
}

export async function apiStaff() {
  const user = await apiUser();
  if (user.role !== "staff" && user.role !== "admin") throw new ApiError(403, "Staff only");
  return user;
}

export async function apiAdmin() {
  const user = await apiUser();
  if (user.role !== "admin") throw new ApiError(403, "Admin only");
  return user;
}

export function isStaff(role?: string | null) {
  return role === "staff" || role === "admin";
}

/** Wraps a route handler so thrown ApiErrors and Zod errors become clean JSON. */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<Response>,
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return Response.json({ error: err.message, code: err.code }, { status: err.status });
      }
      if (err && typeof err === "object" && "issues" in err) {
        const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
        return Response.json(
          {
            error: issues[0]?.message || "Invalid input",
            fields: Object.fromEntries(issues.map((i) => [i.path.join("."), i.message])),
          },
          { status: 400 },
        );
      }
      console.error("[api] unhandled:", err);
      return Response.json({ error: "Something went wrong on our side." }, { status: 500 });
    }
  };
}
