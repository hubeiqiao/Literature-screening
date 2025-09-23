'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth/client';
import { getOpenRouterModel } from '@/lib/openrouter';

const MANAGED_MODEL_ID = 'x-ai/grok-4-fast';
const MANAGED_MODEL = getOpenRouterModel(MANAGED_MODEL_ID);
const MANAGED_BASELINE_COST_CENTS = MANAGED_MODEL.pricing?.minimumChargeCents ?? 50;
const MINIMUM_TOP_UP_USD = 5;
const CREDIT_CONVERSION_RATE = 0.5;
const MINIMUM_CREDIT_CENTS = Math.round(MINIMUM_TOP_UP_USD * 100 * CREDIT_CONVERSION_RATE);

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function AccountBanner() {
  const { isAuthenticated, isLoading, user, signIn, signOut, managedBalanceCents } = useAuth();
  const [isLaunchingCheckout, setIsLaunchingCheckout] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const subtitle = useMemo(() => {
    if (isAuthenticated) {
      return 'Managed runs debit your hosted credits while BYOK keeps everything local to your browser.';
    }
    if (isLoading) {
      return 'Checking your Google session…';
    }
    return 'Use BYOK immediately or sign in with Google to unlock hosted OpenRouter access and credit tracking.';
  }, [isAuthenticated, isLoading]);

  const managedInsights = useMemo(() => {
    if (!isAuthenticated) {
      return null;
    }
    if (managedBalanceCents == null) {
      return {
        summary: 'Managed balance: syncing…',
        detail: null,
      };
    }

    const summary = `Managed balance: ${formatCurrency(managedBalanceCents)} available.`;
    const hasCredits = managedBalanceCents > 0;

    if (!hasCredits) {
      return {
        summary: 'Managed balance: $0.00 — add funds to re-enable hosted runs.',
        detail: `Top-ups start at $${MINIMUM_TOP_UP_USD.toFixed(2)} (${formatCurrency(
          MINIMUM_CREDIT_CENTS,
        )} of managed credit).`,
      };
    }

    if (MANAGED_BASELINE_COST_CENTS <= 0) {
      return {
        summary,
        detail: 'Balances refresh after each managed run and appear in your usage history.',
      };
    }

    const estimatedRuns = Math.floor(managedBalanceCents / MANAGED_BASELINE_COST_CENTS);
    const estimateCopy =
      estimatedRuns >= 1
        ? `≈${estimatedRuns} managed ${estimatedRuns === 1 ? 'run' : 'runs'} remaining using the ${
            MANAGED_MODEL.label
          } baseline (${formatCurrency(MANAGED_BASELINE_COST_CENTS)} per decision).`
        : `Less than one managed run remaining using the ${
            MANAGED_MODEL.label
          } baseline (${formatCurrency(MANAGED_BASELINE_COST_CENTS)} per decision).`;

    return {
      summary,
      detail: `${estimateCopy} Balances refresh after each managed run and show below in your history.`,
    };
  }, [isAuthenticated, managedBalanceCents]);

  const primaryLabel = isAuthenticated ? 'Sign out' : 'Sign in with Google';

  const handleLaunchTopUp = useCallback(async () => {
    if (!isAuthenticated || isLaunchingCheckout) {
      return;
    }
    setBillingError(null);
    setIsLaunchingCheckout(true);
    try {
      const response = await fetch('/api/billing/create-top-up', { method: 'POST' });
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || 'Unable to start Stripe checkout.');
      }
      window.location.href = payload.url;
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Unable to start Stripe checkout.');
    } finally {
      setIsLaunchingCheckout(false);
    }
  }, [isAuthenticated, isLaunchingCheckout]);

  const handleOpenBillingPortal = useCallback(async () => {
    if (!isAuthenticated || isOpeningPortal) {
      return;
    }
    setBillingError(null);
    setIsOpeningPortal(true);
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' });
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || 'Unable to open billing portal.');
      }
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Unable to open billing portal.');
    } finally {
      setIsOpeningPortal(false);
    }
  }, [isAuthenticated, isOpeningPortal]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {isAuthenticated
              ? `Signed in as ${user?.email ?? user?.name ?? 'Google user'}`
              : 'Work with hosted or BYOK access'}
          </p>
          <p className="mt-1 text-xs text-slate-600">{subtitle}</p>
          {managedInsights && (
            <div className="mt-2 space-y-1 text-xs">
              <p className="font-medium text-slate-700">{managedInsights.summary}</p>
              {managedInsights.detail && (
                <p className="text-slate-600">{managedInsights.detail}</p>
              )}
            </div>
          )}
          <p className="mt-2 text-xs text-slate-600">
            BYOK API keys stay in your browser; managed runs share only token and cost metadata for billing and audits.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Managed usage history is listed below with token counts and per-run pricing.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Stripe top-ups convert paid USD to managed credits at a 50% rate. The minimum $5 purchase becomes {formatCurrency(
              MINIMUM_CREDIT_CENTS,
            )} of hosted usage.
          </p>
          {billingError && <p className="mt-1 text-xs text-red-600">{billingError}</p>}
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row">
          {isAuthenticated && (
            <>
              <button
                type="button"
                onClick={() => {
                  void handleLaunchTopUp();
                }}
                disabled={isLaunchingCheckout || isLoading}
                className="inline-flex items-center justify-center rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLaunchingCheckout ? 'Redirecting…' : 'Add managed credits'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleOpenBillingPortal();
                }}
                disabled={isOpeningPortal || isLoading}
                className="inline-flex items-center justify-center rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isOpeningPortal ? 'Opening portal…' : 'Manage billing'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              if (isAuthenticated) {
                void signOut();
              } else {
                void signIn('google');
              }
            }}
            disabled={isLoading}
            className="inline-flex items-center justify-center rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? 'Loading…' : primaryLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
