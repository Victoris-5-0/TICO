'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { userService } from '@/services/user.service';
import { classroomService } from '@/services/classroom.service';
import { db } from '@/lib/db';

const SignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).default('Explorer'),
  avatarUrl: z.string().optional(),
});

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  bio: z.string().max(300).optional(),
  avatarUrl: z.string().optional(),
});

export async function signUpAction(data: {
  email: string;
  password: string;
  name?: string;
  avatarUrl?: string;
}) {
  try {
    const validated = SignUpSchema.parse(data);
    const supabase = await createClient();

    const { data: authData, error } = await supabase.auth.signUp({
      email: validated.email,
      password: validated.password,
      options: {
        data: {
          full_name: validated.name,
          avatar_url: validated.avatarUrl || '/assets/characters/tico/tico-neutral.webp',
        },
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // Provision in PostgreSQL
    if (authData.user) {
      try {
        await db.user.upsert({
          where: { email: validated.email },
          update: {
            name: validated.name,
            avatarUrl: validated.avatarUrl,
          },
          create: {
            id: authData.user.id,
            email: validated.email,
            name: validated.name,
            avatarUrl: validated.avatarUrl || '/assets/characters/tico/tico-neutral.webp',
            role: 'STUDENT',
            bio: null,
            xp: 0,
            streak: 0,
          },
        });
      } catch (dbErr) {
        console.warn('Database provisioning skipped or offline:', dbErr);
      }
    }

    return { success: true, user: authData.user };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to sign up';
    return { success: false, error: message };
  }
}

export async function signInAction(data: { email: string; password: string }) {
  try {
    const validated = SignInSchema.parse(data);
    const supabase = await createClient();

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: validated.email,
      password: validated.password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, user: authData.user };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to sign in';
    return { success: false, error: message };
  }
}

export async function signOutAction() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
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
