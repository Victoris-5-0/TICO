import { Inter } from "next/font/google";
import { notFound, redirect } from "next/navigation";
import { AccountForm } from "@/components/account-form";
import { isLocale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { accountDestination } from "@/lib/auth/entry";

const inter = Inter({ subsets: ["latin"], variable: "--font-auth", display: "swap" });

export default async function LoginPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { error } = await searchParams;
  let destination: string | undefined;
  let failed = Boolean(error);
  if (!failed && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const profile = await db.user.findUnique({ where: { id: user.id }, select: { id: true } });
        if (profile) destination = accountDestination(locale, user.user_metadata.onboarding_required === true);
      }
    } catch { failed = true; }
  }
  if (destination) redirect(destination);
  return <div className={inter.variable}><AccountForm locale={locale} authFailed={failed} /></div>;
}
