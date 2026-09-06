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
});

export async function requestHintAction(data: {
  sessionId: string;
  exerciseId: string;
  codeExcerpt?: string;
  lastResult?: 'PASSED' | 'FAILED' | 'ERROR' | 'TIMEOUT' | null;
  locale?: string;
}) {
  try {
    const user = await requireUser();
    const token = await getAuthToken();

    const validated = RequestHintSchema.parse(data);

    const result = await hintService.requestHint({
      userId: user.id,
      sessionId: validated.sessionId,
      exerciseId: validated.exerciseId,
      codeExcerpt: validated.codeExcerpt,
      lastResult: validated.lastResult,
      locale: validated.locale,
      token,
    });

    return { success: true, ...result };
  } catch (error: unknown) {
    console.error('Failed to request hint action:', error);
    return { success: false, error: 'Failed to request hint' };
  }
}
