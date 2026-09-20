import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = new Set(["/login", "/register"]);

function hasSessionCookie(req: NextRequest): boolean {
  return req.cookies
    .getAll()
    .some((c) => c.name.endsWith("authjs.session-token") && c.value.length > 0);
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const signedIn = hasSessionCookie(req);

  if (!signedIn && !PUBLIC.has(pathname)) {
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (signedIn && PUBLIC.has(pathname)) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|brands/|games/).*)"],
};
