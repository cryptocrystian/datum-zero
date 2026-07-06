import { NextResponse, type NextRequest } from "next/server";

/**
 * M1-01 — route protection (CR-20). Fast edge gate: unauthenticated requests to protected routes
 * redirect (pages) or 401 (API). Database sessions can't be validated on the edge (no Prisma), so
 * this checks session-cookie PRESENCE only — the AUTHORITATIVE check (auth() → DB) runs in the
 * cockpit layout and each protected API route, which reject a stale/forged cookie.
 *
 * Exempt: the sign-in page, Auth.js endpoints, health, and the machine-to-machine endpoints
 * (ingestion + inference callback) that authenticate with their own bearer token, not a session.
 */
const PUBLIC_EXACT = new Set(["/", "/api/health"]);
const PUBLIC_PREFIXES = ["/signin", "/api/auth"];
const MACHINE_PREFIXES = ["/api/v1/ingestion", "/api/v1/inference"];
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_EXACT.has(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (MACHINE_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const authed = SESSION_COOKIES.some((c) => req.cookies.has(c));
  if (authed) return NextResponse.next();

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/signin";
  url.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals; exemptions handled above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
