import { describe, expect, it, vi } from 'vitest'

import {
  MemoryDb,
  STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
  amount,
  begin,
  commandArgs,
  complete,
  completionArgs,
  creditProvider,
  dailyPayoutRef,
  evidence,
  identity,
  markUnknown,
  normalTransferObservedAt,
  ownerIdentity,
  readOwnerEarnings,
  readOwnerTransfer,
  readStatus,
  seedAdditionalDailyPayout,
  seedPayout,
} from './payout-ledger-test-harness'

vi.mock('../../../convex/sourceWriteAdmission', () => ({
  sourceWriteArgs: {},
  requireSourceWrite: vi.fn(async () => ({ kind: 'accepted' as const })),
}))

describe('Convex payout persistence — transfer snapshots', () => {
  it('derives bounded cumulative paid snapshots across older and latest reversals', async () => {
    const argsForPayout = (
      payoutRef: string,
      commandId: string,
      inputDigest: string,
      idempotencyKey: string,
      observedAt: number,
    ): Record<string, unknown> => ({
      ...commandArgs(),
      payoutRef,
      commandId,
      inputDigest,
      idempotencyKey,
      observedAt,
      providerRecoveryDeadlineAt:
        observedAt + STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
    })
    const argsA = commandArgs()
    const periodB = {
      start: '2026-07-02T00:00:00.000Z',
      end: '2026-07-03T00:00:00.000Z',
    }
    const periodC = {
      start: '2026-07-03T00:00:00.000Z',
      end: '2026-07-04T00:00:00.000Z',
    }
    const secondObservedAt = Date.parse(periodB.end) + 2
    const thirdObservedAt = Date.parse(periodC.end) + 1
    const db = new MemoryDb()
    seedPayout(db)
    const payoutB = seedAdditionalDailyPayout(
      db,
      'b',
      periodB.start,
      periodB.end,
    )
    const payoutC = seedAdditionalDailyPayout(
      db,
      'c',
      periodC.start,
      periodC.end,
    )
    await expect(
      begin({ db, auth: identity }, argsA),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'transfer_pending' },
    })
    await expect(
      complete(
        { db, auth: identity },
        completionArgs(argsA, evidence('succeeded')),
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'paid', providerPaidAfter: amount },
    })
    creditProvider(db, '5000', normalTransferObservedAt + 2)
    const argsB = {
      ...argsForPayout(
        payoutB,
        'command-2',
        'sha256:input-2',
        'payout-idempotency-2',
        secondObservedAt,
      ),
      requestDigest: 'sha256:request-2',
    }
    const evidenceB = {
      ...evidence('succeeded', 'sha256:evidence-b'),
      transferId: 'tr_2',
      requestDigest: 'sha256:request-2',
      observedAt: secondObservedAt + 1,
    }
    await expect(
      begin({ db, auth: identity }, argsB),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'transfer_pending',
        providerPaidBefore: amount,
      },
    })
    await expect(
      complete(
        { db, auth: identity },
        completionArgs(argsB, evidenceB),
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'paid',
        providerPaidAfter: { currency: 'USD', units: '10000', exponent: 2 },
      },
    })
    const reversalProcessedAt = secondObservedAt + 3
    const reverseA = completionArgs(
      { ...argsA, observedAt: reversalProcessedAt },
      {
        ...evidence('reversed', 'sha256:evidence-reversal-a'),
        observedAt: secondObservedAt,
      },
    )
    await expect(
      complete({ db, auth: identity }, reverseA),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'reversed', providerPaidAfter: amount },
    })
    const payoutARow = db.rows('moneyPayouts').find(
      (row) => row.payoutRef === dailyPayoutRef,
    )
    if (payoutARow === undefined) throw new Error('payout_a_missing')
    expect(payoutARow.providerPaidAfterUnits).toBe('5000')
    expect(payoutARow.transferObservedAt).toBe(secondObservedAt)
    expect(payoutARow.updatedAt).toBe(reversalProcessedAt)
    const beginC = await begin(
      { db, auth: identity },
      argsForPayout(
        payoutC,
        'command-3',
        'sha256:input-3',
        'payout-idempotency-3',
        thirdObservedAt,
      ),
    )
    expect(beginC).toMatchObject({
      kind: 'accepted',
      transfer: {
        providerPaidBefore: { currency: 'USD', units: '5000', exponent: 2 },
      },
    })
    const beforeReplay = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      complete({ db, auth: identity }, reverseA),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'reversed' } })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeReplay)

    const latestDb = new MemoryDb()
    seedPayout(latestDb)
    const latestB = seedAdditionalDailyPayout(
      latestDb,
      'latest-b',
      periodB.start,
      periodB.end,
    )
    await begin({ db: latestDb, auth: identity }, argsA)
    await complete(
      { db: latestDb, auth: identity },
      completionArgs(argsA, evidence('succeeded')),
    )
    creditProvider(latestDb, '5000', normalTransferObservedAt + 2)
    const latestArgsB = {
      ...argsForPayout(
        latestB,
        'command-2',
        'sha256:input-2',
        'payout-idempotency-2',
        secondObservedAt,
      ),
      requestDigest: 'sha256:request-2',
    }
    await begin({ db: latestDb, auth: identity }, latestArgsB)
    await complete(
      { db: latestDb, auth: identity },
      completionArgs(latestArgsB, evidenceB),
    )
    const reverseLatestB = completionArgs(
      { ...latestArgsB, observedAt: secondObservedAt + 3 },
      {
        ...evidence('reversed', 'sha256:evidence-reversal-latest'),
        transferId: 'tr_2',
        requestDigest: 'sha256:request-2',
        observedAt: secondObservedAt + 3,
      },
    )
    await expect(
      complete({ db: latestDb, auth: identity }, reverseLatestB),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'reversed',
        providerPaidAfter: { currency: 'USD', units: '5000', exponent: 2 },
      },
    })
    const latestRow = latestDb.rows('moneyPayouts').find(
      (row) => row.payoutRef === latestB,
    )
    if (latestRow === undefined) throw new Error('latest_payout_missing')
    expect(latestRow.providerPaidAfterUnits).toBe('5000')
  })

  it('refreshes a new success snapshot after a delayed reversal', async () => {
    const argsForPayout = (
      payoutRef: string,
      commandId: string,
      inputDigest: string,
      idempotencyKey: string,
      observedAt: number,
    ): Record<string, unknown> => ({
      ...commandArgs(),
      payoutRef,
      commandId,
      inputDigest,
      idempotencyKey,
      observedAt,
      providerRecoveryDeadlineAt:
        observedAt + STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
    })
    const argsA = commandArgs()
    const periodB = {
      start: '2026-07-02T00:00:00.000Z',
      end: '2026-07-03T00:00:00.000Z',
    }
    const periodC = {
      start: '2026-07-03T00:00:00.000Z',
      end: '2026-07-04T00:00:00.000Z',
    }
    const secondObservedAt = Date.parse(periodB.end) + 2
    const thirdObservedAt = Date.parse(periodC.end) + 1
    const reversalProcessedAt = secondObservedAt + 3
    const successProcessedAt = reversalProcessedAt + 1
    const db = new MemoryDb()
    db.seed('owners', {
      _id: 'owners:status',
      clerkUserId: 'owner:test',
      createdAt: 1,
      updatedAt: 1,
    })
    db.seed('businesses', {
      _id: 'business-1',
      ownerId: 'owners:status',
      updatedAt: 1,
    })
    seedPayout(db)
    const payoutB = seedAdditionalDailyPayout(
      db,
      'delayed-b',
      periodB.start,
      periodB.end,
    )
    const payoutC = seedAdditionalDailyPayout(
      db,
      'delayed-c',
      periodC.start,
      periodC.end,
    )
    await begin({ db, auth: identity }, argsA)
    await expect(
      complete(
        { db, auth: identity },
        completionArgs(argsA, evidence('succeeded')),
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'paid', providerPaidAfter: amount },
    })
    creditProvider(db, '5000', normalTransferObservedAt + 2)
    const argsB: Record<string, unknown> = {
      ...argsForPayout(
        payoutB,
        'command-delayed-b',
        'sha256:input-delayed-b',
        'payout-idempotency-delayed-b',
        secondObservedAt,
      ),
      requestDigest: 'sha256:request-delayed-b',
    }
    await expect(
      begin({ db, auth: identity }, argsB),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'transfer_pending',
        providerPaidBefore: amount,
      },
    })
    const reverseA = completionArgs(
      { ...argsA, observedAt: reversalProcessedAt },
      {
        ...evidence('reversed', 'sha256:evidence-delayed-reversal-a'),
        observedAt: secondObservedAt,
      },
    )
    await expect(
      complete({ db, auth: identity }, reverseA),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'reversed',
        providerPaidAfter: { currency: 'USD', units: '0', exponent: 2 },
      },
    })
    const reversedARow = db.rows('moneyPayouts').find(
      (row) => row.payoutRef === dailyPayoutRef,
    )
    if (reversedARow === undefined) throw new Error('delayed_payout_a_missing')
    expect(reversedARow.transferObservedAt).toBe(secondObservedAt)
    expect(reversedARow.updatedAt).toBe(reversalProcessedAt)
    const pendingStatus = await readStatus(
      { db, auth: identity },
      { businessId: 'business-1', currency: 'USD' },
    )
    expect(pendingStatus).toMatchObject({
      kind: 'ok',
      payoutState: 'transfer_pending',
      payoutRef: payoutB,
      transferStatus: 'pending',
      destinationAccountId: 'acct_1',
      requestDigest: 'sha256:request-delayed-b',
      providerRecoveryDeadlineAt: argsB.providerRecoveryDeadlineAt,
    })
    const pendingOwnerEarnings = await readOwnerEarnings(
      { db, auth: ownerIdentity },
      {},
    )
    expect(pendingOwnerEarnings).toMatchObject({
      kind: 'available',
      businessId: 'business-1',
      accounts: [
        {
          currency: 'USD',
          payout: {
            payoutState: 'transfer_pending',
            payoutRef: payoutB,
            transferStatus: 'pending',
            destinationAccountId: 'acct_1',
            requestDigest: 'sha256:request-delayed-b',
            providerRecoveryDeadlineAt: argsB.providerRecoveryDeadlineAt,
          },
        },
      ],
    })
    await expect(
      markUnknown(
        { db, auth: identity },
        {
          ...argsB,
          observedAt: reversalProcessedAt,
          failureCode: 'payout_delayed_reversal',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'outcome_unknown' },
    })
    const unknownStatus = await readStatus(
      { db, auth: identity },
      { businessId: 'business-1', currency: 'USD' },
    )
    expect(unknownStatus).toMatchObject({
      kind: 'ok',
      payoutState: 'outcome_unknown',
      payoutRef: payoutB,
      transferStatus: 'outcome_unknown',
      destinationAccountId: 'acct_1',
      requestDigest: 'sha256:request-delayed-b',
      providerRecoveryDeadlineAt: argsB.providerRecoveryDeadlineAt,
    })
    const evidenceB = {
      ...evidence('succeeded', 'sha256:evidence-delayed-success-b'),
      transferId: 'tr_delayed_b',
      requestDigest: 'sha256:request-delayed-b',
      observedAt: secondObservedAt + 1,
    }
    const completedBArgs = {
      ...argsB,
      observedAt: successProcessedAt,
    }
    await expect(
      complete(
        { db, auth: identity },
        completionArgs(completedBArgs, evidenceB),
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'paid',
        providerPaidBefore: { currency: 'USD', units: '0', exponent: 2 },
        providerPaidAfter: { currency: 'USD', units: '5000', exponent: 2 },
      },
    })
    const paidBRow = db.rows('moneyPayouts').find(
      (row) => row.payoutRef === payoutB,
    )
    if (paidBRow === undefined) throw new Error('delayed_payout_b_missing')
    expect(paidBRow.providerPaidBeforeUnits).toBe('0')
    expect(paidBRow.providerPaidAfterUnits).toBe('5000')
    expect(paidBRow.transferObservedAt).toBe(secondObservedAt + 1)
    expect(paidBRow.updatedAt).toBe(successProcessedAt)
    const beginC = await begin(
      { db, auth: identity },
      argsForPayout(
        payoutC,
        'command-delayed-c',
        'sha256:input-delayed-c',
        'payout-idempotency-delayed-c',
        thirdObservedAt,
      ),
    )
    expect(beginC).toMatchObject({
      kind: 'accepted',
      transfer: {
        providerPaidBefore: { currency: 'USD', units: '5000', exponent: 2 },
      },
    })
    const beforeReplay = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      complete({ db, auth: identity }, reverseA),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'reversed' },
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeReplay)
  })
  it('refuses multiple active payout status candidates', async () => {
    const db = new MemoryDb()
    seedPayout(db, 'transfer_pending')
    const secondRef = seedAdditionalDailyPayout(
      db,
      'status-conflict',
      '2026-07-02T00:00:00.000Z',
      '2026-07-03T00:00:00.000Z',
    )
    const second = db.rows('moneyPayouts').find(
      (row) => row.payoutRef === secondRef,
    )
    if (second === undefined) throw new Error('status_conflict_payout_missing')
    second.state = 'outcome_unknown'
    await expect(
      readStatus(
        { db, auth: identity },
        { businessId: 'business-1', currency: 'USD' },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
  })

  it('reverses a successful payout onto current balance and replays after credit', async () => {
    const db = new MemoryDb()
    db.seed('owners', {
      _id: 'owners:paid-readback',
      clerkUserId: 'owner:test',
      createdAt: 1,
      updatedAt: 1,
    })
    db.seed('businesses', {
      _id: 'business-1',
      ownerId: 'owners:paid-readback',
      updatedAt: 1,
    })
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    await complete(
      { db, auth: identity },
      completionArgs(args, evidence('succeeded')),
    )
    await expect(
      readOwnerTransfer(
        { db, auth: ownerIdentity },
        {
          businessId: 'business-1',
          currency: 'USD',
          payoutRef: dailyPayoutRef,
          idempotencyKey: 'payout-idempotency-1',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'paid',
        transferStatus: 'succeeded',
        amount,
      },
    })
    creditProvider(db, '1250', normalTransferObservedAt + 1)
    const provider = db.rows('moneyAccounts')[0]
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.balanceUnits = '250'
    provider.recoveryDueUnits = '700'
    provider.version = 4
    provider.updatedAt = normalTransferObservedAt + 2
    const payoutAccount = db.rows('moneyPayoutAccounts')[0]
    if (payoutAccount === undefined) throw new Error('payout_account_fixture_missing')
    payoutAccount.stripeAccountId = 'acct_changed'
    payoutAccount.state = 'restricted'
    payoutAccount.detailsSubmitted = false
    payoutAccount.recipientCapabilityActive = false
    const reversal = completionArgs(
      args,
      evidence('reversed', 'sha256:evidence-reversal-1'),
    )
    await expect(
      complete({ db, auth: identity }, reversal),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'reversed', transferStatus: 'reversed' },
    })
    await expect(
      readOwnerTransfer(
        { db, auth: ownerIdentity },
        {
          businessId: 'business-1',
          currency: 'USD',
          payoutRef: dailyPayoutRef,
          idempotencyKey: 'payout-idempotency-1',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'reversed',
        transferStatus: 'reversed',
        amount,
      },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('4550')
    expect(db.rows('moneyAccounts')[0]?.recoveryDueUnits).toBe('0')
    expect(db.rows('moneyAccounts')[0]?.version).toBe(5)
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyTransactions')[1]?.expectedAccountVersion).toBe(4)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
    expect(db.rows('moneyLedgerEntries')[1]).not.toHaveProperty('payoutRef')
    creditProvider(db, '500', normalTransferObservedAt + 3)
    await expect(
      complete({ db, auth: identity }, reversal),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'reversed' } })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('5050')
    expect(db.rows('moneyAccounts')[0]?.recoveryDueUnits).toBe('0')
    expect(db.rows('moneyAccounts')[0]?.version).toBe(6)
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
  })

  it('keeps pending replay fenced by current account and recovery state', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    const provider = db.rows('moneyAccounts')[0]
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.balanceUnits = '1'
    provider.recoveryDueUnits = '1'
    provider.version = 3
    await expect(
      begin({ db, auth: identity }, args),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
  })

  it('keeps outcome-unknown replay and new commands fenced by account/recovery state', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    await markUnknown(
      { db, auth: identity },
      { ...args, failureCode: 'payout_outcome_unknown' },
    )
    const provider = db.rows('moneyAccounts')[0]
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.balanceUnits = '1'
    provider.recoveryDueUnits = '1'
    provider.version = 3
    await expect(
      begin({ db, auth: identity }, args),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    const differentArgs = {
      ...args,
      commandId: 'command-2',
      inputDigest: 'sha256:input-2',
      requestDigest: 'sha256:request-2',
      idempotencyKey: 'payout-idempotency-2',
    }
    const different = await begin(
      { db, auth: identity },
      differentArgs,
    )
    expect(different).toMatchObject({
      kind: 'refused',
      code: 'payout_not_ready',
    })
  })
})
