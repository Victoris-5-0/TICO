import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/ar-EG/learn';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // Just-in-time provisioning in PostgreSQL
      try {
        await db.user.upsert({
          where: { email: data.user.email! },
          update: {
            name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
            avatarUrl: data.user.user_metadata?.avatar_url,
          },
          create: {
            id: data.user.id,
            email: data.user.email!,
            name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Explorer',
            avatarUrl: data.user.user_metadata?.avatar_url || '/assets/characters/tico/tico-neutral.webp',
            role: 'STUDENT',
            xp: 0,
            streak: 0,
          },
        });
      } catch (dbErr) {
        console.warn('JIT user provisioning during auth callback skipped:', dbErr);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/ar-EG?error=auth_failed`);
}
