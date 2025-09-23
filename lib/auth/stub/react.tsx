'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from './index';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface SessionContextValue {
  data: Session | null;
  status: AuthStatus;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

let globalRefresh: (() => Promise<void>) | null = null;

async function fetchSession(): Promise<Session | null> {
  const response = await fetch('/api/auth/session', { credentials: 'include' });
  if (!response.ok) {
    return null;
  }
  try {
    const payload = (await response.json()) as { session?: Session | null };
    return payload.session ?? null;
  } catch (error) {
    return null;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const refresh = useCallback(async () => {
    setStatus('loading');
    const nextSession = await fetchSession();
    if (nextSession) {
      setSession(nextSession);
      setStatus('authenticated');
    } else {
      setSession(null);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    globalRefresh = refresh;
    return () => {
      if (globalRefresh === refresh) {
        globalRefresh = null;
      }
    };
  }, [refresh]);

  const value = useMemo<SessionContextValue>(() => ({ data: session, status, refresh }), [session, status, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider.');
  }
  return { data: context.data, status: context.status, update: context.refresh };
}

export async function signIn(provider?: string) {
  const providerId = provider ?? 'google';
  await fetch(`/api/auth/signin/${providerId}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (globalRefresh) {
    await globalRefresh();
  }
  return true;
}

export async function signOut() {
  await fetch('/api/auth/signout', {
    method: 'POST',
    credentials: 'include',
  });
  if (globalRefresh) {
    await globalRefresh();
  }
}
