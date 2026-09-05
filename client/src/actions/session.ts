'use server';

import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { sessionService } from '@/services/session.service';

const StartPracticeSchema = z.object({
  exerciseId: z.string().min(1),
});

export async function startPracticeAction(formData: FormData) {
  try {
    const user = await requireUser();

    const data = {
      exerciseId: formData.get('exerciseId') as string,
    };

    const validated = StartPracticeSchema.parse(data);

    const session = await sessionService.startOrGetActiveSession(
      user.id,
      validated.exerciseId
    );

    return { success: true, session };
  } catch (error: unknown) {
    console.error('Failed to start practice session:', error);
    return { success: false, error: 'Failed to start session' };
  }
}
