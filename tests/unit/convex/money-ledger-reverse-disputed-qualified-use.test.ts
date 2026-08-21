import { describe, expect, it, vi } from 'vitest'

import {
  accountRefForOwner,
  accountRefForProvider,
  qualifiedUseRef,
} from '@/modules/money/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  MemoryDb,
  type Row,
  attemptRef,
  disputeHandler,
  invocationRef,
  now,
  ownerId,
  sourceDigest,
  transactionRef,
} from './money-ledger-test-harness'
import { seedDisputeFixture } from './money-ledger-test-fixtures'

describe('exact invocation money reconciliation', () => {
  it('rejects disputed use when pooled owner credentials differ', async () => {
    const db = new MemoryDb()
    seedDisputeFixture(db, 'key-a', 'key-b')
    const qualifiedUse = qualifiedUseRef({
      invocationRef,
      attemptRef,
      effectGeneration: 1,
    })
    await expect(
      disputeHandler(
        { db },
        {
          qualifiedUseRef: qualifiedUse,
          disputeRef: 'dispute:credential-mismatch',
          sourceDigest: 'sha256:dispute-source',
          evidenceRefs: ['evidence:dispute'],
          observedAt: now,
        },
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_mismatch',
      retryable: false,
    })
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
        .every((row) => row.settledUnits === (row.windowKind === 'concurrency' ? '0' : '100')),
    ).toBe(true)
    expect(
      db
        .rows('moneyAccounts')
        .find((row) => row._id === 'account:provider'),
    ).toMatchObject({ balanceUnits: '99', recoveryDueUnits: '0' })
  })
  it.each([
    {
      name: 'stored account identity mismatch',
      mutate: (usage: Row) => {
        usage.accountId = 'owner:other'
      },
    },
    {
      name: 'stored business identity mismatch',
      mutate: (usage: Row) => {
        usage.businessId = 'business:other'
      },
    },
  ])('$name', async ({ mutate }) => {
    const db = new MemoryDb()
    seedDisputeFixture(db, 'key-a', 'key-a')
    const usage = db
      .rows('moneyUsageEvents')
      .find((row) => row._id === 'usage:money')
    if (usage === undefined) throw new Error('usage_fixture_missing')
    mutate(usage)
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    const qualifiedUse = qualifiedUseRef({
      invocationRef,
      attemptRef,
      effectGeneration: 1,
    })

    await expect(
      disputeHandler(
        { db },
        {
          qualifiedUseRef: qualifiedUse,
          disputeRef: 'dispute:stored-identity-mismatch',
          sourceDigest: 'sha256:dispute-source',
          evidenceRefs: ['evidence:dispute'],
          observedAt: now,
        },
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_mismatch',
      retryable: false,
    })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'applied', budgetState: 'settled' })
    expect({
      accounts: db.rows('moneyAccounts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      payouts: db.rows('moneyPayouts'),
    }).toEqual(before)
  })

  it.each([
    {
      name: 'charge account substitution',
      mutate: (db: MemoryDb) => {
        const entry = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:charge')
        if (entry === undefined) throw new Error('charge_entry_fixture_missing')
        db.seed('moneyAccounts', {
          _id: 'account:other-owner',
          accountRef: accountRefForOwner('owner:other', 'USD'),
          accountKind: 'operator_credit',
          accountId: 'owner:other',
          currency: 'USD',
          exponent: 2,
          balanceUnits: '0',
          recoveryDueUnits: '0',
          version: 1,
          state: 'active',
          createdAt: now,
          updatedAt: now,
        })
        entry.accountRef = accountRefForOwner('owner:other', 'USD')
      },
    },
    {
      name: 'provider account substitution',
      mutate: (db: MemoryDb) => {
        const entry = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:provider')
        if (entry === undefined) throw new Error('provider_entry_fixture_missing')
        db.seed('moneyAccounts', {
          _id: 'account:other-business',
          accountRef: accountRefForProvider('business:other', 'USD'),
          accountKind: 'provider_earnings',
          businessId: 'business:other',
          currency: 'USD',
          exponent: 2,
          balanceUnits: '99',
          recoveryDueUnits: '0',
          version: 1,
          state: 'active',
          createdAt: now,
          updatedAt: now,
        })
        entry.accountRef = accountRefForProvider('business:other', 'USD')
      },
    },
    {
      name: 'rake account substitution',
      mutate: (db: MemoryDb) => {
        const entry = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:rake')
        if (entry === undefined) throw new Error('rake_entry_fixture_missing')
        entry.accountRef = accountRefForOwner(ownerId, 'USD')
      },
    },
    {
      name: 'canonical row metadata drift',
      mutate: (db: MemoryDb) => {
        const entry = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:charge')
        if (entry === undefined) throw new Error('charge_entry_fixture_missing')
        entry.createdAt = now + 1
      },
    },
    {
      name: 'balanced charge amount inflation',
      mutate: (db: MemoryDb) => {
        const charge = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:charge')
        const provider = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:provider')
        const rake = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:rake')
        if (charge === undefined || provider === undefined || rake === undefined)
          throw new Error('charge_entry_fixture_missing')
        charge.amountUnits = '200'
        provider.amountUnits = '199'
        rake.amountUnits = '1'
      },
    },
  ])('refuses disputed use with $name without writes', async ({ mutate }) => {
    const db = new MemoryDb()
    seedDisputeFixture(db, 'key-a', 'key-a')
    mutate(db)
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
    }
    const qualifiedUse = qualifiedUseRef({
      invocationRef,
      attemptRef,
      effectGeneration: 1,
    })
    await expect(
      disputeHandler(
        { db },
        {
          qualifiedUseRef: qualifiedUse,
          disputeRef: 'dispute:canonical-journal-drift',
          sourceDigest: 'sha256:dispute-source',
          evidenceRefs: ['evidence:dispute'],
          observedAt: now,
        },
      ),
    ).resolves.toMatchObject({ kind: 'refused', retryable: false })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect(
      db.rows('moneyLedgerEntries').filter((row) => row.entryType === 'refund'),
    ).toHaveLength(0)
    expect({
      accounts: db.rows('moneyAccounts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      entries: db.rows('moneyLedgerEntries'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
    }).toEqual(before)
  })

  it('refuses a fifth charge-journal row instead of accepting a canonical four-row prefix', async () => {
    const db = new MemoryDb()
    seedDisputeFixture(db, 'key-a', 'key-a')
    const provider = db
      .rows('moneyLedgerEntries')
      .find((row) => row._id === 'entry:provider')
    const rake = db
      .rows('moneyLedgerEntries')
      .find((row) => row._id === 'entry:rake')
    if (provider === undefined || rake === undefined)
      throw new Error('entry_fixture_missing')
    db.seed('moneyLedgerEntries', {
      ...provider,
      _id: 'entry:provider-recovery',
      entryRef: `${transactionRef}:provider-recovery`,
      direction: 'debit',
      amountUnits: '10',
    })
    db.seed('moneyLedgerEntries', {
      ...rake,
      _id: 'entry:fifth',
      entryRef: `${transactionRef}:fifth`,
    })
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
    }
    const qualifiedUse = qualifiedUseRef({
      invocationRef,
      attemptRef,
      effectGeneration: 1,
    })

    await expect(
      disputeHandler(
        { db },
        {
          qualifiedUseRef: qualifiedUse,
          disputeRef: 'dispute:fifth-charge-row',
          sourceDigest: 'sha256:dispute-source',
          evidenceRefs: ['evidence:dispute'],
          observedAt: now,
        },
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_mismatch',
      retryable: false,
    })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect(
      db.rows('moneyLedgerEntries').filter((row) => row.entryType === 'refund'),
    ).toHaveLength(0)
    expect({
      accounts: db.rows('moneyAccounts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
    }).toEqual(before)
  })

  it('refuses transfer-pending dispute reversal without mutating settled credential budget', async () => {
    const db = new MemoryDb()
    seedDisputeFixture(db, 'key-a', 'key-a')
    const receipt = db
      .rows('qualifiedUseReceipts')
      .find((row) => row._id === 'receipt:money')
    if (receipt === undefined) throw new Error('receipt_fixture_missing')
    const periodStart = '1970-01-01T00:00:00.000Z'
    const periodEnd = '1970-01-02T00:00:00.000Z'
    const payoutRef = canonicalDigest({
      format: 'money-daily-payout:v1',
      businessId: 'business:money',
      currency: 'USD',
      periodStart,
      periodEnd,
    })
    db.seed('moneyPayoutAllocations', {
      _id: 'allocation:dispute-transfer-pending',
      allocationRef: canonicalDigest({
        format: 'money-qualified-use-allocation:v1',
        qualifiedUseRef: receipt.qualifiedUseRef,
        materialDigest: receipt.materialDigest,
      }),
      payoutRef,
      qualifiedUseRef: receipt.qualifiedUseRef,
      materialDigest: receipt.materialDigest,
      qualifiedAt: receipt.qualifiedAt,
      usageRef: receipt.usageRef,
      transactionRef: receipt.transactionRef,
      businessId: 'business:money',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
      sourceDigest,
      createdAt: now,
    })
    db.seed('moneyPayouts', {
      _id: 'payout:dispute-transfer-pending',
      payoutRef,
      businessId: 'business:money',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
      minimumPayoutUnits: '0',
      cadence: 'daily',
      state: 'transfer_pending',
      periodStart,
      periodEnd,
      providerAccountRef: accountRefForProvider('business:money', 'USD'),
      idempotencyKey: payoutRef,
      createdAt: now,
      updatedAt: now,
    })
    const payout = db
      .rows('moneyPayouts')
      .find((row) => row._id === 'payout:dispute-transfer-pending')
    if (payout === undefined) throw new Error('payout_fixture_missing')
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
    }
    const qualifiedUse = qualifiedUseRef({
      invocationRef,
      attemptRef,
      effectGeneration: 1,
    })

    await expect(
      disputeHandler(
        { db },
        {
          qualifiedUseRef: qualifiedUse,
          disputeRef: 'dispute:transfer-pending',
          sourceDigest: 'sha256:dispute-source',
          evidenceRefs: ['evidence:dispute'],
          observedAt: now,
        },
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'charge_reconciliation_required',
      retryable: false,
    })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect(
      db.rows('moneyLedgerEntries').filter((row) => row.entryType === 'refund'),
    ).toHaveLength(0)
    expect({
      accounts: db.rows('moneyAccounts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      entries: db.rows('moneyLedgerEntries'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
    }).toEqual(before)
  })


  it.each(['transfer_pending' as const, 'outcome_unknown' as const])(
    'refuses a refund from another period while the shared provider payout is $state',
    async (state) => {
    const db = new MemoryDb()
    seedDisputeFixture(db, 'key-a', 'key-a')
    db.seed('moneyPayouts', {
      _id: 'payout:other-period-unresolved',
      payoutRef: 'payout:other-period-unresolved',
      businessId: 'business:money',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '200',
      rakeUnits: '2',
      providerNetUnits: '198',
      minimumPayoutUnits: '0',
      state,
      periodStart: '1970-02-01',
      periodEnd: '1970-02-28',
      providerAccountRef: accountRefForProvider('business:money', 'USD'),
      idempotencyKey: 'payout:other-period-unresolved',
      createdAt: now,
      updatedAt: now,
    })
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
    }
    const qualifiedUse = qualifiedUseRef({
      invocationRef,
      attemptRef,
      effectGeneration: 1,
    })
    await expect(
      disputeHandler(
        { db },
        {
          qualifiedUseRef: qualifiedUse,
          disputeRef: 'dispute:other-period-unresolved',
          sourceDigest: 'sha256:dispute-other-period',
          evidenceRefs: ['evidence:dispute-other-period'],
          observedAt: now,
        },
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'charge_reconciliation_required',
      retryable: false,
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      entries: db.rows('moneyLedgerEntries'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
    }).toEqual(before)
  })

  it('accepts disputed use when pooled owner credentials match', async () => {
    const db = new MemoryDb()
    seedDisputeFixture(db, 'key-a', 'key-a')
    const qualifiedUse = qualifiedUseRef({
      invocationRef,
      attemptRef,
      effectGeneration: 1,
    })
    await expect(
      disputeHandler(
        { db },
        {
          qualifiedUseRef: qualifiedUse,
          disputeRef: 'dispute:credential-match',
          sourceDigest: 'sha256:dispute-source',
          evidenceRefs: ['evidence:dispute'],
          observedAt: now,
        },
      ),
    ).resolves.toEqual({
      kind: 'accepted',
      transactionRef: `qualified-use-dispute-refund:${qualifiedUse}`,
      currency: 'USD',
    })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(1)
    expect(
      db
        .rows('moneyLedgerEntries')
        .filter(
          (row) =>
            row.transactionRef ===
            `qualified-use-dispute-refund:${qualifiedUse}`,
        ),
    ).toHaveLength(3)
  })
})

