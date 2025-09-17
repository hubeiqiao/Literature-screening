'use client';

import { useEffect, useState } from 'react';

type Provider = 'openrouter' | 'gemini';
type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

interface ModelCredentialsFormProps {
  provider: Provider;
  onProviderChange: (provider: Provider) => void;
  openRouterKey: string;
  onOpenRouterKeyChange: (value: string) => void;
  geminiKey: string;
  onGeminiKeyChange: (value: string) => void;
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (value: ReasoningEffort) => void;
  disabled?: boolean;
}

const STORAGE_KEYS = {
  openRouter: 'literature-screening:openrouter-key',
  gemini: 'literature-screening:gemini-key',
  reasoning: 'literature-screening:openrouter-reasoning',
} as const;

export function ModelCredentialsForm({
  provider,
  onProviderChange,
  openRouterKey,
  onOpenRouterKeyChange,
  geminiKey,
  onGeminiKeyChange,
  reasoningEffort,
  onReasoningEffortChange,
  disabled,
}: ModelCredentialsFormProps) {
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const storedOpenRouter = window.localStorage.getItem(STORAGE_KEYS.openRouter);
    const storedGemini = window.localStorage.getItem(STORAGE_KEYS.gemini);
    const storedReasoning = window.localStorage.getItem(STORAGE_KEYS.reasoning) as ReasoningEffort | null;

    if (storedOpenRouter) {
      onOpenRouterKeyChange(storedOpenRouter);
    }
    if (storedGemini) {
      onGeminiKeyChange(storedGemini);
    }
    if (storedReasoning && ['none', 'low', 'medium', 'high'].includes(storedReasoning)) {
      onReasoningEffortChange(storedReasoning);
    }
    // we intentionally ignore dependencies to run only once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = () => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.openRouter, openRouterKey.trim());
    window.localStorage.setItem(STORAGE_KEYS.gemini, geminiKey.trim());
    window.localStorage.setItem(STORAGE_KEYS.reasoning, reasoningEffort);
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Model & API keys</h2>
        {status === 'saved' && <span className="text-xs font-medium text-emerald-600">Saved</span>}
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Choose a provider and supply the matching API key. Keys are stored locally in your browser and sent only with
        triage requests.
      </p>

      <div className="mt-6 space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700">Provider</label>
          <select
            value={provider}
            onChange={(event) => onProviderChange(event.target.value as Provider)}
            disabled={disabled}
            className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="openrouter">OpenRouter — openai/gpt-oss-120b</option>
            <option value="gemini">Google — Gemini 2.5 Pro</option>
          </select>
          <p className="mt-2 text-xs text-slate-500">
            Switch providers any time; runs will use the active selection.
          </p>
        </div>

        {provider === 'openrouter' ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-slate-700">OpenRouter API key</label>
              <input
                type="password"
                value={openRouterKey}
                onChange={(event) => onOpenRouterKeyChange(event.target.value)}
                placeholder="sk-or-..."
                disabled={disabled}
                className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
              />
              <p className="mt-2 text-xs text-slate-500">
                Generate a key at
                {' '}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-slate-700 underline hover:text-slate-900"
                >
                  openrouter.ai/keys
                </a>
                {' '}and ensure your privacy settings allow public models.
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Reasoning effort</label>
              <select
                value={reasoningEffort}
                onChange={(event) => onReasoningEffortChange(event.target.value as ReasoningEffort)}
                disabled={disabled}
                className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="none">No reasoning</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <p className="mt-2 text-xs text-slate-500">
                Higher reasoning effort typically yields better screening quality, but may use more tokens and time.
              </p>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-semibold text-slate-700">Gemini API key</label>
            <input
              type="password"
              value={geminiKey}
              onChange={(event) => onGeminiKeyChange(event.target.value)}
              placeholder="AIza..."
              disabled={disabled}
              className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
            />
            <p className="mt-2 text-xs text-slate-500">
              Create a key in
              {' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-slate-700 underline hover:text-slate-900"
              >
                Google AI Studio
              </a>
              {' '}or Cloud Generative AI, then paste it here.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={disabled}
          className="inline-flex items-center justify-center rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:opacity-60"
        >
          Save locally
        </button>
      </div>
    </div>
  );
}

export type { Provider, ReasoningEffort };
