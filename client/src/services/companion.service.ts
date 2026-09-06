import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export class CompanionService {
  /**
   * Retrieves or initializes the companion chat conversation for a student and optional lesson.
   */
  async getChatHistory(userId: string, lessonId?: string | null) {
    const chat = await db.companionChat.findFirst({
      where: {
        userId,
        lessonId: lessonId || null,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!chat) {
      return {
        id: null,
        userId,
        lessonId: lessonId || null,
        messages: [] as ChatMessage[],
      };
    }

    const messages = Array.isArray(chat.messages) ? (chat.messages as unknown as ChatMessage[]) : [];

    return {
      id: chat.id,
      userId: chat.userId,
      lessonId: chat.lessonId,
      messages,
      updatedAt: chat.updatedAt,
    };
  }

  /**
   * Appends a message to the companion chat conversation.
   */
  async appendMessage(
    userId: string,
    lessonId: string | null | undefined,
    message: { role: 'user' | 'assistant'; content: string }
  ) {
    const existing = await db.companionChat.findFirst({
      where: {
        userId,
        lessonId: lessonId || null,
      },
    });

    const newMessage: ChatMessage = {
      role: message.role,
      content: message.content,
      timestamp: new Date().toISOString(),
    };

    if (existing) {
      const currentMessages = Array.isArray(existing.messages)
        ? (existing.messages as unknown as ChatMessage[])
        : [];
      const updatedMessages = [...currentMessages, newMessage];

      return db.companionChat.update({
        where: { id: existing.id },
        data: {
          messages: updatedMessages as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return db.companionChat.create({
      data: {
        userId,
        lessonId: lessonId || null,
        messages: [newMessage] as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

export const companionService = new CompanionService();
