import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { gameService } from '@/services/game.service';

export async function GET() {
  try {
    const user = await getCurrentUser();
    const items = await gameService.getItems(user?.id);

    return NextResponse.json({
      data: items,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
