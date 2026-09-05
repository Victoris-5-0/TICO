'use server';

import { z } from 'zod';
import { requireUser, getAuthToken } from '@/lib/auth';
import { submissionService } from '@/services/submission.service';

const SubmitCodeSchema = z.object({
  sessionId: z.string().min(1),
  code: z.string(),
  status: z.enum(['PASSED', 'FAILED', 'ERROR', 'TIMEOUT']),
  output: z.string().default(''),
  durationMs: z.number().nonnegative().default(0),
});

export async function submitCodeAction(data: {
  sessionId: string;
  code: string;
  status: 'PASSED' | 'FAILED' | 'ERROR' | 'TIMEOUT';
  output: string;
  durationMs: number;
}) {
  try {
    const user = await requireUser();
    const token = await getAuthToken();

    const validated = SubmitCodeSchema.parse(data);

    const result = await submissionService.processSubmission(
      user.id,
      validated.sessionId,
      validated.code,
      token,
      {
        status: validated.status,
        output: validated.output,
        durationMs: validated.durationMs,
      }
    );

    return { success: true, ...result };
  } catch (error: unknown) {
    console.error('Failed to process submission action:', error);
    return { success: false, error: 'Failed to process submission' };
  }
}
