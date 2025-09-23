import { Firestore } from '@google-cloud/firestore';
import { getValidatedEnv } from '@/lib/config/validateEnv';

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

let firestoreClient: Firestore | null = null;

function decodeServiceAccount(encoded: string): ServiceAccountCredentials {
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch (error) {
    throw new Error('Failed to decode base64 Google application credentials.');
  }

  let parsed: Partial<ServiceAccountCredentials>;
  try {
    parsed = JSON.parse(decoded);
  } catch (error) {
    throw new Error('Google application credentials are not valid JSON.');
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Google application credentials missing client_email or private_key.');
  }

  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
  };
}

export function getFirestore(): Firestore {
  if (!firestoreClient) {
    const env = getValidatedEnv();
    const credentials = decodeServiceAccount(env.GOOGLE_APPLICATION_CREDENTIALS_B64);

    firestoreClient = new Firestore({
      projectId: env.GOOGLE_PROJECT_ID,
      credentials,
    });
  }

  return firestoreClient;
}
