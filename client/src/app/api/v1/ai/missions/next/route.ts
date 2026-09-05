import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getAuthToken } from '@/lib/auth';
import { aiClient } from '@/lib/ai/client';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    }

    const token = await getAuthToken();
    const body = await req.json();

    if (!body.lessonId) {
      return NextResponse.json({ error: { message: 'lessonId is required' } }, { status: 400 });
    }

    // Try AI generation
    try {
      const aiResponse = await aiClient.getNextMission(token, {
        lessonId: body.lessonId,
        worldManifestVersion: body.worldManifestVersion || '1.0.0',
      });
      return NextResponse.json({ data: aiResponse });
    } catch {
      // Fallback: Return first uncompleted or template exercise from DB for this lesson
      const exercise = await db.exercise.findFirst({
        where: { lessonId: body.lessonId },
        orderBy: { order: 'asc' },
      });

      return NextResponse.json({
        data: {
          missionId: exercise?.id ?? '',
          isTemplateFallback: true,
          manifestVersion: '1.0.0',
        }
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
