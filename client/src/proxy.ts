import { NextResponse, type NextRequest } from "next/server";

import { defaultLocale, locales } from "@/i18n/config";

function preferredLocale() {
  return defaultLocale;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const matchedLocale = locales.find(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (!matchedLocale) {
    const url = request.nextUrl.clone();
    url.pathname = `/${preferredLocale()}${pathname}`;
    return NextResponse.redirect(url);
  }

  const subPath = pathname.slice(`/${matchedLocale}`.length) || "/";
  const isProtected =
    subPath === "/learn" ||
    subPath.startsWith("/learn/") ||
    (subPath.startsWith("/onboarding") && !subPath.startsWith("/onboarding/preview")) ||
    subPath === "/worlds" ||
    subPath.startsWith("/worlds/") ||
    subPath === "/challenges" ||
    subPath.startsWith("/challenges/");

  if (isProtected) {
    const sessionToken =
      request.cookies.get("better-auth.session_token")?.value ||
      request.cookies.get("__Secure-better-auth.session_token")?.value;

    if (!sessionToken) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = `/${matchedLocale}/login`;
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/((?!api|docs|auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
