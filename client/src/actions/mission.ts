'use server';

import { requireUser, getAuthToken } from '@/lib/auth';
import { aiClient } from '@/lib/ai/client';
import { db } from '@/lib/db';

export async function getNextMissionAction(data: { lessonId: string }) {
  try {
    // Still the auth guard — it throws when there is no session. The id itself is not
    // passed on: the AI service derives the student from the verified JWT.
    await requireUser();
    const token = await getAuthToken();

    try {
      const nextMission = await aiClient.getNextMission(token, {
        lessonId: data.lessonId,
        worldManifestVersion: '1.0.0'
      });
      return { success: true, mission: nextMission };
    } catch {
      const fallbackExercise = await db.exercise.findFirst({
        where: { lessonId: data.lessonId },
        orderBy: { order: 'asc' }
      });
      return {
        success: true,
        mission: {
          missionId: fallbackExercise?.id ?? '',
          isTemplateFallback: true,
          manifestVersion: '1.0.0'
        }
      };
    }
  } catch (error: unknown) {
    console.error('Failed to get next mission:', error);
    return { success: false, error: 'Failed to get next mission' };
  }
}
