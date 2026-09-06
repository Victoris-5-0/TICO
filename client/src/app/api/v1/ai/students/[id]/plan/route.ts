import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getAuthToken } from '@/lib/auth';
import { aiClient } from '@/lib/ai/client';
import { db } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();

    // Verify student ownership or teacher/admin role
    if (user.id !== id && user.role === 'STUDENT') {
      return NextResponse.json({ error: { message: 'Forbidden' } }, { status: 403 });
    }

    const token = await getAuthToken();
    const body = await req.json().catch(() => ({}));

    try {
      const plan = await aiClient.getStudentPlan(token, id, body);
      return NextResponse.json({ data: plan });
    } catch {
      // Fallback: Return all track lessons as required
      const allLessons = await db.lesson.findMany({
        select: { id: true },
        orderBy: { order: 'asc' }
      });

      return NextResponse.json({
        data: {
          requiredLessons: allLessons.map((l) => l.id),
          optionalLessons: [],
        }
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status });
  }
}
