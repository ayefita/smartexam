import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname.includes(".")) return NextResponse.next();
  const token = request.cookies.get("smartexam_session")?.value;
  const isPublic = pathname === "/" || pathname === "/login" || pathname === "/register" || pathname === "/forgot" || pathname === "/verify-account" || pathname.startsWith("/verify/");
  if (!token && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (token && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  // Lets server code send people back to the page they asked for (used by the forced password change).
  const headers = new Headers(request.headers);
  headers.set("x-smartexam-path", `${pathname}${request.nextUrl.search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
