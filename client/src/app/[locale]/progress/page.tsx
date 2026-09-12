import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AnalysisDashboard } from "@/components/analysis/analysis-dashboard";
import { isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth";
import { getAnalysis } from "@/services/analysis.service";

export const metadata: Metadata = { title: "Progress" };

/**
 * The learner's own view of what the service knows about them.
 *
 * Their own only: `getAnalysis` is called with the signed-in id and never with one from
 * the URL, so there is nothing to tamper with. A teacher view over another student is a
 * separate route with its own authorisation, not a query parameter on this one.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  const analysis = await getAnalysis(user.id);

  return (
    <main className="shell">
      <AnalysisDashboard analysis={analysis} locale={locale} />
    </main>
  );
}
