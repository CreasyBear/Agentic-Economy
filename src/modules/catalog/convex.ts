import { v } from 'convex/values'
import type { GenericValidator } from 'convex/values'

const comparisonFactSource = v.union(
  v.object({ kind: v.literal('business_supplied') }),
  v.object({ kind: v.literal('publicly_observed'), referenceUrl: v.optional(v.string()) }),
  v.object({ kind: v.literal('ae_support'), actionId: v.string(), actionVersion: v.string() }),
)

function comparisonFact(value: GenericValidator) {
  return v.union(
    v.object({ kind: v.literal('known'), value, source: comparisonFactSource, observedAt: v.number(), validUntil: v.optional(v.number()) }),
    v.object({ kind: v.literal('unknown'), explanation: v.string(), source: comparisonFactSource, observedAt: v.number() }),
    v.object({ kind: v.literal('not_supplied'), source: comparisonFactSource, observedAt: v.number() }),
    v.object({ kind: v.literal('stale'), lastKnown: v.optional(value), source: comparisonFactSource, observedAt: v.number(), validUntil: v.number() }),
  )
}

const priceBasisValue = v.object({
  description: v.string(),
  currency: v.optional(v.string()),
  amountMinor: v.optional(v.number()),
  unit: v.union(v.literal('total'), v.literal('hour'), v.literal('day'), v.literal('month'), v.literal('request'), v.literal('unit')),
})

export const offeringComparisonEnvelope = v.object({
  schemaVersion: v.literal('offering-comparison:v1'),
  profile: v.union(
    v.object({
      profileId: v.literal('professional_service:v1'),
      scopeBasis: comparisonFact(v.string()),
      priceBasis: comparisonFact(priceBasisValue),
      timingBasis: comparisonFact(v.string()),
      serviceArea: comparisonFact(v.string()),
    }),
    v.object({
      profileId: v.literal('machine_data:v1'),
      interfaceFormat: comparisonFact(v.union(v.literal('graphql'), v.literal('rest_json'), v.literal('csv'), v.literal('other'))),
      requestMethod: comparisonFact(v.union(v.literal('GET'), v.literal('POST'))),
      authentication: comparisonFact(v.union(v.literal('none'), v.literal('api_key'), v.literal('oauth2'), v.literal('other'))),
      priceBasis: comparisonFact(priceBasisValue),
      freshnessOrUpdateCadence: comparisonFact(v.string()),
    }),
  ),
})
