import { describe, expect, it, vi } from 'vitest'

import {
  MemoryDb,
  dailyPayoutPeriodEnd,
  dailyPayoutPeriodStart,
  dailyPayoutRef,
  dailySettle,
  identity,
  seedAdditionalDailyPayout,
  seedPayout,
} from './payout-ledger-test-harness'

vi.mock('../../../convex/sourceWriteAdmission', () => ({
  sourceWriteArgs: {},
  requireSourceWrite: vi.fn(async () => ({ kind: 'accepted' as const })),
}))

describe('Convex payout persistence — settlement', () => {
  it('reserves yesterday UTC daily payouts once and does not double-reserve on replay', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const now = Date.parse(dailyPayoutPeriodEnd) + 1
    await expect(
      dailySettle({ db, auth: identity }, { now }),
    ).resolves.toMatchObject({
      kind: 'ran',
      periodStart: dailyPayoutPeriodStart,
      begunCount: 1,
      unresolvedReservationCount: 0,
    })
    expect(db.rows('moneyTransactions')).toHaveLength(1)
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      state: 'transfer_pending',
      payoutRef: dailyPayoutRef,
    })
    await expect(
      dailySettle({ db, auth: identity }, { now }),
    ).resolves.toMatchObject({
      kind: 'ran',
      begunCount: 0,
    })
    expect(db.rows('moneyTransactions')).toHaveLength(1)
  })

  it('accounts an unresolved reservation instead of beginning a second transfer', async () => {
    const db = new MemoryDb()
    seedPayout(db, 'transfer_pending')
    seedAdditionalDailyPayout(
      db,
      'prior-day',
      '2026-06-30T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    )
    const now = Date.parse(dailyPayoutPeriodEnd) + 1
    await expect(
      dailySettle({ db, auth: identity }, { now }),
    ).resolves.toMatchObject({
      kind: 'ran',
      begunCount: 0,
    })
    const result = await dailySettle({ db, auth: identity }, { now })
    expect(result).toMatchObject({ kind: 'ran', begunCount: 0 })
    expect(
      (result as { unresolvedReservationCount: number }).unresolvedReservationCount,
    ).toBeGreaterThan(0)
    expect(db.rows('moneyTransactions')).toHaveLength(0)
  })
})
