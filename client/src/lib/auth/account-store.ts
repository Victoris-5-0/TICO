import 'server-only';

import type { Locale } from '@/i18n/config';
import { db } from '@/lib/db';

/** Ensures every Better Auth user has the application profile used by onboarding. */
export async function ensureOnboardingState(userId: string, locale: Locale) {
  return db.$transaction(async (tx) => {
    const account = await tx.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!account) return null;

    const profile = await tx.studentProfile.upsert({
      where: { userId },
      update: {},
      create: { userId, locale },
      select: { onboardingCompletedAt: true },
    });

    return {
      name: account.name,
      completed: profile.onboardingCompletedAt !== null,
    };
  });
}

export async function getOnboardingState(userId: string) {
  const account = await db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      studentProfile: { select: { onboardingCompletedAt: true } },
    },
  });

  if (!account) return null;
  return {
    name: account.name,
    completed: Boolean(account.studentProfile?.onboardingCompletedAt),
  };
}
