import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getAuthToken } from '@/lib/auth';
import { AiServiceError } from '@/lib/ai/client';
import { hintService } from '@/services/hint.service';
import type { Phase } from '@/lib/ai/types';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    }

    const token = await getAuthToken();
    const body = await req.json();

    const exerciseId = body.exerciseId || body.missionId;
    if (!body.sessionId || !exerciseId) {
      return NextResponse.json({ error: { message: 'Invalid request body' } }, { status: 400 });
    }

    const result = await hintService.requestHint({
      userId: user.id,
      sessionId: body.sessionId,
      exerciseId,
      codeExcerpt: body.codeExcerpt || '',
      lastResult: body.lastResult || null,
      locale: body.locale || 'ar-EG',
      // Forwarded rather than defaulted: the AI service rations the ladder by phase and
      // aims the hint at a specific guided step.
      phase: body.phase as Phase | undefined,
      guidedStep: typeof body.guidedStep === 'number' ? body.guidedStep : null,
      errorText: body.errorText || null,
      token,
    });

    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    // The first four phases have no hint ladder. That is a 409, not a failure.
    if (error instanceof AiServiceError && error.status === 409) {
      return NextResponse.json({ error: { message: error.message, code: error.code } }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Hint Error:', message);
    return NextResponse.json({ error: { message: 'Failed to generate hint' } }, { status: 500 });
  }
}
