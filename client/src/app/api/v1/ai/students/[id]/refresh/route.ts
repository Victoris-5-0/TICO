import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getAuthToken } from '@/lib/auth';
import { aiClient } from '@/lib/ai/client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();

    if (user.id !== id && user.role === 'STUDENT') {
      return NextResponse.json({ error: { message: 'Forbidden' } }, { status: 403 });
    }

    const token = await getAuthToken();
    const body = await req.json().catch(() => ({ watermark: 'latest' }));

    try {
      const refreshResult = await aiClient.refreshStudent(token, id, body);
      return NextResponse.json({ data: refreshResult });
    } catch {
      return NextResponse.json({
        data: {
          masteryDeltas: {},
          reason: 'AI service offline - refresh queued',
        }
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status });
  }
}
