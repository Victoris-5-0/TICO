'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/better-auth';
import { db } from '@/lib/db';
import { OnboardingSchema } from '@/lib/auth/entry';

export async function completeOnboarding(input: unknown) {
  const parsed = OnboardingSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid' };
  const { name, ageBand, gender, avatarUrl, mode, locale } = parsed.data;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { error: 'unauthorized' };
    const completedAt = new Date();
    await db.$transaction([
      db.user.update({
        where: { id: session.user.id },
        data: {
          name,
          ...(avatarUrl ? { avatarUrl } : {}),
        },
      }),
      db.studentProfile.upsert({
        where: { userId: session.user.id },
        update: {
          ageBand,
          gender,
          learnerPreference: mode,
          locale,
          onboardingCompletedAt: completedAt,
        },
        create: {
          userId: session.user.id,
          ageBand,
          gender,
          learnerPreference: mode,
          locale,
          onboardingCompletedAt: completedAt,
        },
      }),
    ]);
  } catch {
    return { error: 'save_failed' };
  }
  redirect(`/${locale}/learn`);
}
