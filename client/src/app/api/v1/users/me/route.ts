import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { userService } from '@/services/user.service';

const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  bio: z.string().max(300).optional(),
  avatarUrl: z.string().url().optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const profile = await userService.getProfile(user.id);

    return NextResponse.json({
      data: profile,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const statusCode = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status: statusCode });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();

    const parseResult = UpdateProfileSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid payload', details: parseResult.error.flatten() } },
        { status: 400 }
      );
    }

    const updated = await userService.updateProfile(user.id, parseResult.data);

    return NextResponse.json({
      data: updated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const statusCode = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status: statusCode });
  }
}
