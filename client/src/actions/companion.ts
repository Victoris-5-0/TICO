'use server';

import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { companionService } from '@/services/companion.service';

const AppendMessageSchema = z.object({
  lessonId: z.string().nullable().optional(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
});

export async function getChatHistoryAction(lessonId?: string | null) {
  try {
    const user = await requireUser();
    const history = await companionService.getChatHistory(user.id, lessonId);
    return { success: true, history };
  } catch (error: unknown) {
    console.error('Failed to get chat history:', error);
    return { success: false, error: 'Failed to get chat history' };
  }
}

export async function appendMessageAction(data: {
  lessonId?: string | null;
  role: 'user' | 'assistant';
  content: string;
}) {
  try {
    const user = await requireUser();
    const validated = AppendMessageSchema.parse(data);

    const chat = await companionService.appendMessage(user.id, validated.lessonId, {
      role: validated.role,
      content: validated.content,
    });

    return { success: true, chat };
  } catch (error: unknown) {
    console.error('Failed to append companion message:', error);
    return { success: false, error: 'Failed to send message' };
  }
}
