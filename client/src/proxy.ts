import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { defaultLocale, locales } from "@/i18n/config";

function preferredLocale(request: NextRequest) {
  const accepted = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return accepted.includes("ar") ? "ar-EG" : accepted ? "en" : defaultLocale;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (hasLocale) {
    let response = NextResponse.next({ request });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key && request.cookies.getAll().some(cookie => cookie.name.startsWith("sb-"))) {
      const supabase = createServerClient(url, key, { cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: cookies => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      } });
      try { await supabase.auth.getUser(); } catch { /* Protected pages verify identity independently. */ }
    }
    return response;
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${preferredLocale(request)}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|docs|auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
