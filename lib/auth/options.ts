import GoogleProvider from 'next-auth/providers/google';
import type { NextAuthOptions, Session } from 'next-auth';
import { getValidatedEnv } from '@/lib/config/validateEnv';
import { getFirestore } from '@/lib/cloud/firestore';
import { getSessionUserId } from '@/lib/auth/session';
import { getLedgerBalance, isLedgerEnabled } from '@/lib/billing/ledger';

const env = getValidatedEnv();

const authOptions: NextAuthOptions = {
  secret: env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async session({ session }: { session: Session }) {
      const userId = getSessionUserId(session);
      let managedBalanceCents: number | null = null;

      if (userId && isLedgerEnabled()) {
        try {
          const firestore = getFirestore();
          const snapshot = await getLedgerBalance({ firestore, userId });
          managedBalanceCents = snapshot.balanceCents;
        } catch (error) {
          console.error('[auth] failed to load managed balance for session', error);
        }
      }

      const existingUser = session.user ?? {};
      return {
        ...session,
        user: {
          ...existingUser,
          id: (existingUser as { id?: string }).id ?? userId ?? undefined,
          managedBalanceCents,
        },
      };
    },
  },
};

export { authOptions };
