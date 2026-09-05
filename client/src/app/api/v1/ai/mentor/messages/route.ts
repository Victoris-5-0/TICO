import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken } from '@/lib/auth';
import { aiClient } from '@/lib/ai/client';

export async function POST(req: NextRequest) {
  try {
    const token = await getAuthToken();
    const body = await req.json();

    // The mentor messages endpoint expects an SSE stream from the AI backend.
    const aiResponse = await aiClient.streamMentorMessage(token, body);

    if (!aiResponse.ok) {
      console.error('AI Mentor Message Error:', aiResponse.status);
      return NextResponse.json({ error: { message: 'Failed to stream mentor message' } }, { status: 500 });
    }

    // Forward the SSE response directly to the client
    return new NextResponse(aiResponse.body, {
      status: aiResponse.status,
      headers: {
        'Content-Type': aiResponse.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Mentor Stream Error:', message);
    return NextResponse.json({ error: { message: 'Failed to process mentor message' } }, { status: 500 });
  }
}
