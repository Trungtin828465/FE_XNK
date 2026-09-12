import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "xnk_auth_token";
const PUBLIC_ROUTE = "/signin";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublicRoute = pathname === PUBLIC_ROUTE || pathname.startsWith(`${PUBLIC_ROUTE}/`);
  const token = request.cookies.get(AUTH_COOKIE)?.value?.trim();

  if (!token && !isPublicRoute) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signInUrl);
  }

  if (token && pathname === "/signin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

