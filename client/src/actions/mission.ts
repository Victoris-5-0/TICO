'use server';

import { requireUser, getAuthToken } from '@/lib/auth';
import { AiServiceError } from '@/lib/ai/client';
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

export async function startLessonMissionAction(data: {
  worldSlug: string;
  lessonSlug: string;
  forceRegenerate?: boolean;
  requireLive?: boolean;
}) {
  try {
    const { getCurrentUser, getAuthToken } = await import('@/lib/auth');
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'unauthenticated' };
    }
    const { db } = await import('@/lib/db');
    const lesson = await db.lesson.findFirst({
      where: { slug: data.lessonSlug, track: { slug: data.worldSlug } },
      select: { id: true },
    });
    if (!lesson) {
      return { success: false, error: 'unknown-lesson' };
    }

    let token = '';
    try {
      token = await getAuthToken();
    } catch {
      // A missing token only costs the AI-service path; the pre-generated pool still works.
    }

    const requireLive = data.worldSlug === 'isharet-cairo' && data.requireLive === true;
    const missionId = await missionService.startForLesson({
      userId: user.id,
      worldSlug: data.worldSlug,
      lessonSlug: data.lessonSlug,
      lessonId: lesson.id,
      token,
      forceRegenerate: data.forceRegenerate,
      requireLive,
    });

    if (!missionId) {
      return { success: false, error: requireLive ? 'live-unavailable' : 'no-mission' };
    }

    return { success: true, missionId };
  } catch (error: unknown) {
    console.error('Failed to start lesson mission:', error);
    if (data.worldSlug === 'isharet-cairo' && data.requireLive) {
      return { success: false, error: error instanceof AiServiceError && error.status === 404
        ? 'live-not-ready'
        : 'live-unavailable' };
    }
    return { success: false, error: error instanceof Error ? error.message : 'failed' };
  }
}

