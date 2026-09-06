'use server';

import { z } from 'zod';
import { requireUser, getAuthToken } from '@/lib/auth';
import { sessionService } from '@/services/session.service';
import { Phase, SessionOutcome } from '@prisma/client';

const StartPracticeSchema = z.object({
  exerciseId: z.string().optional().nullable(),
  generatedMissionId: z.string().optional().nullable(),
  lessonId: z.string().optional().nullable(),
});

export async function startPracticeAction(formData: FormData) {
  try {
    const user = await requireUser();
    const token = await getAuthToken();

    const data = {
      exerciseId: (formData.get('exerciseId') as string) || null,
      generatedMissionId: (formData.get('generatedMissionId') as string) || null,
      lessonId: (formData.get('lessonId') as string) || null,
    };

    const validated = StartPracticeSchema.parse(data);

    const session = await sessionService.startOrGetActiveSession({
      userId: user.id,
      exerciseId: validated.exerciseId,
      generatedMissionId: validated.generatedMissionId,
      lessonId: validated.lessonId,
      token,
    });

    return { success: true, session };
  } catch (error: unknown) {
    console.error('Failed to start practice session:', error);
    return { success: false, error: 'Failed to start session' };
  }
}

export async function updateSessionPhaseAction(sessionId: string, phase: Phase) {
  try {
    const user = await requireUser();
    const token = await getAuthToken();

    const session = await sessionService.updateSessionPhase(sessionId, user.id, phase, token);
    return { success: true, session };
  } catch (error: unknown) {
    console.error('Failed to update session phase:', error);
    return { success: false, error: 'Failed to update phase' };
  }
}

export async function completeSessionAction(sessionId: string) {
  try {
    const user = await requireUser();
    const token = await getAuthToken();

    const session = await sessionService.completePracticeSession(sessionId, user.id, token);
    const debrief = await sessionService.getSessionDebrief(sessionId, user.id, token);

    return { success: true, session, debrief };
  } catch (error: unknown) {
    console.error('Failed to complete session:', error);
    return { success: false, error: 'Failed to complete session' };
  }
}
