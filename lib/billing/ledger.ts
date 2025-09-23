import type { Firestore } from '@google-cloud/firestore';

const LEDGER_COLLECTION = 'billingAccounts';
const TRANSACTIONS_SUBCOLLECTION = 'transactions';
const CREDIT_CONVERSION_RATE = 0.5;

const LEDGER_DISABLED = process.env.SKIP_ENV_VALIDATION === 'true';

export class InsufficientCreditError extends Error {
  constructor(message = 'Insufficient managed credits.') {
    super(message);
    this.name = 'InsufficientCreditError';
  }
}

export interface LedgerTransactionMetadata {
  [key: string]: unknown;
}

export interface LedgerBalanceSnapshot {
  balanceCents: number;
  updatedAt: string | null;
}

export interface TopUpParams {
  firestore: Firestore;
  userId: string;
  chargeCents: number;
  metadata?: LedgerTransactionMetadata;
}

export interface TopUpResult {
  creditedCents: number;
  previousBalanceCents: number;
  newBalanceCents: number;
}

export interface DebitParams {
  firestore: Firestore;
  userId: string;
  amountCents: number;
  metadata?: LedgerTransactionMetadata;
}

export interface DebitResult {
  previousBalanceCents: number;
  newBalanceCents: number;
}

interface LedgerAccountDocument {
  balanceCents?: number;
  updatedAt?: string;
}

interface LedgerTransactionDocument {
  type: 'topup' | 'debit';
  amountCents: number;
  balanceAfterCents: number;
  createdAt: string;
  metadata: LedgerTransactionMetadata | null;
}

function nowIsoString(): string {
  return new Date().toISOString();
}

function sanitizeMetadata(metadata: LedgerTransactionMetadata | undefined) {
  if (!metadata) {
    return null;
  }
  const entries = Object.entries(metadata).filter(([, value]) => {
    if (value === null) {
      return true;
    }
    const valueType = typeof value;
    return valueType === 'string' || valueType === 'number' || valueType === 'boolean';
  });
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function getAccountRef(firestore: Firestore, userId: string) {
  return firestore.collection(LEDGER_COLLECTION).doc(userId);
}

function getTransactionsRef(firestore: Firestore, userId: string) {
  return getAccountRef(firestore, userId).collection(TRANSACTIONS_SUBCOLLECTION);
}

export function isLedgerEnabled() {
  return !LEDGER_DISABLED;
}

export async function getLedgerBalance({
  firestore,
  userId,
}: {
  firestore: Firestore;
  userId: string;
}): Promise<LedgerBalanceSnapshot> {
  if (!isLedgerEnabled()) {
    return { balanceCents: 0, updatedAt: null };
  }

  const snapshot = await getAccountRef(firestore, userId).get();
  if (!snapshot.exists) {
    return { balanceCents: 0, updatedAt: null };
  }
  const data = snapshot.data() as LedgerAccountDocument | undefined;
  const balance = typeof data?.balanceCents === 'number' ? data.balanceCents : 0;
  const updatedAt = typeof data?.updatedAt === 'string' ? data.updatedAt : null;
  return { balanceCents: balance, updatedAt };
}

export async function recordTopUp({ firestore, userId, chargeCents, metadata }: TopUpParams): Promise<TopUpResult> {
  if (!isLedgerEnabled()) {
    return {
      creditedCents: Math.floor(chargeCents * CREDIT_CONVERSION_RATE),
      previousBalanceCents: 0,
      newBalanceCents: Math.floor(chargeCents * CREDIT_CONVERSION_RATE),
    };
  }

  const creditCents = Math.max(0, Math.floor(chargeCents * CREDIT_CONVERSION_RATE));
  const sanitizedMetadata = sanitizeMetadata(metadata);
  const accountRef = getAccountRef(firestore, userId);
  const transactionsRef = getTransactionsRef(firestore, userId);
  const timestamp = nowIsoString();

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(accountRef);
    const data = snapshot.data() as LedgerAccountDocument | undefined;
    const previousBalance = typeof data?.balanceCents === 'number' ? data.balanceCents : 0;
    const newBalance = previousBalance + creditCents;

    transaction.set(accountRef, { balanceCents: newBalance, updatedAt: timestamp }, { merge: true });

    if (creditCents > 0) {
      const entry: LedgerTransactionDocument = {
        type: 'topup',
        amountCents: creditCents,
        balanceAfterCents: newBalance,
        createdAt: timestamp,
        metadata: sanitizedMetadata,
      };
      transaction.set(transactionsRef.doc(), entry);
    }

    return {
      creditedCents: creditCents,
      previousBalanceCents: previousBalance,
      newBalanceCents: newBalance,
    };
  });
}

export async function debitBalance({ firestore, userId, amountCents, metadata }: DebitParams): Promise<DebitResult> {
  if (!isLedgerEnabled()) {
    return {
      previousBalanceCents: Number.MAX_SAFE_INTEGER,
      newBalanceCents: Number.MAX_SAFE_INTEGER,
    };
  }

  if (amountCents <= 0) {
    const balance = await getLedgerBalance({ firestore, userId });
    return { previousBalanceCents: balance.balanceCents, newBalanceCents: balance.balanceCents };
  }

  const sanitizedMetadata = sanitizeMetadata(metadata);
  const accountRef = getAccountRef(firestore, userId);
  const transactionsRef = getTransactionsRef(firestore, userId);
  const timestamp = nowIsoString();

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(accountRef);
    const data = snapshot.data() as LedgerAccountDocument | undefined;
    const previousBalance = typeof data?.balanceCents === 'number' ? data.balanceCents : 0;

    if (previousBalance < amountCents) {
      throw new InsufficientCreditError();
    }

    const newBalance = previousBalance - amountCents;
    transaction.set(accountRef, { balanceCents: newBalance, updatedAt: timestamp }, { merge: true });
    const entry: LedgerTransactionDocument = {
      type: 'debit',
      amountCents,
      balanceAfterCents: newBalance,
      createdAt: timestamp,
      metadata: sanitizedMetadata,
    };
    transaction.set(transactionsRef.doc(), entry);

    return {
      previousBalanceCents: previousBalance,
      newBalanceCents: newBalance,
    };
  });
}

export { CREDIT_CONVERSION_RATE };
