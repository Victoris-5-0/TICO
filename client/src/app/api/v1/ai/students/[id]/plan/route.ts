import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getAuthToken } from '@/lib/auth';
import { planService } from '@/services/plan.service';

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
    const body = await req.json().catch(() => ({ isBeginner: true }));

    const plan = await planService.buildStudentPlan(id, token, body);

    return NextResponse.json({ data: plan });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();

    if (user.id !== id && user.role === 'STUDENT') {
      return NextResponse.json({ error: { message: 'Forbidden' } }, { status: 403 });
    }

    const plan = await planService.getStudentPlan(id);

    return NextResponse.json({ data: plan });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status });
  }
}
