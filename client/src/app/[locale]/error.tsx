"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { isLocale } from "@/i18n/config";

/** Keeps a temporary database or service outage from exposing a server stack trace. */
export default function RouteError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar-EG";
  const ar = locale === "ar-EG";

  return (
    <main className="service-error" dir={ar ? "rtl" : "ltr"}>
      <section className="service-error__card" role="alert">
        <span className="service-error__mark" aria-hidden="true">&lt;_</span>
        <h1>{ar ? "الموقع محتاج يحاول يتصل تاني" : "The site needs to reconnect"}</h1>
        <p>
          {ar
            ? "بياناتك محفوظة. الاتصال بالخدمة وقف للحظة، فجرّب تاني من هنا."
            : "Your work is safe. The service connection paused for a moment, so try again here."}
        </p>
        <div className="service-error__actions">
          <button type="button" className="button button--primary" onClick={retry}>
            {ar ? "حاول تاني" : "Try again"}
          </button>
          <Link className="button button--ghost" href={`/${locale}`}>
            {ar ? "ارجع للرئيسية" : "Back home"}
          </Link>
        </div>
      </section>
    </main>
  );
}
