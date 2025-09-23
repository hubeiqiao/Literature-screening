import '@/lib/config/validateEnv';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSessionUserId } from '@/lib/auth/session';
import { getValidatedEnv } from '@/lib/config/validateEnv';
import { getFirestore } from '@/lib/cloud/firestore';
import {
  createStripeCheckoutSession,
  createStripeCustomer,
} from '@/lib/billing/stripe';

const DEFAULT_SUCCESS_PATH = '/?billing=success';
const DEFAULT_CANCEL_PATH = '/?billing=cancelled';
const MAX_QUANTITY = 10;

export const runtime = 'nodejs';

interface CreateTopUpRequestBody {
  quantity?: number;
  successPath?: string;
  cancelPath?: string;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }

    const userId = getSessionUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'Unable to resolve user identity.' }, { status: 403 });
    }

    const skipIntegration = process.env.SKIP_ENV_VALIDATION === 'true';

    const { quantity, successUrl, cancelUrl } = await resolveRequestOptions(request, {
      successPath: DEFAULT_SUCCESS_PATH,
      cancelPath: DEFAULT_CANCEL_PATH,
    });

    if (skipIntegration) {
      const origin = new URL(request.url).origin;
      return NextResponse.json({ url: `${origin}/billing/mock-checkout` });
    }

    const env = getValidatedEnv();
    const firestore = getFirestore();

    const accountRef = firestore.collection('billingAccounts').doc(userId);
    const snapshot = await accountRef.get();
    const accountData = snapshot.exists ? (snapshot.data() as { stripeCustomerId?: string }) : null;

    let stripeCustomerId = accountData?.stripeCustomerId ?? null;

    if (!stripeCustomerId) {
      const customer = await createStripeCustomer({
        email: session.user?.email ?? null,
        name: session.user?.name ?? null,
        userId,
        secretKey: env.STRIPE_SECRET_KEY,
      });
      stripeCustomerId = customer.id;
      await accountRef.set(
        {
          stripeCustomerId,
          stripeCustomerEmail: session.user?.email ?? null,
        },
        { merge: true },
      );
    }

    const checkout = await createStripeCheckoutSession({
      customerId: stripeCustomerId,
      customerEmail: session.user?.email ?? null,
      successUrl,
      cancelUrl,
      priceId: env.STRIPE_PRICE_ID,
      quantity,
      userId,
      secretKey: env.STRIPE_SECRET_KEY,
    });

    if (!checkout.url) {
      throw new Error('Stripe did not return a checkout URL.');
    }

    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    console.error('[billing-create-top-up] failed to create Stripe checkout session', error);
    return NextResponse.json({ error: 'Unable to start Stripe checkout.' }, { status: 500 });
  }
}

async function resolveRequestOptions(
  request: Request,
  defaults: { successPath: string; cancelPath: string },
): Promise<{ quantity: number; successUrl: string; cancelUrl: string }> {
  let body: CreateTopUpRequestBody = {};
  try {
    body = (await request.json()) as CreateTopUpRequestBody;
  } catch (error) {
    body = {};
  }

  const quantity = normalizeQuantity(body.quantity);
  const successUrl = normalizeRedirectUrl(request, body.successPath ?? defaults.successPath);
  const cancelUrl = normalizeRedirectUrl(request, body.cancelPath ?? defaults.cancelPath);

  return { quantity, successUrl, cancelUrl };
}

function normalizeQuantity(candidate: unknown): number {
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    const value = Math.floor(candidate);
    if (value >= 1) {
      return Math.min(value, MAX_QUANTITY);
    }
  }
  return 1;
}

function normalizeRedirectUrl(request: Request, candidate: string): string {
  try {
    const url = new URL(candidate, buildDefaultUrl(request, '/'));
    if (url.origin !== new URL(request.url).origin) {
      return buildDefaultUrl(request, candidate.startsWith('/') ? candidate : '/');
    }
    return url.toString();
  } catch (error) {
    return buildDefaultUrl(request, candidate.startsWith('/') ? candidate : '/');
  }
}

function buildDefaultUrl(request: Request, path: string): string {
  const base = new URL(request.url);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  base.pathname = normalizedPath;
  base.search = '';
  base.hash = '';
  return base.toString();
}
