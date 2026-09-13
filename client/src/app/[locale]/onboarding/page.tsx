import { Inter } from "next/font/google";
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { auth } from '@/lib/better-auth';
import { OnboardingForm } from '@/components/onboarding-form';
import { ensureOnboardingState } from '@/lib/auth/account-store';

const inter = Inter({ subsets: ["latin"], variable: "--font-auth", display: "swap" });

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect(`/${locale}/login`);
  const profile = await ensureOnboardingState(session.user.id, locale);
  if (!profile) redirect(`/${locale}/login?error=auth_failed`);
  if (profile.completed) redirect(`/${locale}/learn`);
  return (
    <div className={inter.variable}>
      <OnboardingForm
        locale={locale}
        name={
          profile.name && profile.name !== "Guest"
            ? profile.name
            : session.user.name && session.user.name !== "Guest"
            ? session.user.name
            : ""
        }
        initialAvatar={session.user.image ?? undefined}
      />
    </div>
  );
}
