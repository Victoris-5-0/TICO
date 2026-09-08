import { z } from 'zod';
import type { Locale } from '@/i18n/config';

export const OnboardingSchema = z.object({
  name: z.string().trim().min(1).max(80),
  ageBand: z.enum(['UNDER_13', 'TEEN', 'ADULT']),
  mode: z.enum(['LEARNER', 'CHALLENGER']),
  locale: z.enum(['en', 'ar-EG']),
});

export function accountDestination(locale: Locale, onboardingRequired: boolean) {
  return `/${locale}/${onboardingRequired ? 'onboarding' : 'learn'}`;
}

export type VerifiedIdentity = { id: string; email?: string; user_metadata: Record<string, unknown> };
type ProvisioningStore = {
  exists: (id: string) => Promise<boolean>;
  createIfMissing: (user: { id: string; email: string; name: string; avatarUrl: string }) => Promise<void>;
  markOnboarding: () => Promise<void>;
};

/** Call only with an identity verified by Supabase. Never match accounts by email. */
export async function provisionGoogleAccount(user: VerifiedIdentity, store: ProvisioningStore) {
  if (!user.email) throw new Error('Missing verified email');
  const exists = await store.exists(user.id);
  if (exists) return user.user_metadata.onboarding_required === true;
  // Persist before provisioning so retries and interrupted onboarding retain the flag.
  await store.markOnboarding();
  await store.createIfMissing({
    id: user.id,
    email: user.email,
    name: typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name.slice(0, 80) : 'Explorer',
    avatarUrl: '/assets/characters/tico/tico-neutral.webp',
  });
  return true;
}
