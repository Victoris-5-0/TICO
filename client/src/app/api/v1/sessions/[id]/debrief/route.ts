import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getAuthToken } from '@/lib/auth';
import { sessionService } from '@/services/session.service';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const token = await getAuthToken();
    const { id: sessionId } = await params;

    const debrief = await sessionService.getSessionDebrief(sessionId, user.id, token);

    return NextResponse.json({
      data: debrief,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message.includes('unauthorized') || message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return GET(_req, { params });
}
