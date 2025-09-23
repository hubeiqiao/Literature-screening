import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryFirestore } from '../../utils/inMemoryFirestore';

const originalSkip = process.env.SKIP_ENV_VALIDATION;

describe('billing ledger', () => {
  beforeEach(() => {
    process.env.SKIP_ENV_VALIDATION = 'false';
    vi.resetModules();
  });

  afterAll(() => {
    process.env.SKIP_ENV_VALIDATION = originalSkip;
  });

  it('credits half the charge and records a top-up transaction', async () => {
    const { firestore, list, get } = createInMemoryFirestore();
    const { recordTopUp } = await import('@/lib/billing/ledger');

    const result = await recordTopUp({
      firestore,
      userId: 'user-1',
      chargeCents: 1000,
      metadata: {
        keep: 'yes',
        includeNumber: 42,
        includeBoolean: true,
        includeNull: null,
        dropObject: { nested: 'value' },
      },
    });

    expect(result).toEqual({
      creditedCents: 500,
      previousBalanceCents: 0,
      newBalanceCents: 500,
    });

    const account = get('billingAccounts/user-1');
    expect(account).toMatchObject({ balanceCents: 500 });

    const transactions = list('billingAccounts/user-1/transactions');
    expect(transactions).toHaveLength(1);
    const [entry] = transactions;
    expect(entry.data).toMatchObject({
      type: 'topup',
      amountCents: 500,
      balanceAfterCents: 500,
      metadata: {
        keep: 'yes',
        includeNumber: 42,
        includeBoolean: true,
        includeNull: null,
      },
    });
    expect(entry.data).not.toHaveProperty(['metadata', 'dropObject']);
  });

  it('debits managed credits and records the resulting balance', async () => {
    const { firestore, list } = createInMemoryFirestore();
    const { recordTopUp, debitBalance } = await import('@/lib/billing/ledger');

    await recordTopUp({ firestore, userId: 'user-2', chargeCents: 2000 });

    const result = await debitBalance({
      firestore,
      userId: 'user-2',
      amountCents: 300,
      metadata: { reason: 'triage-run', nested: { ignore: true } },
    });

    expect(result).toEqual({ previousBalanceCents: 1000, newBalanceCents: 700 });

    const transactions = list('billingAccounts/user-2/transactions');
    expect(transactions).toHaveLength(2);
    const debitEntry = transactions.find((tx) => tx.data.type === 'debit');
    expect(debitEntry?.data).toMatchObject({
      amountCents: 300,
      balanceAfterCents: 700,
      metadata: { reason: 'triage-run' },
    });
  });

  it('throws when debiting more than the available balance', async () => {
    const { firestore } = createInMemoryFirestore();
    const { recordTopUp, debitBalance, InsufficientCreditError } = await import('@/lib/billing/ledger');

    await recordTopUp({ firestore, userId: 'user-3', chargeCents: 600 });

    await expect(
      debitBalance({ firestore, userId: 'user-3', amountCents: 400 }),
    ).rejects.toBeInstanceOf(InsufficientCreditError);
  });
});
