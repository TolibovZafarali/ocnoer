import { NextResponse } from "next/server";

export function middleware() {
  return new NextResponse(null, {
    status: 410,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive"
    }
  });
}

export const config = {
  matcher: "/:path*"
};
