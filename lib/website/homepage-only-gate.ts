import { NextResponse, type NextRequest } from "next/server";

// Preserved for a future website restoration; the active middleware never calls it.
export function homepageOnlyGate(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    !["GET", "HEAD"].includes(request.method) ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  ) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" }
    });
  }

  if (
    pathname === "/" ||
    pathname.startsWith("/_next/") ||
    ["/icon.png", "/favicon.ico", "/nebula.svg"].includes(pathname)
  ) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/", request.url), {
    status: 307,
    headers: { "Cache-Control": "no-store" }
  });
}
