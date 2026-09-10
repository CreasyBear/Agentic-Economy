import { v } from 'convex/values'

import { canonicalDigest, isCanonicalDigest } from '../src/modules/common/canonical-digest'
import { internalMutation } from './_generated/server'

const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/u
const UNITS_PATTERN = /^(?:0|[1-9]\d{0,15})$/u

export const recordObservation = internalMutation({
  args: {
    environment: v.union(v.literal('sandbox'), v.literal('production')),
    custodyRef: v.string(),
    custodyGeneration: v.number(),
    network: v.string(),
    asset: v.literal('USDC'),
    exponent: v.literal(6),
    observationRef: v.string(),
    totalUnits: v.string(),
    bufferUnits: v.string(),
    evidenceRef: v.string(),
    evidenceDigest: v.string(),
    observedAt: v.number(),
  },
  returns: v.union(
    v.object({ kind: v.literal('accepted'), replayed: v.boolean(), observationRef: v.string() }),
    v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.literal(false) }),
  ),
  handler: async (ctx, args) => {
    const valid = [args.custodyRef, args.network, args.observationRef, args.evidenceRef]
      .every((value) => REF_PATTERN.test(value))
      && Number.isSafeInteger(args.custodyGeneration)
      && args.custodyGeneration > 0
      && Number.isSafeInteger(args.observedAt)
      && args.observedAt >= 0
      && UNITS_PATTERN.test(args.totalUnits)
      && UNITS_PATTERN.test(args.bufferUnits)
      && isCanonicalDigest(args.evidenceDigest)
    if (!valid) {
      return { kind: 'refused' as const, code: 'treasury_observation_invalid', retryable: false as const }
    }
    const existing = await ctx.db.query('moneyTreasuryObservations')
      .withIndex('by_observationRef', (query) => query.eq('observationRef', args.observationRef))
      .unique()
    const material = {
      format: 'ae.treasury-observation:v1',
      ...args,
    }
    if (existing !== null) {
      const existingDigest = canonicalDigest({
        format: 'ae.treasury-observation:v1',
        environment: existing.environment,
        custodyRef: existing.custodyRef,
        custodyGeneration: existing.custodyGeneration,
        network: existing.network,
        asset: existing.asset,
        exponent: existing.exponent,
        observationRef: existing.observationRef,
        totalUnits: existing.totalUnits,
        bufferUnits: existing.bufferUnits,
        evidenceRef: existing.evidenceRef,
        evidenceDigest: existing.evidenceDigest,
        observedAt: existing.observedAt,
      })
      return existingDigest === canonicalDigest(material)
        ? { kind: 'accepted' as const, replayed: true, observationRef: existing.observationRef }
        : { kind: 'refused' as const, code: 'treasury_observation_conflict', retryable: false as const }
    }
    await ctx.db.insert('moneyTreasuryObservations', {
      ...args,
      recordedAt: Date.now(),
    })
    return { kind: 'accepted' as const, replayed: false, observationRef: args.observationRef }
  },
})
