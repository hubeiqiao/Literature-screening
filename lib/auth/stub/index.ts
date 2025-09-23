import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

const SESSION_COOKIE = 'lsa.auth';
const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

type SessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  id?: string | null;
  managedBalanceCents?: number | null;
};

interface Session {
  user: SessionUser | null;
  expires?: string;
}

interface ProviderConfig {
  id: string;
  name: string;
  type: 'oauth';
  clientId: string;
  clientSecret: string;
}

interface NextAuthOptions {
  secret?: string;
  providers: ProviderConfig[];
  callbacks?: {
    session?: (params: { session: Session }) => Promise<Session> | Session;
  };
}

type AuthHandler = (request: Request) => Promise<Response>;

type AuthAction = 'session' | 'signin' | 'signout';

type ParsedRoute = {
  action: AuthAction;
  provider?: string;
};

function createSignature(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function buildCookie(name: string, value: string, maxAge?: number): string {
  const attributes = [
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (typeof maxAge === 'number') {
    attributes.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  }
  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure');
  }
  return `${name}=${value}; ${attributes.join('; ')}`;
}

function encodeSession(session: Session, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  const signature = createSignature(secret, payload);
  return `${payload}.${signature}`;
}

function decodeSession(token: string | undefined, secret: string): Session | null {
  if (!token) {
    return null;
  }
  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    return null;
  }
  const expected = createSignature(secret, payload);
  const actualBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length) {
    return null;
  }
  try {
    if (!timingSafeEqual(actualBuffer, expectedBuffer)) {
      return null;
    }
  } catch (error) {
    return null;
  }
  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    const session = JSON.parse(json) as Session;
    if (session.expires && new Date(session.expires).getTime() < Date.now()) {
      return null;
    }
    return session;
  } catch (error) {
    return null;
  }
}

function extractSessionCookie(request: Request): string | undefined {
  const raw = request.headers.get('cookie');
  if (!raw) {
    return undefined;
  }
  const cookiesList = raw.split(';');
  for (const entry of cookiesList) {
    const trimmed = entry.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE}=`)) {
      return trimmed.slice(SESSION_COOKIE.length + 1);
    }
  }
  return undefined;
}

function parseRoute(request: Request): ParsedRoute {
  const url = new URL(request.url);
  const segments = url.pathname
    .replace(/\/?api\/?auth\/?/, '')
    .split('/')
    .filter((segment) => segment.length > 0);
  const [action, provider] = segments as [AuthAction | undefined, string | undefined];
  if (action === 'signin' || action === 'signout' || action === 'session') {
    return { action, provider };
  }
  return { action: 'session' };
}

async function applySessionCallback(options: NextAuthOptions, session: Session | null): Promise<Session | null> {
  if (!session) {
    return null;
  }
  const callback = options.callbacks?.session;
  if (!callback) {
    return session;
  }
  return callback({ session });
}

function buildJsonResponse(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function ensureProvider(options: NextAuthOptions, providerId: string | undefined): ProviderConfig | null {
  if (!providerId) {
    return null;
  }
  return options.providers.find((provider) => provider.id === providerId) ?? null;
}

function createManagedSession(provider: ProviderConfig): Session {
  const expires = new Date(Date.now() + ONE_WEEK_SECONDS * 1000).toISOString();
  return {
    user: {
      name: `${provider.name} account`,
      email: 'managed@literature-screening.app',
      id: 'managed@literature-screening.app',
      managedBalanceCents: null,
      image: null,
    },
    expires,
  };
}

export default function NextAuth(options: NextAuthOptions): AuthHandler {
  if (!options.secret) {
    throw new Error('NEXTAUTH_SECRET is required for authentication.');
  }
  const secret = options.secret;

  return async function handler(request: Request): Promise<Response> {
    const { action, provider: providerId } = parseRoute(request);

    if (action === 'session' && request.method === 'GET') {
      const token = extractSessionCookie(request);
      const session = await applySessionCallback(options, decodeSession(token, secret));
      return buildJsonResponse({ session });
    }

    if (action === 'signin' && request.method === 'POST') {
      const provider = ensureProvider(options, providerId);
      if (!provider) {
        return buildJsonResponse({ error: 'Unknown authentication provider.' }, { status: 400 });
      }
      const session = await applySessionCallback(options, createManagedSession(provider));
      if (!session) {
        return buildJsonResponse({ error: 'Failed to establish session.' }, { status: 500 });
      }
      const token = encodeSession(session, secret);
      const headers = new Headers();
      headers.append('Set-Cookie', buildCookie(SESSION_COOKIE, token, ONE_WEEK_SECONDS));
      return buildJsonResponse({ session }, { status: 200, headers });
    }

    if (action === 'signout' && request.method === 'POST') {
      const headers = new Headers();
      headers.append('Set-Cookie', buildCookie(SESSION_COOKIE, '', 0));
      return buildJsonResponse({ ok: true }, { status: 200, headers });
    }

    return buildJsonResponse({ error: 'Unsupported auth action.' }, { status: 400 });
  };
}

async function getSessionFromCookies(secret: string, options: NextAuthOptions): Promise<Session | null> {
  const cookie = cookies().get(SESSION_COOKIE)?.value;
  const session = decodeSession(cookie, secret);
  return applySessionCallback(options, session);
}

async function getServerSession(options: NextAuthOptions): Promise<Session | null> {
  if (!options.secret) {
    return null;
  }
  return getSessionFromCookies(options.secret, options);
}

export type { NextAuthOptions, ProviderConfig as AuthProviderConfig, Session };
export { getServerSession };
