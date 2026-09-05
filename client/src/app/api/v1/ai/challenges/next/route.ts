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

    // 1. Try AI challenge arena
    try {
      const challenge = await aiClient.getNextChallenge(token, {
        profileId: user.id,
        worldSlug: body.worldSlug,
      });
      return NextResponse.json({ data: challenge });
    } catch {
      // 2. Fallback: Find an advanced/intermediate exercise for challenge mode
      const exercise = await db.exercise.findFirst({
        where: { difficulty: 'INTERMEDIATE' },
        orderBy: { createdAt: 'desc' },
      }) || await db.exercise.findFirst({
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json({
        data: {
          challengeId: exercise?.id || 'challenge-cairo-cross-concept-01',
          title: exercise?.title || 'Cairo Metro Line 2 Rush Hour Optimization',
          instructions: exercise?.instructions || 'Optimize traffic dispatching across multiple metro stations without hints.',
          starterCode: exercise?.starterCode || 'def optimize_dispatch(trains, queue):\n    pass\n',
          targetConcepts: ['loops', 'conditionals', 'functions'],
          isUnscaffolded: true,
          isTemplateFallback: true,
        }
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
