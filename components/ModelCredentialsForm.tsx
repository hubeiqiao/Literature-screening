'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  OPENROUTER_MODELS,
  getOpenRouterModel,
  isOpenRouterModelId,
  type OpenRouterModelId,
  type OpenRouterReasoningEffort,
} from '@/lib/openrouter';

type Provider = 'openrouter' | 'gemini';
type ReasoningEffort = OpenRouterReasoningEffort;

interface ModelCredentialsFormProps {
  provider: Provider;
  onProviderChange: (provider: Provider) => void;
  openRouterKey: string;
  onOpenRouterKeyChange: (value: string) => void;
  openRouterModel: OpenRouterModelId;
  onOpenRouterModelChange: (value: OpenRouterModelId) => void;
  openRouterDataPolicy: string;
  onOpenRouterDataPolicyChange: (value: string) => void;
  geminiKey: string;
  onGeminiKeyChange: (value: string) => void;
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (value: ReasoningEffort) => void;
  disabled?: boolean;
}

const STORAGE_KEYS = {
  provider: 'literature-screening:provider',
  openRouter: 'literature-screening:openrouter-key',
  openRouterModel: 'literature-screening:openrouter-model',
  openRouterPolicy: 'literature-screening:openrouter-data-policy',
  gemini: 'literature-screening:gemini-key',
  reasoning: 'literature-screening:openrouter-reasoning',
} as const;

export function ModelCredentialsForm({
  provider,
  onProviderChange,
  openRouterKey,
  onOpenRouterKeyChange,
  openRouterModel,
  onOpenRouterModelChange,
  openRouterDataPolicy,
  onOpenRouterDataPolicyChange,
  geminiKey,
  onGeminiKeyChange,
  reasoningEffort,
  onReasoningEffortChange,
  disabled,
}: ModelCredentialsFormProps) {
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');
  const [policyOption, setPolicyOption] = useState<'account' | 'permissive' | 'custom'>(() => {
    if (!openRouterDataPolicy) {
      return 'account';
    }
    if (openRouterDataPolicy === 'permissive') {
      return 'permissive';
    }
    return 'custom';
  });
  const [customPolicy, setCustomPolicy] = useState(() =>
    openRouterDataPolicy && openRouterDataPolicy !== 'permissive' ? openRouterDataPolicy : '',
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const storedProvider = window.localStorage.getItem(STORAGE_KEYS.provider);
    const storedOpenRouter = window.localStorage.getItem(STORAGE_KEYS.openRouter);
    const storedOpenRouterModel = window.localStorage.getItem(STORAGE_KEYS.openRouterModel);
    const storedOpenRouterPolicy = window.localStorage.getItem(STORAGE_KEYS.openRouterPolicy);
    const storedGemini = window.localStorage.getItem(STORAGE_KEYS.gemini);
    const storedReasoning = window.localStorage.getItem(STORAGE_KEYS.reasoning) as ReasoningEffort | null;

    if (storedProvider === 'openrouter' || storedProvider === 'gemini') {
      onProviderChange(storedProvider);
    }
    if (storedOpenRouter) {
      onOpenRouterKeyChange(storedOpenRouter);
    }
    if (storedOpenRouterModel && isOpenRouterModelId(storedOpenRouterModel)) {
      onOpenRouterModelChange(storedOpenRouterModel);
    }
    if (storedOpenRouterPolicy) {
      onOpenRouterDataPolicyChange(storedOpenRouterPolicy);
    }
    if (storedGemini) {
      onGeminiKeyChange(storedGemini);
    }
    if (storedReasoning) {
      onReasoningEffortChange(storedReasoning);
    }
  }, [
    onProviderChange,
    onOpenRouterKeyChange,
    onOpenRouterModelChange,
    onOpenRouterDataPolicyChange,
    onGeminiKeyChange,
    onReasoningEffortChange,
  ]);

  const handleSave = () => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.provider, provider);
    window.localStorage.setItem(STORAGE_KEYS.openRouter, openRouterKey.trim());
    window.localStorage.setItem(STORAGE_KEYS.openRouterModel, openRouterModel);
    window.localStorage.setItem(STORAGE_KEYS.openRouterPolicy, openRouterDataPolicy.trim());
    window.localStorage.setItem(STORAGE_KEYS.gemini, geminiKey.trim());
    window.localStorage.setItem(STORAGE_KEYS.reasoning, reasoningEffort);
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  };

  const handlePolicySelectionChange = (value: 'account' | 'permissive' | 'custom') => {
    setPolicyOption(value);
    if (value === 'account') {
      onOpenRouterDataPolicyChange('');
      return;
    }
    if (value === 'permissive') {
      onOpenRouterDataPolicyChange('permissive');
      return;
    }
    onOpenRouterDataPolicyChange(customPolicy.trim());
  };

  const selectedModel = useMemo(() => getOpenRouterModel(openRouterModel), [openRouterModel]);
  const providerLabel = 'OpenRouter';
  const reasoningDisabled = disabled || !selectedModel.supportsReasoning;
  const modelDetails = useMemo(() => {
    const capability = selectedModel.supportsReasoning ? 'Supports reasoning' : 'No reasoning mode';
    const promptLimit = selectedModel.promptCharacterLimit.toLocaleString();
    const responseLimit = selectedModel.maxTokens.toLocaleString();
    return `${capability}. ~${promptLimit} prompt characters, ${responseLimit} max output tokens.`;
  }, [selectedModel]);

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
            <option value="openrouter">{providerLabel}</option>
            <option value="gemini">Google — Gemini 2.5 Pro</option>
          </select>
          <p className="mt-2 text-xs text-slate-500">
            Switch providers any time; runs will use the active selection.
          </p>
        </div>

        {provider === 'openrouter' ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700">Model</label>
              <select
                value={openRouterModel}
                onChange={(event) => onOpenRouterModelChange(event.target.value as OpenRouterModelId)}
                disabled={disabled}
                className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                {OPENROUTER_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">
                Choose from supported OpenRouter models. Stored locally for future sessions.
              </p>
              <p className="mt-1 text-xs text-slate-500">{modelDetails}</p>
            </div>
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
                Create a key in{' '}
                <a
                  href="https://openrouter.ai/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-slate-700 underline hover:text-slate-900"
                >
                  OpenRouter settings
                </a>
                , then paste it here.
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Reasoning effort</label>
              <select
                value={reasoningEffort}
                onChange={(event) => onReasoningEffortChange(event.target.value as ReasoningEffort)}
                disabled={reasoningDisabled}
                className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="none">None</option>
                <option value="minimal">Minimal</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <p className="mt-2 text-xs text-slate-500">
                {selectedModel.supportsReasoning
                  ? 'Higher reasoning effort typically yields better screening quality, but may use more tokens and time.'
                  : 'This model does not accept OpenRouter reasoning mode. Responses will use direct completions.'}
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700">Data policy override</label>
              <select
                value={policyOption}
                onChange={(event) => handlePolicySelectionChange(event.target.value as typeof policyOption)}
                disabled={disabled}
                className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="account">Use account default (omit header)</option>
                <option value="permissive">permissive — share data for improvements</option>
                <option value="custom">Custom value…</option>
              </select>
              {policyOption === 'custom' && (
                <input
                  type="text"
                  value={customPolicy}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCustomPolicy(value);
                    onOpenRouterDataPolicyChange(value.trim());
                  }}
                  placeholder="permissive"
                  disabled={disabled}
                  className="mt-2 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              )}
              <p className="mt-2 text-xs text-slate-500">
                Leave this set to the account default to honor your OpenRouter privacy mode. Provide a policy string to override
                it for triage requests.
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
