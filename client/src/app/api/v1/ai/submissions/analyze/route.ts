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

    if (!body.sessionId || !body.attemptNumber || !body.code) {
      return NextResponse.json({ error: { message: 'Invalid request body' } }, { status: 400 });
    }

    const aiResponse = await aiClient.analyzeSubmission(session.access_token, body);
    
    return NextResponse.json({ data: aiResponse });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Analyze Submission Error:', message);
    return NextResponse.json({ error: { message: 'Failed to analyze submission' } }, { status: 500 });
  }
}
