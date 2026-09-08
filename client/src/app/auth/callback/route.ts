import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { isLocale } from '@/i18n/config';
import { accountDestination, provisionGoogleAccount } from '@/lib/auth/entry';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedLocale = searchParams.get('locale');
  const locale = isLocale(requestedLocale ?? '') ? requestedLocale as 'en' | 'ar-EG' : 'ar-EG';
  const localRedirect = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } });
  const failed = () => localRedirect(`/${locale}/login?error=auth_failed`);
  const code = searchParams.get('code');
  if (!code || searchParams.has('error')) return failed();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) return failed();
    const onboarding = await provisionGoogleAccount(data.user, {
      exists: async id => Boolean(await db.user.findUnique({ where: { id }, select: { id: true } })),
      markOnboarding: async () => {
        const { error } = await supabase.auth.updateUser({ data: { onboarding_required: true } });
        if (error) throw new Error('Unable to initialize onboarding');
      },
      createIfMissing: async user => {
        await db.user.upsert({ where: { id: user.id }, update: {}, create: { ...user, role: 'STUDENT' } });
      },
    });
    return localRedirect(accountDestination(locale, onboarding));
  } catch {
    // No raw provider errors or identity data in logs, and no successful redirect on provisioning failure.
    return failed();
  }
}
