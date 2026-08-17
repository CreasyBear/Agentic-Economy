import { canonicalDigest } from '@/modules/common/canonical-digest'
import { describe, expect, it } from 'vitest'

import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  appendRefundReversal,
  authorizePaidCharge,
  createInMemoryMoneyQueryPort,
  createLedgerState,
  type ExactAmount,
  type MoneyAccount,
  type MoneyLedgerEntry,
  type MoneyTransaction,
} from '../../../src/modules/money/public'
const reversedPayoutReversalRef = canonicalDigest({
  format: 'money-payout-reversal-transaction:v1',
  reservationTransactionRef: 'payout-reversed',
})
const reversedPayoutReversalIdempotencyKey = canonicalDigest({
  format: 'money-payout-reversal-idempotency:v1',
  reservationTransactionRef: 'payout-reversed',
})

const ownerId = 'owner-proj-1'

const accounts: readonly MoneyAccount[] = [
  { accountRef: accountRefForOwner(ownerId, 'USD'), accountKind: 'operator_credit', accountId: ownerId, balance: amount('USD', '1000', 2), recoveryDue: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForProvider('business-1', 'USD'), accountKind: 'provider_earnings', businessId: 'business-1', balance: amount('USD', '0', 2), recoveryDue: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForRake('USD'), accountKind: 'ae_rake', balance: amount('USD', '0', 2), recoveryDue: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
]

const resolveOwnerId = (principalId: string): string | undefined => {
  if (principalId === 'clerk_api_key:key-1' || principalId === 'clerk_api_key:key-2') return ownerId
  return undefined
}

describe('money query projections', () => {
  it('binds reads to principal and returns native activity pages', async () => {
    const charged = authorizePaidCharge({
      state: createLedgerState(accounts),
      transaction: { transactionRef: 'tx-1', kind: 'charge', idempotencyKey: 'key-1:op:1', inputDigest: 'input-1', principalId: 'clerk_api_key:key-1', currency: 'USD', expectedAccountVersion: 0, now: 1 },
      operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
      providerAccountRef: accountRefForProvider('business-1', 'USD'),
      rakeAccountRef: accountRefForRake('USD'),
      grossAmount: amount('USD', '500', 2),
      rakeConfig: { rakeBps: 1_000 },
      priceDigest: 'price-1',
      principalId: 'clerk_api_key:key-1',
      accountId: ownerId,
      credentialId: 'key-1',
      serviceRef: 'service-1',
      offeringRef: 'offering-1',
      businessId: 'business-1',
      invocationRef: 'inv-1',
      attemptRef: 'attempt-1',
      operationKey: 'op-1',
      sourceDigest: 'source-1',
      evidenceRefs: ['local/dev'],
      observedAt: 1,
    })
    const port = createInMemoryMoneyQueryPort({ ledger: charged.state, resolveOwnerId })
    await expect(port.readCreditAccount({ principalId: 'clerk_api_key:key-2', currency: 'USD' })).resolves.toMatchObject({
      balance: amount('USD', '500', 2),
    })
    const activity = await port.listCreditActivity({ principalId: 'clerk_api_key:key-1', credentialId: 'key-1', currency: 'USD', paginationOpts: { numItems: 999, cursor: null } })
    expect(activity.page).toHaveLength(1)
    expect(activity.page[0]).toMatchObject({ chargeState: 'paid', grossAmount: amount('USD', '500', 2) })
    await expect(port.readKeyUsage({ principalId: 'clerk_api_key:key-1', credentialId: 'key-1', currency: 'USD' })).resolves.toMatchObject({
      credentialId: 'key-1',
      callCount: 1,
      paidCallCount: 1,
      grossSpend: amount('USD', '500', 2),
    })
    await expect(port.readCreditAccount({ principalId: 'clerk_api_key:key-3', currency: 'USD' })).rejects.toThrow('billing_identity_missing')
  })

  it('reports provider earnings without silent truncation', async () => {
    const port = createInMemoryMoneyQueryPort({ ledger: createLedgerState(accounts), resolveOwnerId })
    const earnings = await port.readProviderEarnings({ businessId: 'business-1', currency: 'USD' })
    expect(earnings).toMatchObject({
      evidence: 'labelled_local_dev',
      grossAccrual: amount('USD', '0', 2),
      truncated: false,
    })
  })

  it('nets held-funded provider and rake refunds in earnings', async () => {
    const charged = authorizePaidCharge({
      state: createLedgerState(accounts),
      transaction: { transactionRef: 'held-charge', kind: 'charge', idempotencyKey: 'held-charge', inputDigest: 'held-charge-input', principalId: 'clerk_api_key:key-1', currency: 'USD', expectedAccountVersion: 0, now: 1 },
      operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
      providerAccountRef: accountRefForProvider('business-1', 'USD'),
      rakeAccountRef: accountRefForRake('USD'),
      grossAmount: amount('USD', '1000', 2),
      rakeConfig: { rakeBps: 1_000 },
      priceDigest: 'held-price',
      principalId: 'clerk_api_key:key-1',
      accountId: ownerId,
      credentialId: 'key-1',
      serviceRef: 'service-1',
      offeringRef: 'offering-1',
      businessId: 'business-1',
      invocationRef: 'held-invocation',
      attemptRef: 'held-attempt',
      operationKey: 'held-operation',
      sourceDigest: 'held-source',
      evidenceRefs: ['held:evidence'],
      observedAt: 1,
    })
    expect(charged.result).toMatchObject({ kind: 'accepted', providerNet: amount('USD', '900', 2), rake: amount('USD', '100', 2) })
    const refunded = appendRefundReversal({
      state: charged.state,
      transaction: { transactionRef: 'held-refund', kind: 'refund', idempotencyKey: 'held-refund-key', inputDigest: 'held-refund-input', principalId: 'clerk_api_key:key-1', currency: 'USD', expectedAccountVersion: 1, now: 2 },
      originalTransactionRef: 'held-charge',
      principalId: 'clerk_api_key:key-1',
      sourceDigest: 'held-refund-source',
      evidenceRefs: ['held:refund'],
      observedAt: 2,
    })
    expect(refunded.result).toMatchObject({ kind: 'accepted' })
    const rakeRefund = refunded.state.entries.find((entry) => entry.entryType === 'refund' && entry.accountRef === accountRefForRake('USD'))
    expect(rakeRefund?.businessId).toBe('business-1')
    const port = createInMemoryMoneyQueryPort({ ledger: refunded.state, resolveOwnerId })
    await expect(port.readProviderEarnings({ businessId: 'business-1', currency: 'USD' })).resolves.toMatchObject({
      grossAccrual: amount('USD', '0', 2),
      rake: amount('USD', '0', 2),
      providerNet: amount('USD', '0', 2),
      paidOut: amount('USD', '0', 2),
      held: amount('USD', '0', 2),
      recoveryDue: amount('USD', '0', 2),
    })
  })

  it('counts applied and reversed payout debits while subtracting exact reversals', async () => {
    const base = createLedgerState(accounts)
    const provider = accounts.find((item) => item.accountKind === 'provider_earnings')
    if (provider === undefined) throw new Error('provider_fixture_missing')
    const projectedAccounts = new Map(base.accounts)
    projectedAccounts.set(provider.accountRef, {
      ...provider,
      balance: amount('USD', '0', 2),
      version: 2,
    })
    const pendingTransaction: MoneyTransaction = {
      transactionRef: 'payout-pending',
      kind: 'payout_accrual',
      idempotencyKey: 'payout-pending-key',
      inputDigest: 'payout-pending-input',
      principalId: 'business:business-1',
      currency: 'USD',
      exponent: 2,
      state: 'pending',
      expectedAccountVersion: 0,
      externalRef: 'payout-pending-ref',
      createdAt: 2,
      updatedAt: 2,
    }
    const appliedTransaction: MoneyTransaction = {
      ...pendingTransaction,
      transactionRef: 'payout-applied',
      idempotencyKey: 'payout-applied-key',
      inputDigest: 'payout-applied-input',
      state: 'applied',
      externalRef: 'payout-applied-ref',
      createdAt: 1,
      updatedAt: 1,
    }
    const reversedTransaction: MoneyTransaction = {
      ...pendingTransaction,
      transactionRef: 'payout-reversed',
      idempotencyKey: 'payout-reversed-key',
      inputDigest: 'payout-reversed-input',
      state: 'reversed',
      externalRef: 'payout-reversed-ref',
      createdAt: 3,
      updatedAt: 4,
    }
    const reversalTransaction: MoneyTransaction = {
      ...reversedTransaction,
      transactionRef: reversedPayoutReversalRef,
      idempotencyKey: reversedPayoutReversalIdempotencyKey,
      inputDigest: 'payout-reversed-reversal-input',
      reversalOf: reversedTransaction.transactionRef,
      createdAt: 4,
      updatedAt: 4,
    }
    const entry = (
      transaction: MoneyTransaction,
      units: string,
    ): MoneyLedgerEntry => ({
      entryRef: `${transaction.transactionRef}:payout-reservation`,
      accountRef: provider.accountRef,
      entryType: 'payout_accrual',
      direction: 'debit',
      amount: amount('USD', units, 2),
      transactionRef: transaction.transactionRef,
      idempotencyKey: transaction.idempotencyKey,
      businessId: 'business-1',
      sourceDigest: `${transaction.transactionRef}:source`,
      evidenceRefs: [transaction.transactionRef],
      createdAt: transaction.createdAt,
    })
    const reversalEntry: MoneyLedgerEntry = {
      entryRef: `${reversalTransaction.transactionRef}:payout-reversal`,
      accountRef: provider.accountRef,
      entryType: 'payout_accrual',
      direction: 'credit',
      amount: amount('USD', '300', 2),
      transactionRef: reversalTransaction.transactionRef,
      idempotencyKey: reversalTransaction.idempotencyKey,
      businessId: 'business-1',
      sourceDigest: `${reversalTransaction.transactionRef}:source`,
      evidenceRefs: [reversalTransaction.transactionRef],
      reversalOf: reversedTransaction.transactionRef,
      createdAt: reversalTransaction.createdAt,
    }
    const ledger = {
      ...base,
      accounts: projectedAccounts,
      transactions: [
        pendingTransaction,
        appliedTransaction,
        reversedTransaction,
        reversalTransaction,
      ],
      entries: [
        entry(pendingTransaction, '300'),
        entry(appliedTransaction, '200'),
        entry(reversedTransaction, '300'),
        reversalEntry,
      ],
    }
    const port = createInMemoryMoneyQueryPort({ ledger, resolveOwnerId })
    await expect(
      port.readProviderEarnings({ businessId: 'business-1', currency: 'USD' }),
    ).resolves.toMatchObject({
      paidOut: amount('USD', '200', 2),
      held: amount('USD', '0', 2),
    })
    const appliedReversalRef = canonicalDigest({
      format: 'money-payout-reversal-transaction:v1',
      reservationTransactionRef: appliedTransaction.transactionRef,
    })
    const appliedReversalIdempotencyKey = canonicalDigest({
      format: 'money-payout-reversal-idempotency:v1',
      reservationTransactionRef: appliedTransaction.transactionRef,
    })
    const orphanOriginalRef = 'payout-other-business'
    const orphanReversalRef = canonicalDigest({
      format: 'money-payout-reversal-transaction:v1',
      reservationTransactionRef: orphanOriginalRef,
    })
    const orphanReversalIdempotencyKey = canonicalDigest({
      format: 'money-payout-reversal-idempotency:v1',
      reservationTransactionRef: orphanOriginalRef,
    })
    const invalidLedgers = [
      {
        name: 'missing reversal credit',
        value: {
          ...ledger,
          entries: ledger.entries.filter(
            (entry) => entry.transactionRef !== reversedPayoutReversalRef,
          ),
        },
      },
      {
        name: 'smaller reversal credit',
        value: {
          ...ledger,
          entries: ledger.entries.map((entry) =>
            entry.transactionRef === reversedPayoutReversalRef
              ? { ...entry, amount: amount('USD', '299', 2) }
              : entry,
          ),
        },
      },
      {
        name: 'duplicate original debit',
        value: {
          ...ledger,
          entries: [...ledger.entries, entry(reversedTransaction, '300')],
        },
      },
      {
        name: 'applied payout with reversal',
        value: {
          ...ledger,
          transactions: [
            ...ledger.transactions,
            {
              ...reversalTransaction,
              transactionRef: appliedReversalRef,
              idempotencyKey: appliedReversalIdempotencyKey,
              reversalOf: appliedTransaction.transactionRef,
            },
          ],
          entries: [
            ...ledger.entries,
            {
              ...reversalEntry,
              entryRef: `${appliedReversalRef}:payout-reversal`,
              transactionRef: appliedReversalRef,
              idempotencyKey: appliedReversalIdempotencyKey,
              reversalOf: appliedTransaction.transactionRef,
            },
          ],
        },
      },
      {
        name: 'orphan cross-identity pair',
        value: {
          ...ledger,
          entries: ledger.entries.map((entry) =>
            entry.transactionRef === reversedPayoutReversalRef
              ? { ...entry, reversalOf: 'payout-from-another-business' }
              : entry,
          ),
        },
      },
      {
        name: 'orphan reversal points at a cross-business original',
        value: {
          ...ledger,
          transactions: [
            ...ledger.transactions,
            {
              ...reversedTransaction,
              transactionRef: orphanOriginalRef,
              idempotencyKey: `${orphanOriginalRef}:key`,
              principalId: 'business:business-2',
            },
            {
              ...reversalTransaction,
              transactionRef: orphanReversalRef,
              idempotencyKey: orphanReversalIdempotencyKey,
              principalId: 'business:business-1',
              reversalOf: orphanOriginalRef,
            },
          ],
          entries: [
            ...ledger.entries,
            {
              ...reversalEntry,
              entryRef: `${orphanReversalRef}:payout-reversal`,
              transactionRef: orphanReversalRef,
              idempotencyKey: orphanReversalIdempotencyKey,
              reversalOf: orphanOriginalRef,
            },
          ],
        },
      },
    ]
    for (const invalid of invalidLedgers) {
      await expect(
        createInMemoryMoneyQueryPort({
          ledger: invalid.value,
          resolveOwnerId,
        }).readProviderEarnings({
          businessId: 'business-1',
          currency: 'USD',
        }),
      ).rejects.toThrow('currency_mismatch')
    }
  })
  it('fails closed when payout reversal credits exceed original debits', async () => {
    const base = createLedgerState(accounts)
    const provider = accounts.find((item) => item.accountKind === 'provider_earnings')
    if (provider === undefined) throw new Error('provider_fixture_missing')
    const original: MoneyTransaction = {
      transactionRef: 'payout-original',
      kind: 'payout_accrual',
      idempotencyKey: 'payout-original-key',
      inputDigest: 'payout-original-input',
      principalId: 'business:business-1',
      currency: 'USD',
      exponent: 2,
      state: 'reversed',
      expectedAccountVersion: 0,
      externalRef: 'payout-original-ref',
      createdAt: 1,
      updatedAt: 2,
    }
    const reversal: MoneyTransaction = {
      ...original,
      transactionRef: canonicalDigest({
        format: 'money-payout-reversal-transaction:v1',
        reservationTransactionRef: original.transactionRef,
      }),
      idempotencyKey: canonicalDigest({
        format: 'money-payout-reversal-idempotency:v1',
        reservationTransactionRef: original.transactionRef,
      }),
      inputDigest: 'payout-original-reversal-input',
      reversalOf: original.transactionRef,
      createdAt: 2,
    }
    const ledger = {
      ...base,
      transactions: [original, reversal],
      entries: [
        {
          entryRef: `${original.transactionRef}:payout-reservation`,
          accountRef: provider.accountRef,
          entryType: 'payout_accrual' as const,
          direction: 'debit' as const,
          amount: amount('USD', '100', 2),
          transactionRef: original.transactionRef,
          idempotencyKey: original.idempotencyKey,
          businessId: 'business-1',
          sourceDigest: 'payout-original-source',
          evidenceRefs: [original.transactionRef],
          createdAt: 1,
        },
        {
          entryRef: `${reversal.transactionRef}:payout-reversal`,
          accountRef: provider.accountRef,
          entryType: 'payout_accrual' as const,
          direction: 'credit' as const,
          amount: amount('USD', '200', 2),
          transactionRef: reversal.transactionRef,
          idempotencyKey: reversal.idempotencyKey,
          businessId: 'business-1',
          sourceDigest: 'payout-reversal-source',
          evidenceRefs: [reversal.transactionRef],
          reversalOf: original.transactionRef,
          createdAt: 2,
        },
      ],
    }
    const port = createInMemoryMoneyQueryPort({ ledger, resolveOwnerId })
    await expect(
      port.readProviderEarnings({ businessId: 'business-1', currency: 'USD' }),
    ).rejects.toThrow('currency_mismatch')
  })
  it('fails closed for orphan and non-payout payout debits while excluding active reservations', async () => {
    const base = createLedgerState(accounts)
    const provider = accounts.find(
      (item) => item.accountKind === 'provider_earnings',
    )
    if (provider === undefined) throw new Error('provider_fixture_missing')
    const debit = {
      entryRef: 'payout-classification:debit',
      accountRef: provider.accountRef,
      entryType: 'payout_accrual' as const,
      direction: 'debit' as const,
      amount: amount('USD', '100', 2),
      transactionRef: 'payout-classification:transaction',
      idempotencyKey: 'payout-classification:key',
      businessId: 'business-1',
      sourceDigest: 'payout-classification:source',
      evidenceRefs: ['payout-classification:evidence'],
      createdAt: 1,
    }
    await expect(
      createInMemoryMoneyQueryPort({
        ledger: {
          ...base,
          entries: [debit],
        },
        resolveOwnerId,
      }).readProviderEarnings({
        businessId: 'business-1',
        currency: 'USD',
      }),
    ).rejects.toThrow('currency_mismatch')
    const nonPayout: MoneyTransaction = {
      transactionRef: debit.transactionRef,
      kind: 'charge',
      idempotencyKey: debit.idempotencyKey,
      inputDigest: 'payout-classification:input',
      principalId: 'business:business-1',
      currency: 'USD',
      exponent: 2,
      state: 'applied',
      expectedAccountVersion: 0,
      createdAt: 1,
      updatedAt: 1,
    }
    await expect(
      createInMemoryMoneyQueryPort({
        ledger: {
          ...base,
          transactions: [nonPayout],
          entries: [debit],
        },
        resolveOwnerId,
      }).readProviderEarnings({
        businessId: 'business-1',
        currency: 'USD',
      }),
    ).rejects.toThrow('currency_mismatch')
    for (const state of ['pending', 'outcome_unknown'] as const) {
      const transaction: MoneyTransaction = {
        ...nonPayout,
        kind: 'payout_accrual',
        state,
      }
      await expect(
        createInMemoryMoneyQueryPort({
          ledger: {
            ...base,
            transactions: [transaction],
            entries: [debit],
          },
          resolveOwnerId,
        }).readProviderEarnings({
          businessId: 'business-1',
          currency: 'USD',
        }),
      ).resolves.toMatchObject({
        paidOut: amount('USD', '0', 2),
      })
    }
  })

  it('does not expose payment secrets in owner projections', async () => {
    const port = createInMemoryMoneyQueryPort({ ledger: createLedgerState(accounts), resolveOwnerId })
    const result = await port.readCreditAccount({ principalId: 'clerk_api_key:key-1', currency: 'USD' })
    expect(JSON.stringify(result)).not.toMatch(/secret|paymentMethod|clientSecret/i)
  })
})

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}
