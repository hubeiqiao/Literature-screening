import crypto from 'node:crypto';
import { getValidatedEnv } from '@/lib/config/validateEnv';

const STRIPE_API_BASE = 'https://api.stripe.com';

function appendIfDefined(params: URLSearchParams, key: string, value: string | null | undefined) {
  if (typeof value === 'string' && value.trim().length > 0) {
    params.set(key, value);
  }
}

async function postStripeForm<T>(path: string, params: URLSearchParams, secretKey: string): Promise<T> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Stripe request to ${path} failed: ${response.status} ${response.statusText} - ${text}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Stripe response from ${path} was not valid JSON.`);
  }
}

export interface StripeCustomer {
  id: string;
}

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_status?: string | null;
  status?: string | null;
  metadata?: Record<string, string | null | undefined>;
  client_reference_id?: string | null;
  customer?: string | { id?: string | null } | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  payment_intent?: string | { id?: string | null } | null;
}

export interface StripeBillingPortalSession {
  id: string;
  url: string;
}

export interface StripeEvent<T = unknown> {
  id: string;
  type: string;
  data: {
    object: T;
  };
}

export async function createStripeCustomer({
  email,
  name,
  userId,
  secretKey,
}: {
  email?: string | null;
  name?: string | null;
  userId: string;
  secretKey: string;
}): Promise<StripeCustomer> {
  const params = new URLSearchParams();
  appendIfDefined(params, 'email', email);
  appendIfDefined(params, 'name', name);
  params.set('metadata[userId]', userId);

  return postStripeForm<StripeCustomer>('/v1/customers', params, secretKey);
}

export async function createStripeCheckoutSession({
  customerId,
  customerEmail,
  successUrl,
  cancelUrl,
  priceId,
  quantity,
  userId,
  secretKey,
}: {
  customerId?: string | null;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  priceId: string;
  quantity: number;
  userId: string;
  secretKey: string;
}): Promise<StripeCheckoutSession> {
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', String(Math.max(1, Math.floor(quantity))));
  params.set('metadata[userId]', userId);
  params.set('metadata[source]', 'managed-credits');
  params.set('client_reference_id', userId);
  params.set('payment_intent_data[metadata][userId]', userId);
  params.set('payment_intent_data[metadata][source]', 'managed-credits');

  if (customerId) {
    params.set('customer', customerId);
  } else {
    appendIfDefined(params, 'customer_email', customerEmail);
  }

  return postStripeForm<StripeCheckoutSession>('/v1/checkout/sessions', params, secretKey);
}

export async function createStripeBillingPortalSession({
  customerId,
  returnUrl,
  secretKey,
}: {
  customerId: string;
  returnUrl: string;
  secretKey: string;
}): Promise<StripeBillingPortalSession> {
  const params = new URLSearchParams();
  params.set('customer', customerId);
  params.set('return_url', returnUrl);

  return postStripeForm<StripeBillingPortalSession>('/v1/billing_portal/sessions', params, secretKey);
}

export function verifyStripeSignature(payload: string, signatureHeader: string | null, secret: string): StripeEvent {
  if (!signatureHeader) {
    throw new Error('Missing Stripe signature header.');
  }

  const parts = signatureHeader.split(',');
  const timestampPart = parts.find((part) => part.startsWith('t='));
  const signatureParts = parts.filter((part) => part.startsWith('v1='));

  if (!timestampPart || signatureParts.length === 0) {
    throw new Error('Stripe signature header missing timestamp or signature.');
  }

  const timestamp = timestampPart.slice(2);
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  const provided = signatureParts.map((part) => part.slice(3));
  const valid = provided.some((candidate) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'));
    } catch (error) {
      return false;
    }
  });

  if (!valid) {
    throw new Error('Stripe signature verification failed.');
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch (error) {
    throw new Error('Stripe webhook payload is not valid JSON.');
  }

  if (!event?.type || !event?.id) {
    throw new Error('Stripe webhook payload missing id or type.');
  }

  return event;
}

export function getStripeWebhookSecret(): string {
  const env = getValidatedEnv();
  return env.STRIPE_WEBHOOK_SECRET;
}
