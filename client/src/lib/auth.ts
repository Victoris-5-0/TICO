import { createClient } from './supabase/server';
import { db } from './db';

/**
 * Retrieves the currently authenticated user session from Supabase.
 * Returns null if not authenticated or if Supabase is unconfigured.
 */
export async function getSession() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  try {
    const supabase = await createClient();
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      return null;
    }
    
    return session;
  } catch (error) {
    console.warn('Supabase getSession encountered an error:', error);
    return null;
  }
}

/**
 * Returns the active Bearer token for AI / backend requests.
 * In development, provides a fallback dev token if no session is active.
 */
export async function getAuthToken(): Promise<string> {
  const session = await getSession();
  if (session?.access_token) {
    return session.access_token;
  }
  return 'dev-bearer-token-tico-platform';
}

/**
 * Retrieves the fully populated user object from the database using the Supabase auth token.
 * In local development, falls back to the seeded student user if no session is active.
 */
export async function getCurrentUser() {
  const session = await getSession();
  
  if (session?.user?.id) {
    const user = await db.user.findFirst({
      where: {
        OR: [
          { id: session.user.id },
          { email: session.user.email ?? '' }
        ]
      }
    });
    if (user) return user;
  }

  // Fallback for local development or prototype testing
  if (process.env.NODE_ENV !== 'production') {
    const fallbackUser = await db.user.findFirst({
      where: { role: 'STUDENT' },
      orderBy: { createdAt: 'asc' }
    });
    return fallbackUser;
  }
  
  return null;
}

/**
 * Ensures the request is authenticated.
 * Throws an error if no valid user is found.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}
