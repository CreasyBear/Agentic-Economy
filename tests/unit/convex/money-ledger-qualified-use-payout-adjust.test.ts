import { describe, expect, it } from 'vitest'

import { accountRefForProvider } from '@/modules/money/public'

import {
  MemoryDb,
  type Row,
  attemptRef,
  credentialId,
  invocationRef,
  now,
  qualifiedUseArgs,
  qualifiedUseHandler,
  reconcileHandler,
  reconciliationArgs,
  refundTransactionRef,
  sourceDigest,
  transactionRef,
} from './money-ledger-test-harness'
import {
  seedBudget,
  seedPaidCharge,
  seedProviderRefundCorrection,
  seedSecondPaidCharge,
  settleSeededChargeBudget,
} from './money-ledger-test-fixtures'

describe('money ledger qualified use payout adjustment', () => {
  it('excludes a refunded-before-delivery Qualified Use without writing evidence', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const before = {
      receipts: structuredClone(db.rows('qualifiedUseReceipts')),
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toEqual({
      kind: 'excluded',
      reason: 'refunded_before_delivery',
    })
    expect({
      receipts: db.rows('qualifiedUseReceipts'),
      allocations: db.rows('moneyPayoutAllocations'),
      payouts: db.rows('moneyPayouts'),
    }).toEqual(before)
  })

  it('refuses payout allocation when journalDigest does not match the loaded journal', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const transaction = db.rows('moneyTransactions').find(
      (row) => row._id === 'transaction:charge',
    )
    if (transaction === undefined) throw new Error('charge_transaction_fixture_missing')
    transaction.journalDigest = 'sha256:0000000000000000000000000000000000000000000000000000000000000000'
    transaction.digestFormat = 'charge-journal:v1'
    const before = {
      receipts: structuredClone(db.rows('qualifiedUseReceipts')),
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect({
      receipts: db.rows('qualifiedUseReceipts'),
      allocations: db.rows('moneyPayoutAllocations'),
      payouts: db.rows('moneyPayouts'),
    }).toEqual(before)
  })

  it('decrements a held daily payout once and replays refund without subtracting twice', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '0',
      rakeUnits: '0',
      providerNetUnits: '0',
    })
    const entriesBeforeReplay = structuredClone(
      db.rows('moneyLedgerEntries'),
    )
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(db.rows('moneyLedgerEntries')).toEqual(entriesBeforeReplay)
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '0',
      rakeUnits: '0',
      providerNetUnits: '0',
    })
  })

  it.each([
    {
      name: 'orphaned allocation reference',
      mutate: (db: MemoryDb, allocation: Row) =>
        seedProviderRefundCorrection(db, allocation, {
          allocationRef: 'allocation:missing',
        }),
    },
    {
      name: 'duplicate allocation correction',
      mutate: (db: MemoryDb, allocation: Row) => {
        seedProviderRefundCorrection(db, allocation, {}, true, 'one')
        seedProviderRefundCorrection(db, allocation, {}, true, 'two')
      },
    },
    {
      name: 'missing allocation correction',
      mutate: (db: MemoryDb, allocation: Row) =>
        seedProviderRefundCorrection(db, allocation, {
          allocationCorrectionUnits: undefined,
        }),
    },
    {
      name: 'wrong allocation correction',
      mutate: (db: MemoryDb, allocation: Row) =>
        seedProviderRefundCorrection(db, allocation, {
          allocationCorrectionUnits: '98',
        }),
    },
    {
      name: 'allocation correction greater than full provider refund',
      mutate: (db: MemoryDb, allocation: Row) =>
        seedProviderRefundCorrection(db, allocation, {
          allocationCorrectionUnits: '100',
        }),
    },
    {
      name: 'full provider refund below allocation correction',
      mutate: (db: MemoryDb, allocation: Row) =>
        seedProviderRefundCorrection(db, allocation, { amountUnits: '98' }),
    },
    {
      name: 'mismatched source transaction',
      mutate: (db: MemoryDb, allocation: Row) =>
        seedProviderRefundCorrection(db, allocation, {
          reversalOf: 'transaction:other',
        }),
    },
  ])('refuses a $name payout correction before any allocation write', async ({ mutate }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const allocation = db.rows('moneyPayoutAllocations')[0]
    if (allocation === undefined) throw new Error('allocation_fixture_missing')
    mutate(db, allocation)
    const before = {
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    const secondInvocationRef = 'operation-invocation:test-money:correction'
    const secondAttemptRef = `${secondInvocationRef}:attempt:1`
    const secondTransactionRef =
      `operation-money:${secondInvocationRef}:${secondAttemptRef}:1`
    seedSecondPaidCharge(
      db,
      secondInvocationRef,
      secondAttemptRef,
      secondTransactionRef,
      now + 1,
    )
    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({
          invocationRef: secondInvocationRef,
          attemptRef: secondAttemptRef,
          transactionRef: secondTransactionRef,
          usageRef: `${secondInvocationRef}:usage`,
          responseDigest: 'sha256:response-correction',
          qualifiedAt: now + 1,
        }),
      ),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect({
      allocations: db.rows('moneyPayoutAllocations'),
      payouts: db.rows('moneyPayouts'),
    }).toEqual(before)
  })
  it('does not let an unlinked provider refund exclude an allocation', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const allocation = db.rows('moneyPayoutAllocations')[0]
    if (allocation === undefined) throw new Error('allocation_fixture_missing')
    seedProviderRefundCorrection(db, allocation, {}, false)
    const secondInvocationRef = 'operation-invocation:test-money:unlinked-refund'
    const secondAttemptRef = `${secondInvocationRef}:attempt:1`
    const secondTransactionRef =
      `operation-money:${secondInvocationRef}:${secondAttemptRef}:1`
    seedSecondPaidCharge(
      db,
      secondInvocationRef,
      secondAttemptRef,
      secondTransactionRef,
      now + 1,
    )
    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({
          invocationRef: secondInvocationRef,
          attemptRef: secondAttemptRef,
          transactionRef: secondTransactionRef,
          usageRef: `${secondInvocationRef}:usage`,
          responseDigest: 'sha256:response-unlinked-refund',
          qualifiedAt: now + 1,
        }),
      ),
    ).resolves.toMatchObject({ kind: 'recorded' })
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '200',
      rakeUnits: '2',
      providerNetUnits: '198',
    })
  })


  it('refunds a held pooled allocation and composes a later same-day allocation', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const allocationAfterA = structuredClone(db.rows('moneyPayoutAllocations'))
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '0',
      rakeUnits: '0',
      providerNetUnits: '0',
    })
    expect(db.rows('moneyPayoutAllocations')).toEqual(allocationAfterA)
    const refundEntries = db
      .rows('moneyLedgerEntries')
      .filter((row) => row.transactionRef === refundTransactionRef)
    expect(refundEntries).toHaveLength(3)
    const operatorRefund = refundEntries.find(
      (row) => row.entryRef === `${refundTransactionRef}:operator`,
    )
    const providerRefund = refundEntries.find(
      (row) => row.entryRef === `${refundTransactionRef}:provider`,
    )
    const rakeRefund = refundEntries.find(
      (row) => row.entryRef === `${refundTransactionRef}:rake`,
    )
    if (
      operatorRefund === undefined ||
      providerRefund === undefined ||
      rakeRefund === undefined ||
      allocationAfterA[0] === undefined
    )
      throw new Error('refund_entry_fixture_missing')
    expect(operatorRefund).not.toHaveProperty('payoutRef')
    expect(operatorRefund).not.toHaveProperty('allocationRef')
    expect(operatorRefund).not.toHaveProperty('allocationCorrectionUnits')
    expect(rakeRefund).not.toHaveProperty('payoutRef')
    expect(rakeRefund).not.toHaveProperty('allocationRef')
    expect(rakeRefund).not.toHaveProperty('allocationCorrectionUnits')
    expect(providerRefund).toMatchObject({
      payoutRef: allocationAfterA[0].payoutRef,
      allocationRef: allocationAfterA[0].allocationRef,
      allocationCorrectionUnits: allocationAfterA[0].providerNetUnits,
    })

    const secondInvocationRef = 'operation-invocation:test-money:refund-second'
    const secondAttemptRef = `${secondInvocationRef}:attempt:1`
    const secondTransactionRef =
      `operation-money:${secondInvocationRef}:${secondAttemptRef}:1`
    seedSecondPaidCharge(
      db,
      secondInvocationRef,
      secondAttemptRef,
      secondTransactionRef,
      now + 1,
    )
    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({
          invocationRef: secondInvocationRef,
          attemptRef: secondAttemptRef,
          transactionRef: secondTransactionRef,
          usageRef: `${secondInvocationRef}:usage`,
          responseDigest: 'sha256:response-refund-second',
          qualifiedAt: now + 1,
        }),
      ),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const allocationsAfterB = structuredClone(
      db.rows('moneyPayoutAllocations'),
    )
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
    })
    expect(
      db
        .rows('moneyPayoutAllocations')
        .find((row) => row.qualifiedUseRef === allocationAfterA[0]?.qualifiedUseRef),
    ).toEqual(allocationAfterA[0])

    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'replayed' })
    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({
          invocationRef: secondInvocationRef,
          attemptRef: secondAttemptRef,
          transactionRef: secondTransactionRef,
          usageRef: `${secondInvocationRef}:usage`,
          responseDigest: 'sha256:response-refund-second',
          qualifiedAt: now + 1,
        }),
      ),
    ).resolves.toMatchObject({ kind: 'replayed' })
    expect(db.rows('moneyPayoutAllocations')).toEqual(allocationsAfterB)
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
    })
  })
  it('replays a recovery-adjusted full refund and composes a later same-day allocation', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const provider = db
      .rows('moneyAccounts')
      .find((row) => row._id === 'account:provider')
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.balanceUnits = '89'
    db.seed('moneyLedgerEntries', {
      _id: 'entry:provider-recovery',
      entryRef: `${transactionRef}:provider-recovery`,
      accountRef: accountRefForProvider('business:money', 'USD'),
      entryType: 'payout_accrual',
      direction: 'debit',
      amountUnits: '10',
      currency: 'USD',
      exponent: 2,
      transactionRef,
      idempotencyKey: transactionRef,
      invocationRef,
      attemptRef,
      businessId: 'business:money',
      sourceDigest,
      evidenceRefs: ['evidence:money'],
      createdAt: now,
    })
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const allocationAfterA = structuredClone(
      db.rows('moneyPayoutAllocations'),
    )
    expect(allocationAfterA[0]).toMatchObject({
      grossAccrualUnits: '90',
      rakeUnits: '1',
      providerNetUnits: '89',
    })

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    const providerRefund = db
      .rows('moneyLedgerEntries')
      .find((row) => row.entryRef === `${refundTransactionRef}:provider`)
    if (providerRefund === undefined || allocationAfterA[0] === undefined)
      throw new Error('refund_entry_fixture_missing')
    expect(providerRefund).toMatchObject({
      amountUnits: '99',
      allocationCorrectionUnits: '89',
      payoutRef: allocationAfterA[0].payoutRef,
      allocationRef: allocationAfterA[0].allocationRef,
    })
    expect(provider).toMatchObject({
      balanceUnits: '0',
      recoveryDueUnits: '10',
    })
    providerRefund.allocationCorrectionUnits = '88'
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    providerRefund.allocationCorrectionUnits = '89'
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(1)

    const secondInvocationRef = 'operation-invocation:test-money:recovery-second'
    const secondAttemptRef = `${secondInvocationRef}:attempt:1`
    const secondTransactionRef =
      `operation-money:${secondInvocationRef}:${secondAttemptRef}:1`
    seedSecondPaidCharge(
      db,
      secondInvocationRef,
      secondAttemptRef,
      secondTransactionRef,
      now + 1,
    )
    const secondArgs = qualifiedUseArgs({
      invocationRef: secondInvocationRef,
      attemptRef: secondAttemptRef,
      transactionRef: secondTransactionRef,
      usageRef: `${secondInvocationRef}:usage`,
      responseDigest: 'sha256:response-recovery-second',
      qualifiedAt: now + 1,
    })
    await expect(
      qualifiedUseHandler({ db }, secondArgs),
    ).resolves.toMatchObject({ kind: 'recorded' })
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(2)
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '90',
      rakeUnits: '1',
      providerNetUnits: '89',
    })
    expect(
      db
        .rows('moneyPayoutAllocations')
        .find((row) => row.qualifiedUseRef === allocationAfterA[0]?.qualifiedUseRef),
    ).toEqual(allocationAfterA[0])
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'replayed' })
    await expect(
      qualifiedUseHandler({ db }, secondArgs),
    ).resolves.toMatchObject({ kind: 'replayed' })
  })

  it.each(['transfer_pending', 'outcome_unknown'] as const)(
    'refuses a %s payout refund before any write',
    async (state) => {
      const db = new MemoryDb()
      seedBudget(db)
      seedPaidCharge(db)
      settleSeededChargeBudget(db, credentialId, credentialId, true)
      await expect(
        qualifiedUseHandler({ db }, qualifiedUseArgs()),
      ).resolves.toMatchObject({ kind: 'recorded' })
      const payout = db.rows('moneyPayouts')[0]
      if (payout === undefined) throw new Error('payout_fixture_missing')
      payout.state = state
      const before = {
        accounts: structuredClone(db.rows('moneyAccounts')),
        budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
        entries: structuredClone(db.rows('moneyLedgerEntries')),
        payouts: structuredClone(db.rows('moneyPayouts')),
        transactions: structuredClone(db.rows('moneyTransactions')),
      }
      await expect(
        reconcileHandler({ db }, reconciliationArgs()),
      ).resolves.toEqual({ kind: 'reconciliation_required' })
      expect({
        accounts: db.rows('moneyAccounts'),
        budgets: db.rows('moneyCredentialBudgetStates'),
        entries: db.rows('moneyLedgerEntries'),
        payouts: db.rows('moneyPayouts'),
        transactions: db.rows('moneyTransactions'),
      }).toEqual(before)
    },
  )

  it('preserves a paid historical payout and creates recoveryDue on refund', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const payout = db.rows('moneyPayouts')[0]
    const provider = db.rows('moneyAccounts').find(
      (row) => row._id === 'account:provider',
    )
    if (payout === undefined || provider === undefined)
      throw new Error('paid_payout_fixture_missing')
    payout.state = 'paid'
    payout.providerHeldBeforeUnits = '99'
    payout.providerHeldAfterUnits = '99'
    payout.providerPaidBeforeUnits = '0'
    payout.providerPaidAfterUnits = '99'
    provider.balanceUnits = '0'
    const before = structuredClone(db.rows('moneyPayouts'))
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(db.rows('moneyPayouts')).toEqual(before)
    expect(provider).toMatchObject({ balanceUnits: '0', recoveryDueUnits: '99' })
  })
})
