/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

const recordObservation = anyApi.moneyTreasury?.recordObservation
const reserve = anyApi.moneyTreasury?.reserve
const markPossiblySubmitted = anyApi.moneyTreasury?.markPossiblySubmitted
const settle = anyApi.moneyTreasury?.settle
const release = anyApi.moneyTreasury?.release
const read = anyApi.moneyTreasury?.read
if (
  recordObservation === undefined
  || reserve === undefined
  || markPossiblySubmitted === undefined
  || settle === undefined
  || release === undefined
  || read === undefined
) throw new Error('money treasury functions missing')

const treasury = Object.freeze({
  environment: 'sandbox' as const,
  custodyRef: 'custody:sandbox:managed-x402',
  custodyGeneration: 1,
  network: 'eip155:84532',
  asset: 'USDC',
  exponent: 6,
})

describe('corporate USDC treasury capacity', () => {
  it('records a bounded observation and atomically prevents over-commitment', async () => {
    const backend = convexTest(schema, convexModules)
    const observedAt = 1_800_000_000_000
    const observation = {
      ...treasury,
      observationRef: 'treasury-observation:one',
      totalUnits: '10000000',
      bufferUnits: '2000000',
      evidenceRef: 'cdp-balance:bounded:one',
      evidenceDigest: canonicalDigest({ balance: '10000000', observedAt }),
      observedAt,
    }
    await expect(backend.mutation(recordObservation, observation)).resolves.toMatchObject({
      kind: 'accepted',
      replayed: false,
      projection: {
        observedTotalUnits: '10000000',
        committedUnits: '0',
        pendingOutflowUnits: '0',
        bufferUnits: '2000000',
        spendableUnits: '8000000',
      },
    })
    await expect(backend.mutation(recordObservation, observation)).resolves.toMatchObject({
      kind: 'accepted', replayed: true,
    })

    const baseReservation = {
      ...treasury,
      reservationRef: 'treasury-reservation:one',
      idempotencyKey: 'treasury-reservation:one',
      commitmentRef: 'commitment:one',
      invocationRef: 'invocation:one',
      amountUnits: '5000000',
      evidenceDigest: canonicalDigest({ rate: 'sandbox', commitmentRef: 'commitment:one' }),
      now: observedAt + 1,
    }
    const [first, duplicate] = await Promise.all([
      backend.mutation(reserve, baseReservation),
      backend.mutation(reserve, baseReservation),
    ])
    expect([first.kind, duplicate.kind]).toEqual(['accepted', 'accepted'])
    expect([first.replayed, duplicate.replayed].sort()).toEqual([false, true])

    await expect(backend.mutation(reserve, {
      ...baseReservation,
      reservationRef: 'treasury-reservation:two',
      idempotencyKey: 'treasury-reservation:two',
      commitmentRef: 'commitment:two',
      invocationRef: 'invocation:two',
      amountUnits: '4000000',
    })).resolves.toEqual({
      kind: 'refused',
      code: 'treasury_capacity_insufficient',
      retryable: false,
    })

    await expect(backend.query(read, treasury)).resolves.toMatchObject({
      kind: 'available',
      projection: {
        committedUnits: '5000000',
        pendingOutflowUnits: '0',
        spendableUnits: '3000000',
      },
    })
  })

  it('moves a reservation through the submission fence and never releases uncertain capacity', async () => {
    const backend = convexTest(schema, convexModules)
    const observedAt = 1_800_000_000_000
    await backend.mutation(recordObservation, {
      ...treasury,
      observationRef: 'treasury-observation:fence',
      totalUnits: '10000000',
      bufferUnits: '1000000',
      evidenceRef: 'cdp-balance:bounded:fence',
      evidenceDigest: canonicalDigest({ balance: '10000000', observedAt }),
      observedAt,
    })
    const reservation = {
      ...treasury,
      reservationRef: 'treasury-reservation:fence',
      idempotencyKey: 'treasury-reservation:fence',
      commitmentRef: 'commitment:fence',
      invocationRef: 'invocation:fence',
      amountUnits: '2500000',
      evidenceDigest: canonicalDigest({ rate: 'sandbox', commitmentRef: 'commitment:fence' }),
      now: observedAt + 1,
    }
    await backend.mutation(reserve, reservation)
    await expect(backend.mutation(markPossiblySubmitted, {
      reservationRef: reservation.reservationRef,
      submissionDigest: canonicalDigest({ attempt: 'possibly-submitted' }),
      now: observedAt + 2,
    })).resolves.toMatchObject({ kind: 'accepted', state: 'pending_outflow' })
    await expect(backend.mutation(release, {
      reservationRef: reservation.reservationRef,
      evidenceDigest: canonicalDigest({ reason: 'timeout' }),
      now: observedAt + 3,
    })).resolves.toEqual({
      kind: 'refused',
      code: 'treasury_submission_may_have_occurred',
      retryable: false,
    })
    await expect(backend.mutation(settle, {
      reservationRef: reservation.reservationRef,
      evidenceDigest: canonicalDigest({ receipt: 'settled' }),
      now: observedAt + 4,
    })).resolves.toMatchObject({ kind: 'accepted', state: 'settled' })
    await expect(backend.query(read, treasury)).resolves.toMatchObject({
      kind: 'available',
      projection: {
        committedUnits: '0',
        pendingOutflowUnits: '0',
        spendableUnits: '6500000',
      },
    })
  })
})
