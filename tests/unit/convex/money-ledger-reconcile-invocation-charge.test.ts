import { describe, expect, it, vi } from 'vitest'

import { accountRefForProvider } from '@/modules/money/public'

import {
  MemoryDb,
  type Row,
  attemptRef,
  credentialId,
  invocationRef,
  now,
  reconcileHandler,
  reconciliationArgs,
  refundTransactionRef,
  sourceDigest,
  transactionRef,
} from './money-ledger-test-harness'
import {
  seedBudget,
  seedPaidCharge,
  settleSeededChargeBudget,
} from './money-ledger-test-fixtures'

describe('exact invocation money reconciliation', () => {
  it('refunds an accepted charge, releases budget, and replays without a second refund', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'reversed' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(1)
    expect(
      db
        .rows('moneyCredentialBudgetStates')
        .every((row) => row.reservedUnits === '0' && row.reservedCount === 0),
    ).toBe(true)
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(1)
  })

  it.each([
    {
      name: 'source digest',
      mutate: (args: Record<string, unknown>) => ({
        ...args,
        sourceDigest: 'sha256:changed-source',
      }),
    },
    {
      name: 'evidence refs',
      mutate: (args: Record<string, unknown>) => ({
        ...args,
        evidenceRefs: ['operation-money-reconciliation:changed'],
      }),
    },
  ])('refuses changed replay $name without writes', async ({ mutate }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    const insert = vi.spyOn(db, 'insert')
    const patch = vi.spyOn(db, 'patch')
    try {
      await expect(
        reconcileHandler({ db }, mutate(reconciliationArgs())),
      ).resolves.toEqual({ kind: 'reconciliation_required' })
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
      expect(
        db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
      ).toHaveLength(1)
      expect(
        db
          .rows('moneyLedgerEntries')
          .filter((row) => row.transactionRef === refundTransactionRef),
      ).toHaveLength(3)
      expect({
        accounts: db.rows('moneyAccounts'),
        budgets: db.rows('moneyCredentialBudgetStates'),
        payouts: db.rows('moneyPayouts'),
        transactions: db.rows('moneyTransactions'),
        entries: db.rows('moneyLedgerEntries'),
      }).toEqual(before)
    } finally {
      insert.mockRestore()
      patch.mockRestore()
    }
  })

  it('refuses a fourth refund-journal row before replay writes', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    const refundEntry = db
      .rows('moneyLedgerEntries')
      .find((row) => row.transactionRef === refundTransactionRef)
    if (refundEntry === undefined) throw new Error('refund_entry_fixture_missing')
    db.seed('moneyLedgerEntries', {
      ...refundEntry,
      _id: 'entry:refund-fourth',
      entryRef: `${refundTransactionRef}:fourth`,
      accountRef: 'forged:refund-fourth',
    })
    expect(
      db
        .rows('moneyLedgerEntries')
        .filter((row) => row.transactionRef === refundTransactionRef),
    ).toHaveLength(4)
    const insert = vi.spyOn(db, 'insert')
    const patch = vi.spyOn(db, 'patch')
    try {
      await expect(
        reconcileHandler({ db }, reconciliationArgs()),
      ).resolves.toEqual({ kind: 'reconciliation_required' })
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
      expect(
        db
          .rows('moneyLedgerEntries')
          .filter((row) => row.transactionRef === refundTransactionRef),
      ).toHaveLength(4)
      expect(
        db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
      ).toHaveLength(1)
    } finally {
      insert.mockRestore()
      patch.mockRestore()
    }
  })

  it.each(
    (['operator', 'provider', 'rake'] as const).flatMap((role) =>
      (
        [
          'entryRef',
          'accountRef',
          'direction',
          'amountUnits',
          'allocationCorrectionUnits',
          'currency',
          'exponent',
          'principalId',
          'businessId',
          'invocationRef',
          'attemptRef',
          'createdAt',
          'sourceDigest',
          'evidenceRefs',
        ] as const
      ).map((field) => ({ name: `${role} ${field}`, role, field })),
    ),
  )('refuses replay with changed $name without writes', async ({ role, field }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    const entry = db
      .rows('moneyLedgerEntries')
      .find((row) => row.entryRef === `${refundTransactionRef}:${role}`)
    if (entry === undefined) throw new Error('refund_entry_fixture_missing')
    if (field === 'entryRef') entry.entryRef = 'forged:refund-entry'
    else if (field === 'accountRef') entry.accountRef = 'forged:refund-account'
    else if (field === 'direction') entry.direction = entry.direction === 'credit' ? 'debit' : 'credit'
    else if (field === 'amountUnits') entry.amountUnits = '101'
    else if (field === 'allocationCorrectionUnits') entry.allocationCorrectionUnits = '98'
    else if (field === 'currency') entry.currency = 'EUR'
    else if (field === 'exponent') entry.exponent = 3
    else if (field === 'principalId') entry.principalId = 'forged:principal'
    else if (field === 'businessId') entry.businessId = 'forged:business'
    else if (field === 'invocationRef') entry.invocationRef = 'forged:invocation'
    else if (field === 'attemptRef') entry.attemptRef = 'forged:attempt'
    else if (field === 'createdAt') entry.createdAt = now + 1
    else if (field === 'sourceDigest') entry.sourceDigest = 'sha256:changed-source'
    else entry.evidenceRefs = ['evidence:changed']
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    const insert = vi.spyOn(db, 'insert')
    const patch = vi.spyOn(db, 'patch')
    try {
      await expect(
        reconcileHandler({ db }, reconciliationArgs()),
      ).resolves.toEqual({ kind: 'reconciliation_required' })
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
      expect({
        accounts: db.rows('moneyAccounts'),
        budgets: db.rows('moneyCredentialBudgetStates'),
        payouts: db.rows('moneyPayouts'),
        transactions: db.rows('moneyTransactions'),
        entries: db.rows('moneyLedgerEntries'),
      }).toEqual(before)
    } finally {
      insert.mockRestore()
      patch.mockRestore()
    }
  })

  it('refuses replay when a second by_reversalOf transaction exists', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    const refund = db
      .rows('moneyTransactions')
      .find((row) => row.transactionRef === refundTransactionRef)
    if (refund === undefined) throw new Error('refund_transaction_fixture_missing')
    db.seed('moneyTransactions', {
      ...refund,
      _id: 'transaction:forged-refund',
      transactionRef: 'forged-refund',
      idempotencyKey: 'forged-refund-key',
      inputDigest: 'sha256:forged-refund',
      createdAt: now + 1,
      updatedAt: now + 1,
    })
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    const insert = vi.spyOn(db, 'insert')
    const patch = vi.spyOn(db, 'patch')
    try {
      await expect(
        reconcileHandler({ db }, reconciliationArgs()),
      ).resolves.toEqual({ kind: 'reconciliation_required' })
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
      expect({
        accounts: db.rows('moneyAccounts'),
        budgets: db.rows('moneyCredentialBudgetStates'),
        payouts: db.rows('moneyPayouts'),
        transactions: db.rows('moneyTransactions'),
        entries: db.rows('moneyLedgerEntries'),
      }).toEqual(before)
    } finally {
      insert.mockRestore()
      patch.mockRestore()
    }
  })

  it('accepts a recovery-adjusted journal and refunds full provider credit once', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
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
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db
        .rows('moneyLedgerEntries')
        .filter(
          (row) =>
            row.transactionRef === transactionRef &&
            row.entryType === 'payout_accrual' &&
            row.direction === 'debit',
        ),
    ).toHaveLength(1)
    expect(
      db
        .rows('moneyTransactions')
        .filter((row) => row.kind === 'refund'),
    ).toHaveLength(1)
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'reversed' })
    expect(
      db
        .rows('moneyLedgerEntries')
        .find(
          (row) =>
            row.transactionRef === refundTransactionRef &&
            row.accountRef === accountRefForProvider('business:money', 'USD'),
        ),
    ).toMatchObject({ entryType: 'refund', amountUnits: '99' })
    expect(
      db
        .rows('moneyCredentialBudgetStates')
        .every((row) => row.reservedUnits === '0' && row.reservedCount === 0),
    ).toBe(true)
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(1)
    expect(provider).toMatchObject({ balanceUnits: '0', recoveryDueUnits: '10' })
  })
  it.each([
    {
      name: "recovery row principalId differs from the provider row's optional principalId",
      mutate: (recovery: Row, _provider: Row) => {
        recovery.principalId = 'principal:forged'
      },
    },
    {
      name: 'recovery row createdAt differs from provider and transaction',
      mutate: (recovery: Row, _provider: Row) => {
        recovery.createdAt = now + 1
      },
    },
    {
      name: 'provider and recovery createdAt differ from the transaction',
      mutate: (recovery: Row, provider: Row) => {
        recovery.createdAt = now + 1
        provider.createdAt = now + 1
      },
    },
  ])('refuses recovery adjustment when $name', async ({ mutate }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    const providerAccount = db
      .rows('moneyAccounts')
      .find((row) => row._id === 'account:provider')
    const providerEntry = db
      .rows('moneyLedgerEntries')
      .find((row) => row._id === 'entry:provider')
    if (providerAccount === undefined || providerEntry === undefined)
      throw new Error('provider_fixture_missing')
    providerAccount.balanceUnits = '89'
    const recovery: Row = {
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
    }
    mutate(recovery, providerEntry)
    db.seed('moneyLedgerEntries', recovery)
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
    }

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect({
      accounts: db.rows('moneyAccounts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
    }).toEqual(before)
  })



  it('reverses settled credential budget spend once and replays without underflow', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db)

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db
        .rows('moneyCredentialBudgetStates')
        .filter((row) => row.windowKind !== 'concurrency'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ settledUnits: '0', reservedUnits: '0' }),
        expect.objectContaining({ settledUnits: '0', reservedUnits: '0' }),
      ]),
    )
    expect(
      db
        .rows('moneyCredentialBudgetStates')
        .find((row) => row.windowKind === 'concurrency'),
    ).toMatchObject({ settledUnits: '0', reservedUnits: '0', reservedCount: 0 })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'reversed', budgetState: 'released' })
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(1)
    expect(
      db
        .rows('moneyCredentialBudgetStates')
        .filter((row) => row.windowKind !== 'concurrency')
        .every((row) => row.settledUnits === '0'),
    ).toBe(true)
  })

  it('refuses settled budget reversal underflow before refund writes', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db)
    const day = db
      .rows('moneyCredentialBudgetStates')
      .find((row) => row.windowKind === 'day')
    if (day === undefined) throw new Error('budget_fixture_missing')
    day.settledUnits = '99'

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'applied', budgetState: 'settled' })
    expect(
      db
        .rows('moneyCredentialBudgetStates')
        .filter((row) => row.windowKind !== 'concurrency'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ windowKind: 'day', settledUnits: '99' }),
        expect.objectContaining({ windowKind: 'month', settledUnits: '100' }),
      ]),
    )
  })
  it('settles after release proof without creating a refund', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db, 'outcome_unknown')

    await expect(
      reconcileHandler({ db }, reconciliationArgs('released')),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'applied', budgetState: 'settled' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
  })
  it('refuses released reconciliation before payout write when budget settlement is invalid', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db, 'outcome_unknown')
    const concurrency = db.rows('moneyCredentialBudgetStates').find(
      (row) => row.windowKind === 'concurrency',
    )
    if (concurrency === undefined) throw new Error('budget_fixture_missing')
    concurrency.reservedCount = 0
    const before = {
      payouts: structuredClone(db.rows('moneyPayouts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      transaction: structuredClone(db.rows('moneyTransactions')),
    }
    await expect(
      reconcileHandler({ db }, reconciliationArgs('released')),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    expect({
      payouts: db.rows('moneyPayouts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      transaction: db.rows('moneyTransactions'),
    }).toEqual(before)
  })
  it('settles a released paid charge without creating a payout period', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db, 'outcome_unknown')

    await expect(
      reconcileHandler({ db }, reconciliationArgs('released')),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({
      state: 'applied',
      budgetState: 'settled',
      settledAt: now,
    })
    expect(db.rows('moneyPayouts')).toHaveLength(0)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
  })

  it('returns none when no accepted charge exists', async () => {
    await expect(
      reconcileHandler({ db: new MemoryDb() }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'none' })
  })

  it('keeps reconciliation required when refund proof fails', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    db.remove('moneyAccounts', (row) => row._id === 'account:provider')

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'applied', budgetState: 'reserved' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
  })
  it('refuses a charge whose usage principal or attempt does not match', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    db.remove('moneyUsageEvents', () => true)
    db.seed('moneyUsageEvents', {
      _id: 'usage:mismatch',
      invocationRef,
      attemptRef: 'operation-attempt:other:1',
      principalId: 'principal:other',
      credentialId,
      transactionRef,
      chargeState: 'paid',
    })

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
  })
})
