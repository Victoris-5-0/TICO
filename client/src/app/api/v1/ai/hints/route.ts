import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getAuthToken } from '@/lib/auth';
import { hintService } from '@/services/hint.service';

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
      token,
    });
    
    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Hint Error:', message);
    return NextResponse.json({ error: { message: 'Failed to generate hint' } }, { status: 500 });
  }
}
