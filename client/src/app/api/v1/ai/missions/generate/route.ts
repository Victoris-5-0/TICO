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
    const body = await req.json().catch(() => ({}));

    // 1. Attempt AI Mission Generation (Graph: generate -> validate -> repair)
    try {
      const aiMission = await aiClient.generateMission(token, {
        lessonId: body.lessonId,
        concept: body.concept,
        worldManifestVersion: body.worldManifestVersion || '1.0.0',
        scaffoldLevel: body.scaffoldLevel || 'PARTIAL',
        locale: body.locale || user.role === 'STUDENT' ? 'ar-EG' : 'en',
      });
      return NextResponse.json({ data: aiMission });
    } catch {
      // 2. Resilient Template Fallback: If AI is offline or rejected, retrieve template exercise
      let exercise = null;
      if (body.lessonId) {
        exercise = await db.exercise.findFirst({
          where: { lessonId: body.lessonId },
          orderBy: { order: 'asc' },
        });
      }

      if (!exercise) {
        exercise = await db.exercise.findFirst({
          orderBy: { createdAt: 'asc' },
        });
      }

      const testCases = (exercise?.testCases as Array<{ input: string; expectedOutput: string; isHidden?: boolean }>) || [
        { input: 'calculate_revenue(10, 8)', expectedOutput: '80', isHidden: false }
      ];

      return NextResponse.json({
        data: {
          missionId: exercise?.id || 'mission-cairo-metro-fallback-01',
          title: exercise?.title || 'Cairo Metro Revenue Calculation',
          instructions: exercise?.instructions || 'Write a function to calculate passenger fares.',
          starterCode: exercise?.starterCode || 'def calculate_revenue(passengers, price):\n    pass\n',
          testCases: testCases.filter((tc) => !tc.isHidden),
          hints: exercise?.hints || [
            'Multiply passengers by ticket price.',
            'Return the final integer result.'
          ],
          concepts: {
            primary: body.concept || 'variables',
            carried: ['arithmetic']
          },
          scaffoldPlan: { level: body.scaffoldLevel || 'PARTIAL', hintsAvailable: 4 },
          validated: true,
          engineVersion: '1.0.0',
          isTemplateFallback: true,
        }
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
