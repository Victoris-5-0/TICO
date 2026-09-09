import { z } from 'zod';
import type { Locale } from '@/i18n/config';

export const OnboardingSchema = z.object({
  name: z.string().trim().min(1).max(80),
  ageBand: z.enum(['UNDER_13', 'TEEN', 'ADULT']),
  gender: z.enum(['MALE', 'FEMALE', 'PREFER_NOT_TO_SAY']).optional().default('PREFER_NOT_TO_SAY'),
  avatarUrl: z.string().optional(),
  mode: z.enum(['LEARNER', 'CHALLENGER']),
  locale: z.enum(['en', 'ar-EG']),
});

export function accountDestination(locale: Locale, onboardingRequired: boolean) {
  return `/${locale}/${onboardingRequired ? 'onboarding' : 'learn'}`;
}
