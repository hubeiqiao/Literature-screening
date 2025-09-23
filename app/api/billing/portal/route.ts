import '@/lib/config/validateEnv';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSessionUserId } from '@/lib/auth/session';
import { getValidatedEnv } from '@/lib/config/validateEnv';
import { getFirestore } from '@/lib/cloud/firestore';
import {
  createStripeBillingPortalSession,
  createStripeCustomer,
} from '@/lib/billing/stripe';

export const runtime = 'nodejs';

interface BillingPortalRequestBody {
  returnPath?: string;
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
    const returnUrl = await resolveReturnUrl(request);

    if (skipIntegration) {
      const origin = new URL(request.url).origin;
      return NextResponse.json({ url: `${origin}/billing/mock-portal` });
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

    const portalSession = await createStripeBillingPortalSession({
      customerId: stripeCustomerId,
      returnUrl,
      secretKey: env.STRIPE_SECRET_KEY,
    });

    if (!portalSession.url) {
      throw new Error('Stripe did not return a billing portal URL.');
    }

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error('[billing-portal] failed to create Stripe billing portal session', error);
    return NextResponse.json({ error: 'Unable to load billing portal.' }, { status: 500 });
  }
}

async function resolveReturnUrl(request: Request): Promise<string> {
  let body: BillingPortalRequestBody = {};
  try {
    body = (await request.json()) as BillingPortalRequestBody;
  } catch (error) {
    body = {};
  }

  const candidate = body.returnPath;
  const fallback = buildBaseUrl(request, '/');

  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    return fallback;
  }

  try {
    const url = new URL(candidate, fallback);
    if (url.origin !== new URL(request.url).origin) {
      return fallback;
    }
    return url.toString();
  } catch (error) {
    return fallback;
  }
}

function buildBaseUrl(request: Request, path: string): string {
  const base = new URL(request.url);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  base.pathname = normalizedPath;
  base.search = '';
  base.hash = '';
  return base.toString();
}
