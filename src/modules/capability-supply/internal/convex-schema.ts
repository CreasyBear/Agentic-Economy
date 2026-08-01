import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const contractRefFields = {
  capabilityId: v.string(),
  version: v.number(),
  contractDigest: v.string(),
}
const commercialRelationship = v.object({
  kind: v.union(v.literal('none'), v.literal('direct'), v.literal('affiliate'), v.literal('ownership')),
  summary: v.string(),
  influencesEligibility: v.boolean(),
  influencesInclusion: v.boolean(),
  influencesOrder: v.boolean(),
  evidenceRefs: v.array(v.string()),
})
const price = v.union(
  v.object({ kind: v.literal('fixed'), currency: v.string(), amountMinor: v.number() }),
  v.object({
    kind: v.literal('range'),
    currency: v.string(),
    minimumAmountMinor: v.number(),
    maximumAmountMinor: v.number(),
  }),
  v.object({ kind: v.literal('on_request') }),
)
const offeringOrigin = v.union(
  v.object({
    kind: v.literal('catalog_offering'),
    offeringRef: v.string(),
    offeringRevision: v.number(),
    offeringSourceHash: v.string(),
    declaredAccessPathRef: v.optional(v.string()),
    accessPathSourceHash: v.optional(v.string()),
  }),
  v.object({ kind: v.literal('standalone') }),
)

export const capabilitySupplyTables = {
  capabilityPublications: defineTable({
    publicationRef: v.string(),
    revision: v.number(),
    businessId: v.id('businesses'),
    networkId: v.string(),
    sourceKind: v.union(
      v.literal('ae_envelope'), v.literal('openapi_http'), v.literal('mcp'), v.literal('x402'),
    ),
    sourceDigest: v.string(),
    ...contractRefFields,
    offeringId: v.string(),
    bindingId: v.string(),
    disposition: v.union(
      v.literal('current'), v.literal('superseded'), v.literal('withdrawn'), v.literal('incompatible'),
    ),
    supersedesRevision: v.optional(v.number()),
    credentialState: v.union(v.literal('unobserved'), v.literal('ready'), v.literal('unavailable')),
    healthState: v.union(v.literal('unobserved'), v.literal('healthy'), v.literal('unhealthy')),
    readinessEvidenceRefs: v.array(v.string()),
    readinessObservedAt: v.optional(v.number()),
    readinessValidUntil: v.optional(v.number()),
    registrationEvidenceRefs: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    withdrawnAt: v.optional(v.number()),
  })
    .index('by_publicationRef_and_revision', ['publicationRef', 'revision'])
    .index('by_networkId_and_disposition', ['networkId', 'disposition'])
    .index('by_businessId_and_disposition', ['businessId', 'disposition'])
    .index('by_bindingId_and_disposition', ['bindingId', 'disposition']),

  capabilityOfferings: defineTable({
    offeringId: v.string(),
    businessId: v.id('businesses'),
    networkId: v.string(),
    ...contractRefFields,
    origin: v.optional(offeringOrigin),
    presentation: v.object({
      label: v.string(),
      summary: v.string(),
      price,
      materialTerms: v.array(v.object({ termId: v.string(), label: v.string(), value: v.string() })),
      commercialRelationship,
    }),
    searchTerms: v.array(v.string()),
    registrationEvidenceRefs: v.array(v.string()),
    registrationHash: v.string(),
    status: v.union(v.literal('inactive'), v.literal('active')),
    admissionEvidenceRefs: v.array(v.string()),
    eligibilityHash: v.string(),
    registeredAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_offeringId', ['offeringId'])
    .index('by_businessId_and_status', ['businessId', 'status'])
    .index('by_networkId_status_capabilityId_version_contractDigest', [
      'networkId', 'status', 'capabilityId', 'version', 'contractDigest',
    ]),

  capabilityTransportBindings: defineTable({
    bindingId: v.string(),
    offeringId: v.string(),
    networkId: v.string(),
    ...contractRefFields,
    endpointUrl: v.string(),
    credentialRef: v.string(),
    continuation: v.object({
      kind: v.union(v.literal('single_response'), v.literal('adapter_managed')),
      evidenceRefs: v.array(v.string()),
    }),
    cancellation: v.object({
      kind: v.union(v.literal('unsupported'), v.literal('adapter_managed')),
      evidenceRefs: v.array(v.string()),
    }),
    adapterId: v.string(),
    configJson: v.string(),
    configDigest: v.string(),
    registrationEvidenceRefs: v.array(v.string()),
    registrationHash: v.string(),
    admission: v.union(v.literal('not_admitted'), v.literal('admitted')),
    conformance: v.union(v.literal('not_conformant'), v.literal('conformant')),
    admissionEvidenceRefs: v.array(v.string()),
    conformanceEvidenceRefs: v.array(v.string()),
    eligibilityHash: v.string(),
    registeredAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_bindingId', ['bindingId'])
    .index('by_offeringId_and_admission_and_conformance', ['offeringId', 'admission', 'conformance'])
    .index('by_networkId_admission_conformance', ['networkId', 'admission', 'conformance']),
  capabilityCallEvents: defineTable({
    eventRef: v.string(),
    businessId: v.id('businesses'),
    offeringRef: v.string(),
    publicationRef: v.optional(v.string()),
    taskDigest: v.string(),
    eventKind: v.union(
      v.literal('supply_liquidity_fill_observed'),
      v.literal('supply_liquidity_first_success_observed'),
      v.literal('supply_liquidity_depth_observed'),
    ),
    outcome: v.union(v.literal('filled'), v.literal('zero')),
    zeroReason: v.optional(v.union(
      v.literal('no_routeable_supply'), v.literal('readiness_unavailable'), v.literal('provider_refused'),
      v.literal('credential_unavailable'), v.literal('price_unavailable'), v.literal('insufficient_credit'),
      v.literal('input_invalid'), v.literal('outcome_unknown'),
    )),
    taskStartedAt: v.optional(v.number()),
    successfulAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    eligibleDepth: v.optional(v.number()),
    observedAt: v.number(),
    evidenceRefs: v.array(v.string()),
    environment: v.union(v.literal('local'), v.literal('development'), v.literal('sandbox'), v.literal('production')),
  })
    .index('by_businessId_and_observedAt', ['businessId', 'observedAt'])
    .index('by_taskDigest_and_observedAt', ['taskDigest', 'observedAt'])
    .index('by_eventRef', ['eventRef']),
} as const
