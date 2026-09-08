import { Inter } from "next/font/google";
import { notFound, redirect } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { OnboardingForm } from '@/components/onboarding-form';

const inter = Inter({ subsets: ["latin"], variable: "--font-auth", display: "swap" });

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  let profile: { name: string | null } | null = null;
  let authenticated = false;
  let required = false;
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (user && !error) {
      authenticated = true;
      required = user.user_metadata.onboarding_required === true;
      profile = await db.user.findUnique({ where: { id: user.id }, select: { name: true } });
    }
  } catch { /* Login displays a recoverable error for unavailable dependencies. */ }
  if (!authenticated) redirect(`/${locale}/login`);
  if (!profile) redirect(`/${locale}/login?error=auth_failed`);
  if (!required) redirect(`/${locale}/learn`);
  return <div className={inter.variable}><OnboardingForm locale={locale} name={profile.name ?? ''} /></div>;
}
