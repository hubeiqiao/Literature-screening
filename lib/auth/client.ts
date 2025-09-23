'use client';

import { useCallback } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';

export function useAuth() {
  const { data, status, update } = useSession();
  const isAuthenticated = status === 'authenticated';
  const isLoading = status === 'loading';
  const user = data?.user ?? null;
  const managedBalanceCents =
    user && typeof (user as { managedBalanceCents?: unknown }).managedBalanceCents === 'number'
      ? ((user as { managedBalanceCents: number }).managedBalanceCents as number)
      : null;

  const handleSignIn = useCallback((provider = 'google') => signIn(provider), []);
  const handleSignOut = useCallback(() => signOut(), []);

  return {
    session: data ?? null,
    user,
    status,
    isAuthenticated,
    isLoading,
    managedBalanceCents,
    signIn: handleSignIn,
    signOut: handleSignOut,
    refresh: update,
  };
}
