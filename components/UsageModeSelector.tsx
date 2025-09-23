'use client';

import type { UsageMode } from '@/lib/usageMode';

interface UsageModeSelectorProps {
  mode: UsageMode;
  onChange: (mode: UsageMode) => void;
  isManagedAvailable: boolean;
  disabled?: boolean;
  authStatus: 'loading' | 'authenticated' | 'unauthenticated';
}

export function UsageModeSelector({ mode, onChange, isManagedAvailable, disabled, authStatus }: UsageModeSelectorProps) {
  const handleChange = (nextMode: UsageMode, isDisabled: boolean) => {
    if (isDisabled || nextMode === mode) {
      return;
    }
    onChange(nextMode);
  };

  const byokSelected = mode === 'byok';
  const managedSelected = mode === 'managed';
  const managedDisabled = disabled || !isManagedAvailable;

  const helperMessage = (() => {
    if (isManagedAvailable) {
      return 'Managed runs charge your hosted balance automatically; BYOK requests stay on your own key.';
    }
    if (authStatus === 'loading') {
      return 'Checking sign-in state…';
    }
    return 'Sign in and maintain a positive managed balance (minimum $5 top-up becomes $2.50 credit) to unlock the hosted key.';
  })();

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-800">Usage mode</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <button
          type="button"
          onClick={() => handleChange('byok', Boolean(disabled))}
          disabled={disabled}
          className={`rounded border px-4 py-3 text-left text-sm font-medium transition ${
            byokSelected
              ? 'border-slate-900 bg-white text-slate-900 shadow'
              : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-800'
          } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        >
          <span className="block font-semibold">Bring your own key</span>
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Provide an OpenRouter key and we will forward it with each request.
          </span>
        </button>
        {isManagedAvailable ? (
          <button
            type="button"
            onClick={() => handleChange('managed', managedDisabled)}
            disabled={managedDisabled}
            className={`rounded border px-4 py-3 text-left text-sm font-medium transition ${
              managedSelected
                ? 'border-slate-900 bg-white text-slate-900 shadow'
                : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-800'
            } ${managedDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <span className="block font-semibold">Managed OpenRouter access</span>
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Use the project&apos;s OpenRouter key and debit hosted credits after each managed run.
            </span>
          </button>
        ) : (
          <div
            className="rounded border border-dashed border-slate-300 bg-white px-4 py-3 text-left text-sm font-medium text-slate-500"
          >
            <span className="block font-semibold">Managed OpenRouter access (locked)</span>
            <span className="mt-1 block text-xs font-normal text-slate-500">
              {authStatus === 'loading'
                ? 'Checking your session…'
                : 'Sign in with Google and keep a positive managed balance (minimum $5 top-up → $2.50 credit) to enable the hosted key.'}
            </span>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">{helperMessage}</p>
    </div>
  );
}
