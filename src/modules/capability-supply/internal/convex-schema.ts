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

export const capabilitySupplyTables = {
  capabilityOfferings: defineTable({
    offeringId: v.string(),
    businessId: v.id('businesses'),
    networkId: v.string(),
    ...contractRefFields,
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
} as const