it.each([
  { name: 'empty dispute ref', override: { disputeRef: '' } },
  { name: 'whitespace dispute ref', override: { disputeRef: '   ' } },
  { name: 'empty source digest', override: { sourceDigest: '' } },
  { name: 'whitespace source digest', override: { sourceDigest: '\t' } },
  { name: 'empty evidence refs', override: { evidenceRefs: [] } },
  { name: 'blank evidence ref', override: { evidenceRefs: [' '] } },
])('rejects $name before refund writes', async ({ override }) => {
  const db = new MemoryDb()
  seedDisputeFixture(db, 'key-a', 'key-a')
  const qualifiedUse = qualifiedUseRef({
    invocationRef,
    attemptRef,
    effectGeneration: 1,
  })
  const args = {
    qualifiedUseRef: qualifiedUse,
    disputeRef: 'dispute:test',
    sourceDigest: 'sha256:dispute-source',
    evidenceRefs: ['dispute:evidence:1'],
    observedAt: now,
    ...override,
  }
  const insert = vi.spyOn(db, 'insert')
  const patch = vi.spyOn(db, 'patch')
  try {
    await expect(
      disputeHandler({ db }, args),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'charge_reconciliation_required',
      retryable: false,
    })
    expect(insert).not.toHaveBeenCalled()
    expect(patch).not.toHaveBeenCalled()
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect(
      db.rows('moneyLedgerEntries').filter((row) => row.entryType === 'refund'),
    ).toHaveLength(0)
  } finally {
    insert.mockRestore()
    patch.mockRestore()
  }
})
