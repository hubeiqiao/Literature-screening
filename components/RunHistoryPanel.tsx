'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/client';
import type { TriageRunCost, TriageRunHistoryEntry, TokenUsageBreakdown } from '@/lib/types';

type FetchState = 'idle' | 'loading' | 'success' | 'error';

export function RunHistoryPanel() {
  const { isAuthenticated } = useAuth();
  const [runs, setRuns] = useState<TriageRunHistoryEntry[]>([]);
  const [status, setStatus] = useState<FetchState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) {
      setRuns([]);
      setStatus('idle');
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    const fetchRuns = async () => {
      setStatus('loading');
      setError(null);
      try {
        const response = await fetch('/api/runs', { method: 'GET' });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: 'Unable to load run history.' }));
          throw new Error(payload.error || 'Unable to load run history.');
        }
        const payload = (await response.json()) as { runs?: TriageRunHistoryEntry[] };
        if (cancelled) {
          return;
        }
        setRuns(payload.runs ?? []);
        setStatus('success');
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Unable to load run history.');
        setStatus('error');
      }
    };

    void fetchRuns();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Recent managed runs</p>
          <p className="text-xs text-slate-600">
            Review the last {runs.length > 0 ? runs.length : 'few'} managed triage passes, including token usage and rule counts.
          </p>
        </div>
      </header>
      {status === 'loading' && <p className="mt-3 text-xs text-slate-600">Loading your run history…</p>}
      {status === 'error' && error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      {status === 'success' && runs.length === 0 && (
        <p className="mt-3 text-xs text-slate-600">No managed triage runs recorded yet. Start a pass to see history here.</p>
      )}
      {runs.length > 0 && (
        <ul className="mt-4 space-y-3">
          {runs.map((run) => (
            <li key={run.id} className="rounded border border-slate-200 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {run.decision.status} • {formatProvider(run.provider)} ({run.usageMode})
                  </p>
                  <p className="text-xs text-slate-500">{formatTimestamp(run.timestamp)}</p>
                </div>
                <div className="text-xs text-slate-600">
                  <p>
                    Tokens: {formatTokenUsage(run.tokenUsage)}
                  </p>
                  <p>
                    Cost: {formatCost(run.cost)}
                  </p>
                  <p>
                    Rules: {run.heuristics.inclusion.length} inclusion / {run.heuristics.exclusion.length} exclusion
                  </p>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                <p className="font-medium text-slate-700">Model</p>
                <p className="text-slate-600">{run.decision.model ?? 'Unknown model'}</p>
                {run.warning && <p className="mt-1 text-amber-700">Warning: {run.warning}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatProvider(provider: TriageRunHistoryEntry['provider']): string {
  if (provider === 'openrouter') {
    return 'OpenRouter';
  }
  return 'Gemini';
}

function formatTokenUsage(usage: TokenUsageBreakdown | null): string {
  if (!usage) {
    return 'not reported';
  }
  const parts: string[] = [];
  if (typeof usage.promptTokens === 'number') {
    parts.push(`${usage.promptTokens} prompt`);
  }
  if (typeof usage.completionTokens === 'number') {
    parts.push(`${usage.completionTokens} completion`);
  }
  if (typeof usage.totalTokens === 'number') {
    parts.push(`${usage.totalTokens} total`);
  }
  return parts.length > 0 ? parts.join(' • ') : 'not reported';
}

function formatCost(cost: TriageRunCost | null | undefined): string {
  if (!cost) {
    return 'not recorded';
  }
  const actualCents =
    typeof cost.actualCents === 'number' && Number.isFinite(cost.actualCents)
      ? Math.max(0, cost.actualCents)
      : null;
  const estimatedCents =
    typeof cost.estimatedCents === 'number' && Number.isFinite(cost.estimatedCents)
      ? Math.max(0, cost.estimatedCents)
      : null;

  const formatDollars = (valueCents: number) => `$${(valueCents / 100).toFixed(2)}`;

  if (actualCents !== null && estimatedCents !== null && actualCents !== estimatedCents) {
    return `${formatDollars(actualCents)} (est. ${formatDollars(estimatedCents)})`;
  }
  if (actualCents !== null) {
    return formatDollars(actualCents);
  }
  if (estimatedCents !== null) {
    return `est. ${formatDollars(estimatedCents)}`;
  }
  return 'not recorded';
}
