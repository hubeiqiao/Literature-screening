import '@/lib/config/validateEnv';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getFirestore } from '@/lib/cloud/firestore';
import { getSessionUserId } from '@/lib/auth/session';
import type { TriageRunHistoryEntry, TriageRunRecord } from '@/lib/types';

const MAX_RUNS = 25;

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }

    const userId = getSessionUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'Unable to resolve user identity.' }, { status: 403 });
    }

    if (process.env.SKIP_ENV_VALIDATION === 'true') {
      return NextResponse.json({ runs: [] });
    }

    const firestore = getFirestore();
    const snapshot = await firestore
      .collection('triageRuns')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(MAX_RUNS)
      .get();

    const runs: TriageRunHistoryEntry[] = snapshot.docs.map((doc) =>
      mapRunDocument(doc.id, doc.data() as TriageRunRecord, session),
    );

    return NextResponse.json({ runs });
  } catch (error) {
    console.error('[runs-api] failed to load run history', error);
    return NextResponse.json({ error: 'Failed to load run history.' }, { status: 500 });
  }
}

function mapRunDocument(id: string, data: TriageRunRecord, session: Session): TriageRunHistoryEntry {
  return {
    id,
    userId: data.userId ?? getSessionUserId(session),
    provider: data.provider,
    usageMode: data.usageMode,
    heuristics: data.heuristics,
    decision: data.decision,
    tokenUsage: data.tokenUsage ?? null,
    cost: data.cost ?? null,
    warning: data.warning ?? null,
    timestamp: normalizeTimestamp(data.timestamp),
  };
}

function normalizeTimestamp(value: string | Date | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}
