import { notFound } from "next/navigation";
import { AccountForm } from "@/components/account-form";
import { isLocale } from "@/i18n/config";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AccountForm locale={locale} mode="login" />;
}
