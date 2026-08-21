import { describe, expect, it, vi } from 'vitest'

import {
  MemoryDb,
  begin,
  canonicalDigest,
  commandArgs,
  complete,
  completionArgs,
  dailyPayoutRef,
  evidence,
  identity,
  normalTransferObservedAt,
  ownerIdentity,
  readOwnerTransfer,
  seedPayout,
} from './payout-ledger-test-harness'

vi.mock('../../../convex/sourceWriteAdmission', () => ({
  sourceWriteArgs: {},
  requireSourceWrite: vi.fn(async () => ({ kind: 'accepted' as const })),
}))

describe('Convex payout persistence — transfer replay tamper', () => {
  it('rejects terminal replay tampering through begin and owner readback', async () => {
    const ownerReadbackArgs = {
      businessId: 'business-1',
      currency: 'USD',
      payoutRef: dailyPayoutRef,
      idempotencyKey: 'payout-idempotency-1',
    }
    const seedOwner = (db: MemoryDb): void => {
      db.seed('owners', {
        _id: 'owners:terminal-tamper',
        clerkUserId: 'owner:test',
        createdAt: 1,
        updatedAt: 1,
      })
      db.seed('businesses', {
        _id: 'business-1',
        ownerId: 'owners:terminal-tamper',
        updatedAt: 1,
      })
    }
    const snapshot = (db: MemoryDb) => ({
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    })
    const paidFixture = async () => {
      const db = new MemoryDb()
      seedOwner(db)
      seedPayout(db)
      const args = commandArgs()
      await expect(begin({ db, auth: identity }, args)).resolves.toMatchObject({
        kind: 'accepted',
        transfer: { state: 'transfer_pending' },
      })
      await expect(
        complete(
          { db, auth: identity },
          completionArgs(args, evidence('succeeded')),
        ),
      ).resolves.toMatchObject({
        kind: 'accepted',
        transfer: { state: 'paid' },
      })
      return {
        db,
        args,
        reservationRef: canonicalDigest({
          format: 'money-payout-reservation-transaction:v1',
          payoutRef: args.payoutRef,
          payoutCommandId: args.commandId,
          inputDigest: args.inputDigest,
          idempotencyKey: args.idempotencyKey,
        } as const),
      }
    }
    const reversedFixture = async () => {
      const fixture = await paidFixture()
      await expect(
        complete(
          { db: fixture.db, auth: identity },
          completionArgs(
            fixture.args,
            evidence('reversed', 'sha256:evidence-reversal-tamper'),
          ),
        ),
      ).resolves.toMatchObject({
        kind: 'accepted',
        transfer: { state: 'reversed' },
      })
      return fixture
    }
    const failedFixture = async () => {
      const db = new MemoryDb()
      seedOwner(db)
      seedPayout(db)
      const args = commandArgs()
      await begin({ db, auth: identity }, args)
      await expect(
        complete(
          { db, auth: identity },
          completionArgs(args, evidence('failed')),
        ),
      ).resolves.toMatchObject({
        kind: 'accepted',
        transfer: { state: 'held_threshold', transferStatus: 'failed' },
      })
      return { db, args }
    }
    const assertTampered = async (
      fixture: {
        db: MemoryDb
        args: Record<string, unknown>
      },
    ) => {
      const before = snapshot(fixture.db)
      await expect(
        begin({ db: fixture.db, auth: identity }, fixture.args),
      ).resolves.toEqual({
        kind: 'refused',
        code: 'payout_reconciliation_required',
        retryable: false,
      })
      await expect(
        readOwnerTransfer(
          { db: fixture.db, auth: ownerIdentity },
          ownerReadbackArgs,
        ),
      ).resolves.toEqual({
        kind: 'refused',
        code: 'payout_reconciliation_required',
        retryable: false,
      })
      expect(snapshot(fixture.db)).toEqual(before)
    }

    for (const field of [
      'providerHeldBeforeUnits',
      'providerHeldAfterUnits',
    ] as const) {
      const fixture = await paidFixture()
      const payout = fixture.db.rows('moneyPayouts')[0]
      if (payout === undefined) throw new Error('paid_payout_fixture_missing')
      payout[field] = field === 'providerHeldBeforeUnits' ? '4999' : '1'
      await assertTampered(fixture)
    }

    for (const withCredit of [false, true]) {
      const fixture = await paidFixture()
      const linkedRef = `linked-reversal:${withCredit}`
      fixture.db.seed('moneyTransactions', {
        _id: `moneyTransactions:${linkedRef}`,
        transactionRef: linkedRef,
        kind: 'payout_accrual',
        idempotencyKey: linkedRef,
        inputDigest: 'sha256:linked-reversal',
        principalId: 'business:business-1',
        currency: 'USD',
        amountUnits: '5000',
        exponent: 2,
        state: 'reversed',
        expectedAccountVersion: 3,
        externalRef: dailyPayoutRef,
        reversalOf: fixture.reservationRef,
        createdAt: normalTransferObservedAt + 1,
        updatedAt: normalTransferObservedAt + 1,
      })
      if (withCredit) {
        fixture.db.seed('moneyLedgerEntries', {
          _id: `moneyLedgerEntries:${linkedRef}`,
          entryRef: `${linkedRef}:payout-reversal`,
          accountRef: 'business:business-1:USD',
          entryType: 'payout_accrual',
          direction: 'credit',
          amountUnits: '5000',
          currency: 'USD',
          exponent: 2,
          transactionRef: linkedRef,
          idempotencyKey: linkedRef,
          businessId: 'business-1',
          sourceDigest: 'sha256:linked-reversal',
          evidenceRefs: ['sha256:linked-reversal'],
          reversalOf: fixture.reservationRef,
          createdAt: normalTransferObservedAt + 1,
        })
      }
      await assertTampered(fixture)
    }

    {
      const fixture = await reversedFixture()
      const payout = fixture.db.rows('moneyPayouts')[0]
      if (payout === undefined)
        throw new Error('reversed_payout_fixture_missing')
      payout.transferReversalEvidenceDigest = undefined
      await assertTampered(fixture)
    }

    {
      const fixture = await reversedFixture()
      const reversalEntry = fixture.db
        .rows('moneyLedgerEntries')
        .find(
          (entry) =>
            typeof entry.entryRef === 'string' &&
            entry.entryRef.endsWith(':payout-reversal'),
        )
      if (reversalEntry === undefined)
        throw new Error('reversal_entry_fixture_missing')
      reversalEntry.sourceDigest = canonicalDigest({
        format: 'money-payout-evidence:v1',
        evidence: 'sha256:evidence-1',
      })
      reversalEntry.evidenceRefs = ['sha256:evidence-1']
      await assertTampered(fixture)
    }

    {
      const fixture = await failedFixture()
      const payout = fixture.db.rows('moneyPayouts')[0]
      if (payout === undefined)
        throw new Error('failed_payout_fixture_missing')
      payout.transferEvidenceDigest = undefined
      await assertTampered(fixture)
    }
  })
})
