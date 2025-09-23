import '@/lib/config/validateEnv';
import { NextResponse } from 'next/server';
import { getFirestore } from '@/lib/cloud/firestore';
import { recordTopUp } from '@/lib/billing/ledger';
import { getStripeWebhookSecret, verifyStripeSignature, type StripeCheckoutSession } from '@/lib/billing/stripe';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (process.env.SKIP_ENV_VALIDATION === 'true') {
    return NextResponse.json({ received: true });
  }

  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');

  let eventType: string;
  let eventId: string;
  let session: StripeCheckoutSession | null = null;

  try {
    const webhookSecret = getStripeWebhookSecret();
    const event = verifyStripeSignature(payload, signature, webhookSecret);
    eventType = event.type;
    eventId = event.id;
    if (eventType === 'checkout.session.completed') {
      session = event.data.object as StripeCheckoutSession;
    }
  } catch (error) {
    console.error('[billing-webhook] signature verification failed', error);
    return NextResponse.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
  }

  if (eventType === 'checkout.session.completed' && session) {
    try {
      const firestore = getFirestore();
      const amountTotal = getAmountTotal(session);
      const currency = (session.currency ?? '').toLowerCase();
      const userId = getCheckoutUserId(session);
      const paymentStatus = normalizeStatus(session.payment_status);
      const checkoutStatus = normalizeStatus(session.status);

      if (!userId) {
        console.error('[billing-webhook] checkout session missing user metadata', session.id);
        return NextResponse.json({ received: true });
      }

      if (!amountTotal || amountTotal <= 0) {
        console.warn('[billing-webhook] checkout session amount_total missing or zero', session.id);
        return NextResponse.json({ received: true });
      }

      if (paymentStatus && paymentStatus !== 'paid') {
        console.warn('[billing-webhook] ignoring unpaid checkout session', session.id, paymentStatus);
        return NextResponse.json({ received: true });
      }

      if (checkoutStatus && checkoutStatus !== 'complete') {
        console.warn('[billing-webhook] checkout session not complete', session.id, checkoutStatus);
        return NextResponse.json({ received: true });
      }

      if (currency && currency !== 'usd') {
        console.warn('[billing-webhook] ignoring non-USD checkout session', session.id, currency);
        return NextResponse.json({ received: true });
      }

      const eventRef = firestore.collection('billingWebhookEvents').doc(eventId);
      const existing = await eventRef.get();
      if (existing.exists) {
        return NextResponse.json({ received: true });
      }

      const customerId = extractCustomerId(session);
      const paymentIntentId = extractPaymentIntentId(session);
      const customerEmail = extractCustomerEmail(session);

      await recordTopUp({
        firestore,
        userId,
        chargeCents: amountTotal,
        metadata: {
          stripeEventId: eventId,
          stripeSessionId: session.id,
          stripeCustomerId: customerId ?? null,
          stripePaymentIntentId: paymentIntentId ?? null,
          stripeAmountTotalCents: amountTotal,
          stripeCurrency: session.currency ?? null,
          stripePaymentStatus: session.payment_status ?? null,
          stripeCheckoutStatus: session.status ?? null,
        },
      });

      const accountUpdates: Record<string, unknown> = {};
      if (customerId) {
        accountUpdates.stripeCustomerId = customerId;
      }
      if (customerEmail) {
        accountUpdates.stripeCustomerEmail = customerEmail;
      }

      if (Object.keys(accountUpdates).length > 0) {
        await firestore.collection('billingAccounts').doc(userId).set(accountUpdates, { merge: true });
      }

      await eventRef.set({
        processedAt: new Date().toISOString(),
        type: eventType,
        sessionId: session.id,
        userId,
        amountTotal,
        currency: session.currency ?? null,
      });
    } catch (error) {
      console.error('[billing-webhook] failed to record checkout session', error);
      return NextResponse.json({ error: 'Failed to process Stripe webhook.' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

function getAmountTotal(session: StripeCheckoutSession): number {
  if (typeof session.amount_total === 'number') {
    return Math.max(0, Math.floor(session.amount_total));
  }
  return 0;
}

function getCheckoutUserId(session: StripeCheckoutSession): string | null {
  const metadataUserId = session.metadata?.userId;
  if (typeof metadataUserId === 'string' && metadataUserId.trim().length > 0) {
    return metadataUserId;
  }
  const clientReferenceId = session.client_reference_id;
  if (typeof clientReferenceId === 'string' && clientReferenceId.trim().length > 0) {
    return clientReferenceId;
  }
  return null;
}

function extractCustomerId(session: StripeCheckoutSession): string | null {
  if (typeof session.customer === 'string' && session.customer.trim().length > 0) {
    return session.customer;
  }
  const candidate = (session.customer as { id?: string | null } | null) ?? null;
  if (candidate?.id && candidate.id.trim().length > 0) {
    return candidate.id;
  }
  return null;
}

function extractPaymentIntentId(session: StripeCheckoutSession): string | null {
  if (typeof session.payment_intent === 'string' && session.payment_intent.trim().length > 0) {
    return session.payment_intent;
  }
  const candidate = (session.payment_intent as { id?: string | null } | null) ?? null;
  if (candidate?.id && candidate.id.trim().length > 0) {
    return candidate.id;
  }
  return null;
}

function extractCustomerEmail(session: StripeCheckoutSession): string | null {
  const detailsEmail = session.customer_details?.email;
  if (typeof detailsEmail === 'string' && detailsEmail.trim().length > 0) {
    return detailsEmail;
  }
  const directEmail = session.customer_email;
  if (typeof directEmail === 'string' && directEmail.trim().length > 0) {
    return directEmail;
  }
  return null;
}

function normalizeStatus(value: string | null | undefined): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim().toLowerCase();
  }
  return null;
}
