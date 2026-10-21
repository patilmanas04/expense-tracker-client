import { NextResponse, type NextRequest } from "next/server";

/**
 * Signed-out visitors go straight to /login (the dashboard is never sent), and signed-in
 * ones skip it. This is Next's "optimistic check": it only reads the session cookie. The
 * FastAPI backend still verifies the cookie's signature on every API call.
 */

const SESSION_COOKIE = "folio_session"; // set by the backend's SessionMiddleware
const LOGIN_PATH = "/login";

type SessionState = "signed-in" | "signed-out" | "unknown";

/**
 * Starlette's cookie is "<base64 JSON>.<timestamp>.<signature>". The payload is readable
 * without the secret, so we look for the user_id that a completed Google sign-in stores.
 * A cookie holding only an in-progress OAuth state counts as signed out.
 */
export function sessionState(cookie: string | undefined): SessionState {
  if (!cookie) return "signed-out";
  try {
    const session = JSON.parse(atob(cookie.split(".")[0]));
    return typeof session?.user_id === "string" && session.user_id ? "signed-in" : "signed-out";
  } catch {
    return "unknown"; // unexpected format: let the page ask the backend rather than guess
  }
}

export function proxy(request: NextRequest) {
  const state = sessionState(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === LOGIN_PATH) {
    // ?expired=1 means the backend rejected this cookie; stay here instead of bouncing back.
    if (state === "signed-in" && !searchParams.has("expired")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (state === "signed-out") {
    const login = new URL(LOGIN_PATH, request.url);
    const error = searchParams.get("error"); // failed Google sign-ins return to /?error=...
    if (error) login.searchParams.set("error", error);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  // Pages only: API calls are proxied to FastAPI (which does its own auth); assets stay public.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon|manifest.webmanifest).*)"],
};
