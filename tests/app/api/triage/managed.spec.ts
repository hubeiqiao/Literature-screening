import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from 'next-auth';
import { createInMemoryFirestore, type InMemoryFirestore } from '../../../utils/inMemoryFirestore';

let firestoreMock: InMemoryFirestore;
const getServerSessionMock = vi.fn(async () => null as Session | null);
const getLedgerBalanceMock = vi.fn();
const debitBalanceMock = vi.fn();
const isLedgerEnabledMock = vi.fn(() => true);

const originalSkip = process.env.SKIP_ENV_VALIDATION;
const originalFetch = global.fetch;

vi.mock('@/lib/config/validateEnv', () => ({
  validateEnv: vi.fn(),
  getValidatedEnv: vi.fn(() => ({
    OPENROUTER_API_KEY: 'test-managed-key',
    NEXTAUTH_SECRET: 'secret',
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_PROJECT_ID: 'project',
    GOOGLE_APPLICATION_CREDENTIALS_B64: 'credentials',
    STRIPE_SECRET_KEY: 'stripe-secret',
    STRIPE_PUBLISHABLE_KEY: 'stripe-pub',
    STRIPE_PRICE_ID: 'price_123',
    STRIPE_WEBHOOK_SECRET: 'whsec',
  })),
}));

vi.mock('@/lib/cloud/firestore', () => ({
  getFirestore: () => firestoreMock.firestore,
}));

vi.mock('next-auth', () => ({
  getServerSession: () => getServerSessionMock(),
}));

vi.mock('@/lib/billing/ledger', () => ({
  getLedgerBalance: (...args: unknown[]) => getLedgerBalanceMock(...args),
  debitBalance: (...args: unknown[]) => debitBalanceMock(...args),
  isLedgerEnabled: () => isLedgerEnabledMock(),
  InsufficientCreditError: class MockInsufficientCreditError extends Error {},
}));

vi.mock('../../../../app/api/triage/payloads', () => ({
  buildOpenRouterPayload: vi.fn(() => ({
    messages: [
      { role: 'system', content: 'triage instructions' },
      { role: 'user', content: 'entry summary' },
    ],
    max_tokens: 1024,
  })),
  buildGeminiPayload: vi.fn(),
}));

vi.mock('@/lib/triage', () => ({
  triageRecord: vi.fn(() => ({
    status: 'Include',
    confidence: 0.6,
    inclusionMatches: [],
    exclusionMatches: [],
  })),
}));

describe('managed triage API', () => {
  beforeEach(() => {
    firestoreMock = createInMemoryFirestore();
    getServerSessionMock.mockReset();
    getServerSessionMock.mockResolvedValue(null);
    getLedgerBalanceMock.mockReset();
    debitBalanceMock.mockReset();
    isLedgerEnabledMock.mockReturnValue(true);
    process.env.SKIP_ENV_VALIDATION = 'false';
    process.env.OPENROUTER_API_KEY = 'test-managed-key';
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env.SKIP_ENV_VALIDATION = originalSkip;
    global.fetch = originalFetch;
  });

  it('requires authentication before running managed OpenRouter triage', async () => {
    getServerSessionMock.mockResolvedValue(null);

    const { POST } = await import('../../../../app/api/triage/route');

    const request = new Request('https://example.com/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'openrouter',
        usageMode: 'managed',
        model: 'x-ai/grok-4-fast:free',
        entry: { type: 'article', key: '1', fields: { title: 'Title', abstract: 'Abstract' } },
        instructions: { inclusion: 'include', exclusion: 'exclude' },
        heuristics: {
          inclusion: [{ id: 'inc', terms: ['include'] }],
          exclusion: [{ id: 'exc', terms: ['exclude'] }],
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toMatch(/Sign in required/i);
  });

  it('records managed run metadata and debits ledger balances', async () => {
    const session = { user: { email: 'user@example.com', id: 'user-9' } } as Session;
    getServerSessionMock.mockResolvedValue(session);
    getLedgerBalanceMock.mockResolvedValue({ balanceCents: 1000, updatedAt: new Date().toISOString() });
    debitBalanceMock.mockResolvedValue({ previousBalanceCents: 1000, newBalanceCents: 700 });

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ status: 'Include', confidence: 0.9, rationale: 'Looks good' }),
              },
            },
          ],
          usage: {
            total_cost: 0.5,
            prompt_tokens: 500,
            completion_tokens: 300,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { POST } = await import('../../../../app/api/triage/route');

    const request = new Request('https://example.com/api/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'openrouter',
        usageMode: 'managed',
        model: 'x-ai/grok-4-fast',
        entry: { type: 'article', key: '1', fields: { title: 'Title', abstract: 'Abstract' } },
        instructions: { inclusion: 'include', exclusion: 'exclude' },
        heuristics: {
          inclusion: [{ id: 'inc', terms: ['include'] }],
          exclusion: [{ id: 'exc', terms: ['exclude'] }],
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(debitBalanceMock).toHaveBeenCalled();
    const debitCall = debitBalanceMock.mock.calls[0]?.[0];
    expect(debitCall).toMatchObject({
      userId: 'user-9',
      amountCents: 50,
      metadata: expect.objectContaining({
        estimatedCostCents: 35,
        actualCostCents: 50,
      }),
    });

    const runs = firestoreMock.list('triageRuns');
    expect(runs).toHaveLength(1);
    const [run] = runs;
    expect(run.data).toMatchObject({
      userId: 'user-9',
      provider: 'openrouter',
      usageMode: 'managed',
      cost: {
        actualCents: 50,
        estimatedCents: 35,
        balanceBeforeCents: 1000,
        balanceAfterCents: 700,
      },
    });
  });
});
