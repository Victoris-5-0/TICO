import { NextRequest, NextResponse } from 'next/server';
import { userService } from '@/services/user.service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 100) : 20;

    const leaderboard = await userService.getLeaderboard(limit);

    return NextResponse.json({
      data: leaderboard,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('GET /api/v1/leaderboard error:', message);
    return NextResponse.json(
      { error: { message: 'Failed to fetch leaderboard' } },
      { status: 500 }
    );
  }
}
