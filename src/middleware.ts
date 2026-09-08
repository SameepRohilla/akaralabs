import { NextResponse, type NextRequest } from "next/server";

/* Edge-safe gate. It only checks that a session cookie exists — the real
   role checks happen in the server components and route handlers, which can
   reach the database. This just avoids rendering a portal shell for someone
   who is plainly not signed in. */

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export function middleware(req: NextRequest) {
  const hasSession = SESSION_COOKIES.some((c) => req.cookies.has(c));
  if (hasSession) return NextResponse.next();

  const url = new URL("/signin", req.url);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
