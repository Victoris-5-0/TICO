'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { OnboardingSchema } from '@/lib/auth/entry';

export async function completeOnboarding(input: unknown) {
  const parsed = OnboardingSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid' };
  const { name, ageBand, mode, locale } = parsed.data;
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { error: 'unauthorized' };
    // No development fallback: the verified subject owns this profile.
    await db.user.update({ where: { id: user.id }, data: { name } });
    const { error: updateError } = await supabase.auth.updateUser({ data: {
      full_name: name, age_band: ageBand, learner_mode: mode, locale,
      onboarding_required: false, onboarding_completed: true,
    } });
    if (updateError) return { error: 'save_failed' };
  } catch {
    return { error: 'save_failed' };
  }
  redirect(`/${locale}/learn`);
}
