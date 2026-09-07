'use server';

import { requireUser, getAuthToken } from '@/lib/auth';
import { missionService } from '@/services/mission.service';

export async function getNextMissionAction(data: { lessonId: string; forceRegenerate?: boolean }) {
  try {
    const user = await requireUser();
    const token = await getAuthToken();

    const mission = await missionService.getNextMission(
      user.id,
      data.lessonId,
      token,
      { forceRegenerate: data.forceRegenerate }
    );

    return { success: true, mission };
  } catch (error: unknown) {
    console.error('Failed to get next mission:', error);
    return { success: false, error: 'Failed to get next mission' };
  }
}
