import type { Session } from 'next-auth';

export function getSessionUserId(session: Session | null): string | null {
  if (!session?.user) {
    return null;
  }

  const candidate = session.user as Session['user'] & { id?: unknown };

  if (typeof candidate.id === 'string' && candidate.id.trim().length > 0) {
    return candidate.id;
  }

  if (typeof candidate.email === 'string' && candidate.email.trim().length > 0) {
    return candidate.email;
  }

  if (typeof candidate.name === 'string' && candidate.name.trim().length > 0) {
    return candidate.name;
  }

  return null;
}
