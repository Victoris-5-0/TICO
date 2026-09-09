'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { auth } from '@/lib/better-auth';
import { requireUser } from '@/lib/auth';
import { userService } from '@/services/user.service';
import { classroomService } from '@/services/classroom.service';

const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  bio: z.string().max(300).optional(),
  avatarUrl: z.string().optional(),
});

export async function signOutAction() {
  try {
    await auth.api.signOut({ headers: await headers() });
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to sign out';
    return { success: false, error: message };
  }
}

export async function updateProfileAction(data: {
  name?: string;
  bio?: string;
  avatarUrl?: string;
}) {
  try {
    const user = await requireUser();
    const validated = UpdateProfileSchema.parse(data);
    const updated = await userService.updateProfile(user.id, validated);
    return { success: true, user: updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update profile';
    return { success: false, error: message };
  }
}

export async function joinClassroomAction(joinCode: string) {
  try {
    const user = await requireUser();
    const result = await classroomService.joinClassroom(user.id, joinCode.trim().toUpperCase());
    return { ...result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to join classroom';
    return { success: false, error: message };
  }
}
