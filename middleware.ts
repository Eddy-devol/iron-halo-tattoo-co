import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin") && request.nextUrl.pathname !== "/admin/login") {
    if (!request.cookies.get("iron_halo_admin_session")?.value) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }
  const response = NextResponse.next();
  if (/^\/admin\/bookings\/[^/]+\/print(?:\/|$)/.test(request.nextUrl.pathname)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return response;
}

export const config = { matcher: ["/admin/:path*"] };
