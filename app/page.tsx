'use client';

import { useEffect, useState } from 'react';
import { AccountBanner } from '@/components/AccountBanner';
import { FileUploader } from '@/components/FileUploader';
import { SummaryCards } from '@/components/SummaryCards';
import { DecisionTable } from '@/components/DecisionTable';
import { ExportButtons } from '@/components/ExportButtons';
import { CriteriaEditor } from '@/components/CriteriaEditor';
import { TriageProgress } from '@/components/TriageProgress';
import { ModelCredentialsForm, type Provider, type ReasoningEffort } from '@/components/ModelCredentialsForm';
import { RunHistoryPanel } from '@/components/RunHistoryPanel';
import { useAuth } from '@/lib/auth/client';
import { parseBibtex } from '@/lib/bibtexParser';
import { buildCriteriaFromText, getDefaultCriteriaText } from '@/lib/criteria';
import { summarizeDecisions } from '@/lib/triage';
import type { BibEntry, TriageDecision, TriageSummary } from '@/lib/types';
import {
  DEFAULT_OPENROUTER_MODEL_ID,
  getOpenRouterModel,
  type OpenRouterModelId,
} from '@/lib/openrouter';
import type { UsageMode } from '@/lib/usageMode';

export default function HomePage() {
  const { isAuthenticated, status: authStatus, managedBalanceCents, refresh: refreshSession } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<BibEntry[]>([]);
  const [decisions, setDecisions] = useState<TriageDecision[]>([]);
  const [summary, setSummary] = useState<TriageSummary>({ total: 0, byStatus: {} });
  const [inclusionText, setInclusionText] = useState(() => getDefaultCriteriaText().inclusion);
  const [exclusionText, setExclusionText] = useState(() => getDefaultCriteriaText().exclusion);
  const [criteriaError, setCriteriaError] = useState<string | null>(null);
  const [isTriageRunning, setIsTriageRunning] = useState(false);
  const [provider, setProvider] = useState<Provider>('openrouter');
  const [usageMode, setUsageMode] = useState<UsageMode>('byok');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [openRouterModel, setOpenRouterModel] = useState<OpenRouterModelId>(DEFAULT_OPENROUTER_MODEL_ID);
  const [openRouterDataPolicy, setOpenRouterDataPolicy] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() =>
    getOpenRouterModel(DEFAULT_OPENROUTER_MODEL_ID).supportsReasoning ? 'high' : 'none',
  );
  const [warnings, setWarnings] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number; status: 'idle' | 'running' | 'finished' | 'error' }>(
    {
      current: 0,
      total: 0,
      status: 'idle',
    },
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const storedMode = window.localStorage.getItem('literature-screening:usage-mode');
    if (storedMode === 'byok' || storedMode === 'managed') {
      setUsageMode(storedMode);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem('literature-screening:usage-mode', usageMode);
  }, [usageMode]);

  useEffect(() => {
    if (authStatus === 'loading') {
      return;
    }
    const hasCredits = managedBalanceCents == null || managedBalanceCents > 0;
    if (!isAuthenticated || !hasCredits) {
      setUsageMode((current) => (current === 'managed' ? 'byok' : current));
    }
  }, [authStatus, isAuthenticated, managedBalanceCents]);

  useEffect(() => {
    if (provider !== 'openrouter' && usageMode !== 'byok') {
      setUsageMode('byok');
    }
  }, [provider, usageMode]);

  const handleUpload = async (file: File) => {
    if (isTriageRunning) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseBibtex(text);
      if (parsed.length === 0) {
        throw new Error('No entries found in BibTeX file.');
      }
      setEntries(parsed);
      setDecisions([]);
      setSummary({ total: 0, byStatus: {} });
      setProgress({ current: 0, total: parsed.length, status: 'idle' });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Unexpected error.');
      setEntries([]);
      setDecisions([]);
      setSummary({ total: 0, byStatus: {} });
      setProgress({ current: 0, total: 0, status: 'idle' });
    } finally {
      setIsLoading(false);
    }
  };

  const runSequentialTriage = async () => {
    if (entries.length === 0) {
      setError('Upload a BibTeX file before running triage.');
      return;
    }
    if (provider === 'openrouter') {
      if (usageMode === 'byok' && !openRouterKey.trim()) {
        setError('Provide an OpenRouter API key before running triage.');
        return;
      }
      if (usageMode === 'managed') {
        if (authStatus === 'loading') {
          setError('Confirm your Google sign-in before using managed OpenRouter mode.');
          return;
        }
        if (!isAuthenticated) {
          setError('Sign in with Google to use the managed OpenRouter key.');
          return;
        }
        if (managedBalanceCents !== null && managedBalanceCents <= 0) {
          setError('Add managed credits before running triage with the hosted key.');
          return;
        }
      }
    }
    if (provider === 'gemini' && !geminiKey.trim()) {
      setError('Provide a Gemini API key before running triage.');
      return;
    }
    if (!inclusionText.trim()) {
      setCriteriaError('Add at least one inclusion rule.');
      return;
    }
    if (!exclusionText.trim()) {
      setCriteriaError('Add at least one exclusion rule.');
      return;
    }

    const heuristics = buildCriteriaFromText({ inclusion: inclusionText, exclusion: exclusionText });
    if (heuristics.inclusion.length === 0) {
      setCriteriaError('Add at least one inclusion rule.');
      return;
    }
    if (heuristics.exclusion.length === 0) {
      setCriteriaError('Add at least one exclusion rule.');
      return;
    }
    setCriteriaError(null);

    setIsTriageRunning(true);
    setError(null);
    setDecisions([]);
    setSummary({ total: 0, byStatus: {} });
    setWarnings([]);
    setProgress({ current: 0, total: entries.length, status: 'running' });

    const collected: TriageDecision[] = [];

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      setProgress({ current: index + 1, total: entries.length, status: 'running' });

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (provider === 'openrouter') {
          const dataPolicyHeader = openRouterDataPolicy.trim();
          if (usageMode === 'byok') {
            headers['X-OpenRouter-Key'] = openRouterKey.trim();
          }
          if (dataPolicyHeader) {
            headers['X-OpenRouter-Data-Policy'] = dataPolicyHeader;
          }
        } else {
          headers['X-Gemini-Key'] = geminiKey.trim();
        }

        const response = await fetch('/api/triage', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            entry,
            instructions: {
              inclusion: inclusionText,
              exclusion: exclusionText,
            },
            heuristics,
            provider,
            ...(provider === 'openrouter'
              ? { usageMode, reasoning: reasoningEffort, model: openRouterModel }
              : {}),
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(payload.error || 'Failed to triage entry.');
        }

        const payload = await response.json();
        const decision: TriageDecision = payload.decision;
        collected.push(decision);
        setDecisions([...collected]);
        setSummary(summarizeDecisions(collected));
        if (payload.warning) {
          setWarnings((prev) => (prev.includes(payload.warning) ? prev : [...prev, payload.warning]));
        }
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Unexpected error while calling the LLM.');
        setProgress({ current: index + 1, total: entries.length, status: 'error' });
        if (provider === 'openrouter' && usageMode === 'managed') {
          void refreshSession();
        }
        setIsTriageRunning(false);
        return;
      }
    }

    setProgress({ current: entries.length, total: entries.length, status: 'finished' });
    if (provider === 'openrouter' && usageMode === 'managed') {
      void refreshSession();
    }
    setIsTriageRunning(false);
  };

  const includes = summary.byStatus.Include || 0;
  const excludes = summary.byStatus.Exclude || 0;
  const maybes = summary.byStatus.Maybe || 0;

  const openRouterKeyMissing = !openRouterKey.trim();
  const geminiKeyMissing = !geminiKey.trim();
  const requiresOpenRouterKey =
    provider === 'openrouter' && usageMode === 'byok' && openRouterKeyMissing;
  const managedModeBlocked =
    provider === 'openrouter' && usageMode === 'managed' && (authStatus === 'loading' || !isAuthenticated);

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Literature Screening Assistant</h1>
        <p className="text-sm text-slate-600">
          Import a Zotero-exported BibTeX file, configure the rules you care about, and run an AI triage pass powered by your
          chosen provider one record at a time.
        </p>
      </header>

      <AccountBanner />
      <RunHistoryPanel />

      <FileUploader onUpload={handleUpload} isLoading={isLoading} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ModelCredentialsForm
        provider={provider}
        onProviderChange={setProvider}
        usageMode={usageMode}
        onUsageModeChange={setUsageMode}
                isManagedAvailable={Boolean(
                  isAuthenticated && managedBalanceCents !== null && managedBalanceCents > 0,
                )}
        authStatus={authStatus}
        openRouterKey={openRouterKey}
        onOpenRouterKeyChange={setOpenRouterKey}
        openRouterModel={openRouterModel}
        onOpenRouterModelChange={setOpenRouterModel}
        openRouterDataPolicy={openRouterDataPolicy}
        onOpenRouterDataPolicyChange={setOpenRouterDataPolicy}
        geminiKey={geminiKey}
        onGeminiKeyChange={setGeminiKey}
        reasoningEffort={reasoningEffort}
        onReasoningEffortChange={setReasoningEffort}
        disabled={isTriageRunning}
      />
      <CriteriaEditor
        inclusion={inclusionText}
        exclusion={exclusionText}
        onInclusionChange={setInclusionText}
        onExclusionChange={setExclusionText}
        disabled={isTriageRunning}
        error={criteriaError}
      />

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={runSequentialTriage}
          disabled={
            entries.length === 0 ||
            isTriageRunning ||
            requiresOpenRouterKey ||
            managedModeBlocked ||
            (provider === 'gemini' && geminiKeyMissing)
          }
          className="inline-flex items-center rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isTriageRunning ? 'Running LLM triage…' : 'Start LLM triage pass'}
        </button>
        {entries.length > 0 && !isTriageRunning && progress.status === 'idle' && (
          <p className="text-sm text-slate-600">{entries.length} records loaded. Ready when you are.</p>
        )}
      </div>

      <TriageProgress current={progress.current} total={progress.total} status={progress.status} />
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">LLM fallback notices</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.total > 0 && (
        <div className="space-y-4">
          <SummaryCards total={summary.total} includes={includes} excludes={excludes} maybes={maybes} />
          <ExportButtons entries={entries} decisions={decisions} summary={summary} />
          <DecisionTable decisions={decisions} />
        </div>
      )}
    </main>
  );
}
