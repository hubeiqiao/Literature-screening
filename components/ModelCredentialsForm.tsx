'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_MODELS,
  findOpenRouterModel,
  type OpenRouterModel,
} from '@/lib/openrouter';

type Provider = 'openrouter' | 'gemini';
type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

interface ModelCredentialsFormProps {
  provider: Provider;
  onProviderChange: (provider: Provider) => void;
  openRouterModel: string;
  onOpenRouterModelChange: (value: string) => void;
  openRouterKey: string;
  onOpenRouterKeyChange: (value: string) => void;
  openRouterDataPolicy: string;
  onOpenRouterDataPolicyChange: (value: string) => void;
  geminiKey: string;
  onGeminiKeyChange: (value: string) => void;
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (value: ReasoningEffort) => void;
  disabled?: boolean;
}

const STORAGE_KEYS = {
  openRouter: 'literature-screening:openrouter-key',
  openRouterModel: 'literature-screening:openrouter-model',
  openRouterPolicy: 'literature-screening:openrouter-data-policy',
  gemini: 'literature-screening:gemini-key',
  reasoning: 'literature-screening:openrouter-reasoning',
} as const;

export function ModelCredentialsForm({
  provider,
  onProviderChange,
  openRouterModel,
  onOpenRouterModelChange,
  openRouterKey,
  onOpenRouterKeyChange,
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
    const storedOpenRouter = window.localStorage.getItem(STORAGE_KEYS.openRouter);
    const storedModel = window.localStorage.getItem(STORAGE_KEYS.openRouterModel);
    const storedOpenRouterPolicy = window.localStorage.getItem(STORAGE_KEYS.openRouterPolicy);
    const storedGemini = window.localStorage.getItem(STORAGE_KEYS.gemini);
    const storedReasoning = window.localStorage.getItem(STORAGE_KEYS.reasoning) as ReasoningEffort | null;

    if (storedOpenRouter) {
      onOpenRouterKeyChange(storedOpenRouter);
    }
    if (storedModel) {
      const resolvedModel = findOpenRouterModel(storedModel)?.value;
      if (resolvedModel) {
        onOpenRouterModelChange(resolvedModel);
      }
    }
    if (storedOpenRouterPolicy) {
      onOpenRouterDataPolicyChange(storedOpenRouterPolicy);
      if (storedOpenRouterPolicy === 'permissive') {
        setPolicyOption('permissive');
      } else {
        setPolicyOption('custom');
        setCustomPolicy(storedOpenRouterPolicy);
      }
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

  useEffect(() => {
    if (!openRouterDataPolicy) {
      if (policyOption !== 'custom') {
        setPolicyOption('account');
      }
      return;
    }
    if (openRouterDataPolicy === 'permissive') {
      setPolicyOption('permissive');
      return;
    }
    setPolicyOption('custom');
    setCustomPolicy(openRouterDataPolicy);
  }, [openRouterDataPolicy, policyOption]);

  const handleSave = () => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.openRouter, openRouterKey.trim());
    window.localStorage.setItem(STORAGE_KEYS.openRouterModel, openRouterModel);
    window.localStorage.setItem(STORAGE_KEYS.openRouterPolicy, openRouterDataPolicy.trim());
    window.localStorage.setItem(STORAGE_KEYS.gemini, geminiKey.trim());
    window.localStorage.setItem(STORAGE_KEYS.reasoning, reasoningEffort);
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  };

  const selectedOpenRouterModel: OpenRouterModel =
    findOpenRouterModel(openRouterModel) ?? DEFAULT_OPENROUTER_MODEL;

  useEffect(() => {
    if (!findOpenRouterModel(openRouterModel)) {
      onOpenRouterModelChange(DEFAULT_OPENROUTER_MODEL.value);
    }
  }, [openRouterModel, onOpenRouterModelChange]);

  const reasoningEnabled = selectedOpenRouterModel.supportsReasoning;

  useEffect(() => {
    if (!reasoningEnabled && reasoningEffort !== 'none') {
      onReasoningEffortChange('none');
    }
  }, [reasoningEnabled, reasoningEffort, onReasoningEffortChange]);

  const reasoningEnabledLabels = useMemo(
    () => OPENROUTER_MODELS.filter((model) => model.supportsReasoning).map((model) => model.label),
    [],
  );

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
            <option value="openrouter">OpenRouter — GPT-OSS 120B or Grok 4 Fast</option>
            <option value="gemini">Google — Gemini 2.5 Pro</option>
          </select>
          <p className="mt-2 text-xs text-slate-500">
            Switch providers any time; runs will use the active selection. Grok 4 Fast is available on the free OpenRouter tier,
            while GPT-OSS 120B provides higher quality at a higher credit cost.
          </p>
        </div>

        {provider === 'openrouter' ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700">Model</label>
              <select
                value={selectedOpenRouterModel.value}
                onChange={(event) => onOpenRouterModelChange(event.target.value)}
                disabled={disabled}
                className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                {OPENROUTER_MODELS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">
                Grok 4 Fast is ideal for quick, free test runs; GPT-OSS 120B offers deeper coverage when you have paid credits
                available.
              </p>
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
                disabled={disabled || !reasoningEnabled}
                className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="none">No reasoning</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <p className="mt-2 text-xs text-slate-500">
                Reasoning effort is available only on models that support it ({reasoningEnabledLabels.join(', ')}).
                {reasoningEnabled
                  ? ' Higher settings typically yield better screening quality but may use more tokens and time.'
                  : ` ${selectedOpenRouterModel.label} runs without additional reasoning passes.`}
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
