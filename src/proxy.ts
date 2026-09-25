import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/** Optimistic auth gate: send signed-out visitors to /login (routes still verify the session). */
export function proxy(req: NextRequest) {
  if (getSessionCookie(req)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/", "/rounds/:path*", "/library/:path*", "/research/:path*", "/settings/:path*"],
};
