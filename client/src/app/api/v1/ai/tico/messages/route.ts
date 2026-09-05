import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { aiClient } from '@/lib/ai/client';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.access_token) {
      return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    }

    const body = await req.json();

    // The TICO endpoint expects an SSE stream from the AI backend.
    // We proxy it using a ReadableStream and preserve the response headers.
    const aiResponse = await aiClient.streamTicoMessage(session.access_token, body);

    if (!aiResponse.ok) {
      console.error('AI TICO Message Error:', aiResponse.status);
      return NextResponse.json({ error: { message: 'Failed to stream TICO message' } }, { status: 500 });
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
    console.error('AI TICO Stream Error:', message);
    return NextResponse.json({ error: { message: 'Failed to process TICO message' } }, { status: 500 });
  }
}
