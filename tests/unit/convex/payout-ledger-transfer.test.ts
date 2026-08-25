import { describe, expect, it, vi } from 'vitest'

import {
  MemoryDb,
  STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
  amount,
  begin,
  canonicalDigest,
  commandArgs,
  complete,
  completionArgs,
  creditProvider,
  dailyPayoutAllocationRef,
  dailyPayoutPeriodEnd,
  dailyPayoutRef,
  evidence,
  identity,
  markUnknown,
  normalProviderEvidenceObservedAt,
  normalTransferObservedAt,
  reconcile,
  seedPayout,
} from './payout-ledger-test-harness'

vi.mock('../../../convex/sourceWriteAdmission', () => ({
  sourceWriteArgs: {},
  requireSourceWrite: vi.fn(async () => ({ kind: 'accepted' as const })),
}))

describe('Convex payout persistence — transfer', () => {
  it('atomically reserves provider earnings before transfer effect and replays exactly', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    const reservationRef = canonicalDigest({
      format: 'money-payout-reservation-transaction:v1',
      payoutRef: args.payoutRef,
      payoutCommandId: args.commandId,
      inputDigest: args.inputDigest,
      idempotencyKey: args.idempotencyKey,
    })
    await expect(begin({ db, auth: identity }, args)).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'transfer_pending',
        providerHeldBefore: amount,
        providerHeldAfter: { currency: 'USD', units: '0', exponent: 2 },
        providerPaidBefore: { currency: 'USD', units: '0', exponent: 2 },
      },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('0')
    expect(db.rows('moneyTransactions')).toHaveLength(1)
    expect(db.rows('moneyTransactions')[0]).toMatchObject({
      transactionRef: reservationRef,
      kind: 'payout_accrual',
      state: 'pending',
      amountUnits: '5000',
      expectedAccountVersion: 1,
    })
    expect(db.rows('moneyLedgerEntries')[0]).toMatchObject({
      entryRef: `${reservationRef}:payout-reservation`,
      direction: 'debit',
      amountUnits: '5000',
    })
    expect(db.rows('moneyLedgerEntries')[0]).not.toHaveProperty('payoutRef')
    const replay = await begin({ db, auth: identity }, args)
    expect(replay).toMatchObject({
      kind: 'accepted',
      transfer: { state: 'transfer_pending' },
    })
    expect(db.rows('moneyTransactions')).toHaveLength(1)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
  })
  it('replays a reservation despite malformed correction while new admission remains strict', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    db.seed('moneyLedgerEntries', {
      _id: 'moneyLedgerEntries:malformed-correction',
      entryRef: 'malformed-correction',
      accountRef: 'business:business-1:USD',
      entryType: 'refund',
      direction: 'debit',
      amountUnits: '5000',
      currency: 'USD',
      exponent: 2,
      transactionRef: 'malformed-correction',
      idempotencyKey: 'malformed-correction',
      businessId: 'business-1',
      payoutRef: dailyPayoutRef,
      allocationRef: 'allocation:missing',
      allocationCorrectionUnits: '5000',
      reversalOf: 'transaction:missing',
      sourceDigest: 'sha256:malformed-correction',
      evidenceRefs: ['sha256:malformed-correction'],
      createdAt: normalTransferObservedAt,
    })
    const beforeReplay = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(begin({ db, auth: identity }, args)).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'transfer_pending' },
    })
    expect(db.rows('moneyAccounts')).toEqual(beforeReplay.accounts)
    expect(db.rows('moneyPayouts')).toEqual(beforeReplay.payouts)
    expect(db.rows('moneyTransactions')).toEqual(beforeReplay.transactions)
    expect(db.rows('moneyLedgerEntries')).toEqual(beforeReplay.entries)
    await expect(
      begin(
        { db, auth: identity },
        {
          ...args,
          commandId: 'command-2',
          inputDigest: 'sha256:input-2',
          requestDigest: 'sha256:request-2',
          idempotencyKey: 'payout-idempotency-2',
        },
      ),
    ).resolves.toMatchObject({ kind: 'refused', code: 'payout_not_ready' })
  })


  it('replays paid terminal reservation after same-period composition drift without writes', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    creditProvider(db, '1250', normalTransferObservedAt + 1)
    const successArgs = completionArgs(args, evidence('succeeded'))
    await expect(
      complete({ db, auth: identity }, successArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'paid', transferStatus: 'succeeded' },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('1250')
    expect(db.rows('moneyTransactions')).toHaveLength(1)
    expect(db.rows('moneyTransactions')[0]?.state).toBe('applied')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
    creditProvider(db, '500', normalTransferObservedAt + 2)
    await expect(
      complete({ db, auth: identity }, successArgs),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'paid' } })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('1750')
    expect(db.rows('moneyTransactions')).toHaveLength(1)
    const provider = db.rows('moneyAccounts')[0]
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.balanceUnits = '250'
    provider.recoveryDueUnits = '125'
    provider.version = 3
    provider.updatedAt = normalTransferObservedAt + 3
    const allocation = db.rows('moneyPayoutAllocations')[0]
    if (allocation === undefined) throw new Error('allocation_fixture_missing')
    allocation.providerNetUnits = '6000'
    const beforeReplay = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(begin({ db, auth: identity }, args)).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'paid' },
    })
    await expect(
      complete({ db, auth: identity }, successArgs),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'paid' } })
    expect(db.rows('moneyAccounts')).toEqual(beforeReplay.accounts)
    expect(db.rows('moneyPayouts')).toEqual(beforeReplay.payouts)
    expect(db.rows('moneyTransactions')).toEqual(beforeReplay.transactions)
    expect(db.rows('moneyLedgerEntries')).toEqual(beforeReplay.entries)
    await expect(
      begin(
        { db, auth: identity },
        {
          ...args,
          commandId: 'command-2',
          inputDigest: 'sha256:input-2',
          requestDigest: 'sha256:request-2',
          idempotencyKey: 'payout-idempotency-2',
        },
      ),
    ).resolves.toMatchObject({ kind: 'refused', code: 'payout_not_ready' })
  })

  it('preserves closed-period and bounded daily composition admission', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const beforePayouts = structuredClone(db.rows('moneyPayouts'))
    const beforeAccounts = structuredClone(db.rows('moneyAccounts'))
    await expect(
      begin(
        { db, auth: identity },
        {
          ...commandArgs(),
          observedAt: Date.parse(dailyPayoutPeriodEnd) - 1,
          providerRecoveryDeadlineAt:
            Date.parse(dailyPayoutPeriodEnd) - 1 +
            STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
        },
      ),
    ).resolves.toMatchObject({ kind: 'refused', code: 'payout_not_ready' })
    expect(db.rows('moneyPayouts')).toEqual(beforePayouts)
    expect(db.rows('moneyAccounts')).toEqual(beforeAccounts)
    const malformed = new MemoryDb()
    seedPayout(malformed)
    const allocation = malformed.rows('moneyPayoutAllocations')[0]
    if (allocation === undefined) throw new Error('allocation_fixture_missing')
    allocation.providerNetUnits = '4999'
    await expect(
      begin({ db: malformed, auth: identity }, commandArgs()),
    ).resolves.toMatchObject({ kind: 'refused', code: 'payout_not_ready' })
    expect(malformed.rows('moneyAccounts')[0]?.balanceUnits).toBe('5000')
    expect(malformed.rows('moneyTransactions')).toHaveLength(0)
  })

  it('uses the latest completed payout snapshot after bounded history reads', async () => {
    const db = new MemoryDb(1_000)
    seedPayout(db)
    db.seed('moneyPayouts', {
      _id: 'moneyPayouts:prior',
      payoutRef: 'payout-prior',
      businessId: 'business-1',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '7700',
      rakeUnits: '700',
      providerNetUnits: '7000',
      minimumPayoutUnits: '1000',
      state: 'paid',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      payoutCommandId: 'command-prior',
      inputDigest: 'sha256:input-prior',
      transferRequestDigest: 'sha256:request-prior',
      transferEvidenceDigest: 'sha256:evidence-prior',
      transferStatus: 'succeeded',
      stripeTransferId: 'tr_prior',
      providerHeldBeforeUnits: '12000',
      providerHeldAfterUnits: '5000',
      providerPaidBeforeUnits: '0',
      providerPaidAfterUnits: '7000',
      idempotencyKey: 'payout-prior-idempotency',
      createdAt: 1,
      updatedAt: 2,
    })
    for (let index = 0; index <= 1_000; index += 1) {
      db.seed('moneyLedgerEntries', {
        _id: `moneyLedgerEntries:history-${index}`,
        entryRef: `history-${index}`,
        accountRef: 'business:business-1:USD',
        entryType: 'charge',
        direction: 'debit',
        amountUnits: '1',
        currency: 'USD',
        exponent: 2,
        transactionRef: `history-transaction-${index}`,
        idempotencyKey: `history-idempotency-${index}`,
        sourceDigest: `sha256:history-${index}`,
        evidenceRefs: [],
        createdAt: index,
      })
    }
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    await expect(
      complete({ db, auth: identity }, completionArgs(args, evidence('succeeded'))),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'paid',
        providerPaidBefore: { currency: 'USD', units: '7000', exponent: 2 },
        providerPaidAfter: { currency: 'USD', units: '12000', exponent: 2 },
      },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('0')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1_002)
  })

  it.each([
    {
      name: 'source digest',
      mutate: (args: Record<string, unknown>) => {
        args.sourceDigest = 'sha256:wrong-source'
      },
    },
    {
      name: 'provider account',
      mutate: (args: Record<string, unknown>) => {
        args.providerAccountRef = 'provider:other:USD'
      },
    },
    {
      name: 'business',
      mutate: (args: Record<string, unknown>) => {
        args.businessId = 'business-other'
      },
    },
    {
      name: 'currency',
      mutate: (args: Record<string, unknown>) => {
        args.amount = { currency: 'EUR', units: '5000', exponent: 2 }
      },
    },
    {
      name: 'amount',
      mutate: (args: Record<string, unknown>) => {
        args.amount = { currency: 'USD', units: '4000', exponent: 2 }
      },
    },
    {
      name: 'destination account',
      mutate: (args: Record<string, unknown>) => {
        args.destinationAccountId = 'acct_other'
      },
    },
  ])('rejects $name substitution without partial writes', async ({ mutate }) => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    const attempted = completionArgs(args, evidence('succeeded'))
    mutate(attempted)
    const beforeAccounts = structuredClone(db.rows('moneyAccounts'))
    const beforeTransactions = structuredClone(db.rows('moneyTransactions'))
    const beforeEntries = structuredClone(db.rows('moneyLedgerEntries'))
    await expect(
      complete({ db, auth: identity }, attempted),
    ).resolves.toMatchObject({ kind: 'refused' })
    expect(db.rows('moneyAccounts')).toEqual(beforeAccounts)
    expect(db.rows('moneyTransactions')).toEqual(beforeTransactions)
    expect(db.rows('moneyLedgerEntries')).toEqual(beforeEntries)
  })

  it('rejects a regressed provider account generation without partial writes', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    const provider = db.rows('moneyAccounts')[0]
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.version = 1
    const before = structuredClone(db.rows('moneyPayouts'))
    await expect(
      complete(
        { db, auth: identity },
        completionArgs(args, evidence('succeeded')),
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    expect(db.rows('moneyPayouts')).toEqual(before)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
  })

  it('resolves an outcome-unknown reservation after a provider credit', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    creditProvider(db, '1250', normalTransferObservedAt + 1)
    await expect(
      markUnknown(
        { db, auth: identity },
        { ...args, failureCode: 'payout_outcome_unknown' },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'outcome_unknown' },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('1250')
    expect(db.rows('moneyTransactions')[0]?.state).toBe('outcome_unknown')
    await expect(
      complete(
        { db, auth: identity },
        completionArgs(args, evidence('succeeded')),
      ),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'paid' } })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('1250')
    expect(db.rows('moneyTransactions')[0]?.state).toBe('applied')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
  })

  it('restores a failed reservation onto current provider balance and replays after credit', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    creditProvider(db, '1250', normalTransferObservedAt + 1)
    const failed = completionArgs(args, evidence('failed'))
    await expect(
      complete({ db, auth: identity }, failed),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'held_threshold', transferStatus: 'failed' },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('6250')
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyTransactions')[0]?.state).toBe('reversed')
    expect(db.rows('moneyTransactions')[1]?.expectedAccountVersion).toBe(3)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
    const afterFailure = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      complete({ db, auth: identity }, failed),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'held_threshold',
        transferStatus: 'failed',
        amount,
        evidenceDigest: 'sha256:evidence-1',
      },
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(afterFailure)
    const differentArgs = {
      ...args,
      commandId: 'command-2',
      inputDigest: 'sha256:input-2',
      requestDigest: 'sha256:request-2',
      idempotencyKey: 'payout-idempotency-2',
    }
    const beforeDifferent = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      begin({ db, auth: identity }, differentArgs),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'payout_not_ready',
      retryable: false,
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeDifferent)
    const changedCompletion = completionArgs(differentArgs, {
      ...evidence('failed', 'sha256:evidence-2'),
      requestDigest: 'sha256:request-2',
    })
    await expect(
      complete({ db, auth: identity }, changedCompletion),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
      retryable: false,
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeDifferent)


    creditProvider(db, '500', normalTransferObservedAt + 2)
    await expect(
      complete({ db, auth: identity }, failed),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'held_threshold' } })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('6750')
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
    const provider = db.rows('moneyAccounts')[0]
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.balanceUnits = '4000'
    provider.recoveryDueUnits = '200'
    provider.version = 6
    provider.updatedAt = normalTransferObservedAt + 3
    const beforeReplay = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      complete({ db, auth: identity }, failed),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'held_threshold' } })
    expect(db.rows('moneyAccounts')).toEqual(beforeReplay.accounts)
    expect(db.rows('moneyPayouts')).toEqual(beforeReplay.payouts)
    expect(db.rows('moneyTransactions')).toEqual(beforeReplay.transactions)
    expect(db.rows('moneyLedgerEntries')).toEqual(beforeReplay.entries)
  })
  it('replays failed reservation after canonical same-period provider correction', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    creditProvider(db, '1250', normalTransferObservedAt + 1)
    const failed = completionArgs(args, evidence('failed'))
    await expect(
      complete({ db, auth: identity }, failed),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'held_threshold', transferStatus: 'failed' },
    })
    const payout = db.rows('moneyPayouts')[0]
    const allocation = db.rows('moneyPayoutAllocations')[0]
    if (payout === undefined || allocation === undefined)
      throw new Error('payout_correction_fixture_missing')
    payout.grossAccrualUnits = '0'
    payout.rakeUnits = '0'
    payout.providerNetUnits = '0'
    allocation.grossAccrualUnits = '0'
    allocation.rakeUnits = '0'
    allocation.providerNetUnits = '0'
    db.seed('moneyLedgerEntries', {
      _id: 'moneyLedgerEntries:provider-refund-correction',
      entryRef: 'provider-refund-correction',
      accountRef: 'business:business-1:USD',
      entryType: 'refund',
      direction: 'debit',
      amountUnits: '5000',
      currency: 'USD',
      exponent: 2,
      transactionRef: 'provider-refund-correction',
      idempotencyKey: 'provider-refund-correction',
      businessId: 'business-1',
      payoutRef: dailyPayoutRef,
      allocationRef: dailyPayoutAllocationRef,
      allocationCorrectionUnits: '5000',
      reversalOf: 'transaction:payout-1',
      sourceDigest: 'sha256:provider-refund-correction',
      evidenceRefs: ['sha256:provider-refund-correction'],
      createdAt: normalTransferObservedAt + 2,
    })
    const beforeReplay = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      begin({ db, auth: identity }, args),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'held_threshold', amount },
    })
    await expect(
      complete({ db, auth: identity }, failed),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'held_threshold', amount },
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      allocations: db.rows('moneyPayoutAllocations'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeReplay)
    await expect(
      begin(
        { db, auth: identity },
        {
          ...args,
          commandId: 'command-2',
          inputDigest: 'sha256:input-2',
          idempotencyKey: 'payout-idempotency-2',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_not_ready',
    })
  })

  it('restores an unknown not-released reservation onto current balance', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    creditProvider(db, '1250', normalTransferObservedAt + 1)
    await markUnknown(
      { db, auth: identity },
      { ...args, failureCode: 'payout_outcome_unknown' },
    )
    const notReleased = {
      provider: 'stripe' as const,
      resolution: 'not_released' as const,
      destinationAccountId: 'acct_1',
      amount,
      status: 'failed' as const,
      requestDigest: 'sha256:request-1',
      evidenceDigest: 'sha256:group-empty',
      observedAt: normalProviderEvidenceObservedAt,
    }
    const reconciliation = {
      ...completionArgs(args, notReleased),
      outcome: 'not_released' as const,
    }
    await expect(
      reconcile({ db, auth: identity }, reconciliation),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'held_threshold' } })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('6250')
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
    const afterReconciliation = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      reconcile({ db, auth: identity }, reconciliation),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'held_threshold',
        transferStatus: 'failed',
        amount,
        evidenceDigest: 'sha256:group-empty',
      },
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(afterReconciliation)
    const differentArgs = {
      ...args,
      commandId: 'command-2',
      inputDigest: 'sha256:input-2',
      requestDigest: 'sha256:request-2',
      idempotencyKey: 'payout-idempotency-2',
    }
    const beforeDifferent = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      begin({ db, auth: identity }, differentArgs),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'payout_not_ready',
      retryable: false,
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeDifferent)
    const changedReconciliation = {
      ...completionArgs(differentArgs, {
        ...notReleased,
        requestDigest: 'sha256:request-2',
        evidenceDigest: 'sha256:group-empty-2',
      }),
      outcome: 'not_released' as const,
    }
    await expect(
      reconcile({ db, auth: identity }, changedReconciliation),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
      retryable: false,
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeDifferent)
    creditProvider(db, '500', normalTransferObservedAt + 2)
    const payout = db.rows('moneyPayouts')[0]
    const allocation = db.rows('moneyPayoutAllocations')[0]
    if (payout === undefined || allocation === undefined)
      throw new Error('payout_correction_fixture_missing')
    payout.grossAccrualUnits = '0'
    payout.rakeUnits = '0'
    payout.providerNetUnits = '0'
    allocation.grossAccrualUnits = '0'
    allocation.rakeUnits = '0'
    allocation.providerNetUnits = '0'
    const beforeReplay = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      reconcile({ db, auth: identity }, reconciliation),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'held_threshold' } })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('6750')
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      allocations: db.rows('moneyPayoutAllocations'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeReplay)
  })
  it('fences orphaned payout rows and journals without admitting a second command', async () => {
    const differentArgs = {
      ...commandArgs(),
      commandId: 'command-2',
      inputDigest: 'sha256:input-2',
      requestDigest: 'sha256:request-2',
      idempotencyKey: 'payout-idempotency-2',
    }
    const rowWithoutAttemptMaterial = new MemoryDb()
    seedPayout(rowWithoutAttemptMaterial)
    await begin(
      { db: rowWithoutAttemptMaterial, auth: identity },
      commandArgs(),
    )
    const attemptedPayout = rowWithoutAttemptMaterial.rows('moneyPayouts')[0]
    if (attemptedPayout === undefined)
      throw new Error('attempted_payout_fixture_missing')
    await rowWithoutAttemptMaterial.patch(attemptedPayout._id, {
      payoutCommandId: undefined,
      inputDigest: undefined,
      destinationAccountId: undefined,
      transferRequestDigest: undefined,
      transferStatus: undefined,
      providerRecoveryDeadlineAt: undefined,
      providerHeldBeforeUnits: undefined,
      providerHeldAfterUnits: undefined,
      providerPaidBeforeUnits: undefined,
      providerPaidAfterUnits: undefined,
      stripeTransferId: undefined,
      transferEvidenceDigest: undefined,
      transferReversalEvidenceDigest: undefined,
      transferObservedAt: undefined,
      failureCode: undefined,
    })
    const beforeMissingRowMaterial = {
      accounts: structuredClone(rowWithoutAttemptMaterial.rows('moneyAccounts')),
      payouts: structuredClone(rowWithoutAttemptMaterial.rows('moneyPayouts')),
      transactions: structuredClone(
        rowWithoutAttemptMaterial.rows('moneyTransactions'),
      ),
      entries: structuredClone(
        rowWithoutAttemptMaterial.rows('moneyLedgerEntries'),
      ),
    }
    await expect(
      begin(
        { db: rowWithoutAttemptMaterial, auth: identity },
        differentArgs,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'payout_not_ready',
      retryable: false,
    })
    expect({
      accounts: rowWithoutAttemptMaterial.rows('moneyAccounts'),
      payouts: rowWithoutAttemptMaterial.rows('moneyPayouts'),
      transactions: rowWithoutAttemptMaterial.rows('moneyTransactions'),
      entries: rowWithoutAttemptMaterial.rows('moneyLedgerEntries'),
    }).toEqual(beforeMissingRowMaterial)

    const missingJournal = new MemoryDb()
    seedPayout(missingJournal)
    const orphanedPayout = missingJournal.rows('moneyPayouts')[0]
    if (orphanedPayout === undefined)
      throw new Error('orphaned_payout_fixture_missing')
    await missingJournal.patch(orphanedPayout._id, {
      payoutCommandId: 'command-prior',
      inputDigest: 'sha256:input-prior',
      destinationAccountId: 'acct_1',
      transferRequestDigest: 'sha256:request-prior',
      transferStatus: 'failed',
    })
    const beforeMissingJournal = {
      accounts: structuredClone(missingJournal.rows('moneyAccounts')),
      payouts: structuredClone(missingJournal.rows('moneyPayouts')),
      transactions: structuredClone(missingJournal.rows('moneyTransactions')),
      entries: structuredClone(missingJournal.rows('moneyLedgerEntries')),
    }
    await expect(
      begin({ db: missingJournal, auth: identity }, differentArgs),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'payout_not_ready',
      retryable: false,
    })
    expect({
      accounts: missingJournal.rows('moneyAccounts'),
      payouts: missingJournal.rows('moneyPayouts'),
      transactions: missingJournal.rows('moneyTransactions'),
      entries: missingJournal.rows('moneyLedgerEntries'),
    }).toEqual(beforeMissingJournal)
  })
})
