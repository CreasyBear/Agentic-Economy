/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

const treasury = Object.freeze({
  environment: 'sandbox' as const,
  custodyRef: 'custody:sandbox:managed-x402',
  custodyGeneration: 1,
  network: 'eip155:84532',
  asset: 'USDC' as const,
  exponent: 6 as const,
})

describe('corporate USDC custody observations', () => {
  it('stores external evidence once without recreating a Convex balance projection', async () => {
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

    await expect(backend.mutation(internal.moneyTreasury.recordObservation, observation))
      .resolves.toEqual({
        kind: 'accepted',
        replayed: false,
        observationRef: observation.observationRef,
      })
    await expect(backend.mutation(internal.moneyTreasury.recordObservation, observation))
      .resolves.toEqual({
        kind: 'accepted',
        replayed: true,
        observationRef: observation.observationRef,
      })
    await expect(backend.mutation(internal.moneyTreasury.recordObservation, {
      ...observation,
      totalUnits: '9999999',
    })).resolves.toEqual({
      kind: 'refused',
      code: 'treasury_observation_conflict',
      retryable: false,
    })

    await expect(backend.run(async (ctx) => await ctx.db.query('moneyTreasuryObservations').collect()))
      .resolves.toHaveLength(1)
  })

  it('rejects malformed or unsafe observation evidence before persistence', async () => {
    const backend = convexTest(schema, convexModules)
    await expect(backend.mutation(internal.moneyTreasury.recordObservation, {
      ...treasury,
      custodyGeneration: 0,
      observationRef: 'treasury-observation:invalid',
      totalUnits: '-1',
      bufferUnits: '0',
      evidenceRef: 'cdp-balance:invalid',
      evidenceDigest: 'not-a-digest',
      observedAt: -1,
    })).resolves.toEqual({
      kind: 'refused',
      code: 'treasury_observation_invalid',
      retryable: false,
    })
    await expect(backend.run(async (ctx) => await ctx.db.query('moneyTreasuryObservations').collect()))
      .resolves.toEqual([])
  })
})
