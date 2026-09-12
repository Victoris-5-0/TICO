import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AccountForm } from "@/components/account-form";
import { isLocale } from "@/i18n/config";
import { auth } from "@/lib/better-auth";
import { accountDestination } from "@/lib/auth/entry";
import { getOnboardingState } from "@/lib/auth/account-store";

const inter = Inter({ subsets: ["latin"], variable: "--font-auth", display: "swap" });

export default async function LoginPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { error } = await searchParams;
  let destination: string | undefined;
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) {
    const account = await getOnboardingState(session.user.id);
    destination = accountDestination(locale, !account?.completed);
  }
  if (destination) redirect(destination);
  return <div className={inter.variable}><AccountForm locale={locale} authFailed={Boolean(error)} /></div>;
}
