import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { companionService } from '@/services/companion.service';

const AppendMessageSchema = z.object({
  lessonId: z.string().nullable().optional(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1, 'Message content cannot be empty'),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const lessonId = searchParams.get('lessonId') || undefined;

    const chat = await companionService.getChatHistory(user.id, lessonId);

    return NextResponse.json({
      data: chat,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const statusCode = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status: statusCode });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();

    const parseResult = AppendMessageSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid payload', details: parseResult.error.flatten() } },
        { status: 400 }
      );
    }

    const { lessonId, role, content } = parseResult.data;

    const updatedChat = await companionService.appendMessage(
      user.id,
      lessonId,
      { role, content }
    );

    return NextResponse.json({
      data: updatedChat,
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const statusCode = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status: statusCode });
  }
}
