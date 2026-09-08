import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { OnboardingForm } from '@/components/onboarding-form';
const inter = Inter({ subsets: ['latin'], variable: '--font-auth', display: 'swap' });
export const metadata: Metadata = { title: 'Onboarding preview', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <div className={inter.variable}><OnboardingForm locale={locale} name="" preview /></div>;
}
