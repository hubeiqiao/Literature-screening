const REQUIRED_ENV_VARS = [
  'OPENROUTER_API_KEY',
  'NEXTAUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_PROJECT_ID',
  'GOOGLE_APPLICATION_CREDENTIALS_B64',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_PRICE_ID',
  'STRIPE_WEBHOOK_SECRET',
] as const;

type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

function isMissing(value: string | undefined): value is undefined | '' {
  return typeof value !== 'string' || value.trim().length === 0;
}

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => isMissing(env[key]));

  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

type AppEnvironment = Record<RequiredEnvVar, string>;

let cachedEnv: AppEnvironment | null = null;

export function getValidatedEnv(): AppEnvironment {
  if (!cachedEnv) {
    validateEnv();
    cachedEnv = REQUIRED_ENV_VARS.reduce((acc, key) => {
      acc[key] = process.env[key] as string;
      return acc;
    }, {} as AppEnvironment);
  }

  return cachedEnv;
}

const shouldSkipValidation =
  process.env.SKIP_ENV_VALIDATION === 'true' || process.env.NODE_ENV === 'test';

if (!shouldSkipValidation) {
  validateEnv();
}
