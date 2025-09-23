import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryFirestore, type InMemoryFirestore } from '../../../../utils/inMemoryFirestore';

let firestoreMock: InMemoryFirestore;
const recordTopUpMock = vi.fn();
const verifyStripeSignatureMock = vi.fn();
const getStripeWebhookSecretMock = vi.fn(() => 'whsec_test');

vi.mock('@/lib/config/validateEnv', () => ({
  validateEnv: vi.fn(),
  getValidatedEnv: vi.fn(() => ({
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
  })),
}));

vi.mock('@/lib/cloud/firestore', () => ({
  getFirestore: () => firestoreMock.firestore,
}));

vi.mock('@/lib/billing/ledger', () => ({
  recordTopUp: recordTopUpMock,
}));

vi.mock('@/lib/billing/stripe', () => ({
  getStripeWebhookSecret: () => getStripeWebhookSecretMock(),
  verifyStripeSignature: (...args: unknown[]) => verifyStripeSignatureMock(...args),
}));

const originalSkip = process.env.SKIP_ENV_VALIDATION;

describe('billing webhook route', () => {
  beforeEach(() => {
    firestoreMock = createInMemoryFirestore();
    recordTopUpMock.mockReset();
    verifyStripeSignatureMock.mockReset();
    getStripeWebhookSecretMock.mockReturnValue('whsec_test');
    process.env.SKIP_ENV_VALIDATION = 'false';
  });

  afterAll(() => {
    process.env.SKIP_ENV_VALIDATION = originalSkip;
  });

  it('rejects requests with invalid Stripe signatures', async () => {
    verifyStripeSignatureMock.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const { POST } = await import('../../../../../app/api/billing/webhook/route');

    const request = new Request('https://example.com/api/billing/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_header' },
      body: JSON.stringify({ id: 'evt_1' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(recordTopUpMock).not.toHaveBeenCalled();
  });

  it('credits managed accounts when a checkout session completes', async () => {
    recordTopUpMock.mockResolvedValue({
      creditedCents: 900,
      previousBalanceCents: 0,
      newBalanceCents: 900,
    });

    verifyStripeSignatureMock.mockImplementation((payload: string, signature: string, secret: string) => {
      expect(payload).toContain('evt_2');
      expect(signature).toBe('sig_header');
      expect(secret).toBe('whsec_test');
      return {
        id: 'evt_2',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test',
            amount_total: 1800,
            currency: 'usd',
            metadata: { userId: 'user-7' },
            payment_status: 'paid',
            status: 'complete',
            customer: 'cus_123',
            customer_email: 'user@example.com',
            payment_intent: 'pi_123',
          },
        },
      };
    });

    const { POST } = await import('../../../../../app/api/billing/webhook/route');

    const request = new Request('https://example.com/api/billing/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_header' },
      body: JSON.stringify({ id: 'evt_2' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(recordTopUpMock).toHaveBeenCalledWith({
      firestore: firestoreMock.firestore,
      userId: 'user-7',
      chargeCents: 1800,
      metadata: expect.objectContaining({
        stripeEventId: 'evt_2',
        stripeSessionId: 'cs_test',
        stripeCustomerId: 'cus_123',
        stripePaymentIntentId: 'pi_123',
        stripeCurrency: 'usd',
      }),
    });

    const events = firestoreMock.list('billingWebhookEvents');
    expect(events).toHaveLength(1);
    const [eventRecord] = events;
    expect(eventRecord.path).toBe('billingWebhookEvents/evt_2');
    expect(eventRecord.data).toMatchObject({
      sessionId: 'cs_test',
      userId: 'user-7',
      amountTotal: 1800,
      type: 'checkout.session.completed',
    });

    const account = firestoreMock.get('billingAccounts/user-7');
    expect(account).toMatchObject({
      stripeCustomerId: 'cus_123',
      stripeCustomerEmail: 'user@example.com',
    });
  });
});
