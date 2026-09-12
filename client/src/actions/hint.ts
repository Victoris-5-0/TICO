'use server';

import { z } from 'zod';
import { requireUser, getAuthToken } from '@/lib/auth';
import { hintService } from '@/services/hint.service';

const RequestHintSchema = z.object({
  sessionId: z.string().min(1),
  exerciseId: z.string().min(1),
  codeExcerpt: z.string().default(''),
  lastResult: z.enum(['PASSED', 'FAILED', 'ERROR', 'TIMEOUT']).nullable().default(null),
  locale: z.string().default('ar-EG'),
  // The AI service rations the ladder by phase and aims the hint at a guided step.
  // Optional here because a caller that genuinely does not know lets the service default.
  phase: z
    .enum(['ENCOUNTER', 'EXPLORE', 'DISCOVER', 'UNDERSTAND', 'GUIDED_CODING', 'ADAPT_REMIX', 'INDEPENDENT'])
    .optional(),
  guidedStep: z.number().int().min(0).nullable().default(null),
  errorText: z.string().max(8000).nullable().default(null),
});

export async function requestHintAction(data: z.input<typeof RequestHintSchema>) {
  try {
    const user = await requireUser();
    const token = await getAuthToken();

    const validated = RequestHintSchema.parse(data);

    const result = await hintService.requestHint({
      userId: user.id,
      token,
      ...validated,
    });

    return { success: true, ...result };
  } catch (error: unknown) {
    console.error('Failed to request hint action:', error);
    return { success: false, error: 'Failed to request hint' };
  }
}
