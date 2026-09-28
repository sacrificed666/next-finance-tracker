import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/lib/csp";

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

  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "production");
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|icons/|brands/|games/).*)",
  ],
};
