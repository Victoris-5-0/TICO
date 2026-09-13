import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();

export async function signInAsGuest() {
  const res = await fetch('/api/auth/sign-in/guest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to sign in as guest');
  }
  return res.json();
}
