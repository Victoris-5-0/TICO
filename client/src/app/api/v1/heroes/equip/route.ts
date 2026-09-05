import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { gameService } from '@/services/game.service';

const EquipHeroSchema = z.object({
  heroId: z.string().min(1, 'heroId is required'),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();

    const parseResult = EquipHeroSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid payload', details: parseResult.error.flatten() } },
        { status: 400 }
      );
    }

    const result = await gameService.equipHero(user.id, parseResult.data.heroId);

    return NextResponse.json({
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message === 'Unauthorized' ? 401 : 400;
    return NextResponse.json({ error: { message } }, { status });
  }
}
