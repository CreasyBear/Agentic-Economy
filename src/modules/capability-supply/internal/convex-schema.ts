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
const exactAmount = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
const price = v.union(
  v.object({ kind: v.literal('fixed'), amount: exactAmount }),
  v.object({
    kind: v.literal('range'),
    minimum: exactAmount,
    maximum: exactAmount,
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
export const connectionAuthoritySnapshotValue = v.object({
  connectionRef: v.string(),
  providerRef: v.string(),
  adapterId: v.string(),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  operationRef: v.string(),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
})
const connectionAuthority = connectionAuthoritySnapshotValue
const registeredOperationMappingBaseFields = {
  authority: v.literal('registered_contract_semantics'),
  sourceContractRef: v.object(contractRefFields),
  targetContractRef: v.object(contractRefFields),
  sourceSchemaIdentity: v.string(),
  targetSchemaIdentity: v.string(),
}
const registeredOperationMappingMaterialValue = v.union(
  v.object({
    ...registeredOperationMappingBaseFields,
    kind: v.union(v.literal('identity'), v.literal('field')),
    sourceOutputPointer: v.string(),
    targetInputPointer: v.string(),
  }),
  v.object({
    ...registeredOperationMappingBaseFields,
    kind: v.literal('array_project'),
    sourceArrayPointer: v.string(),
    sourceItemPointer: v.string(),
    targetArrayPointer: v.string(),
    minItems: v.number(),
    maxItems: v.number(),
  }),
  v.object({
    ...registeredOperationMappingBaseFields,
    kind: v.literal('registered_transform'),
    transformRef: v.string(),
    transformVersion: v.number(),
    sourceOutputPointer: v.string(),
    targetInputPointer: v.string(),
    inputCardinalityMax: v.number(),
    outputCardinalityMax: v.number(),
  }),
)

export const registeredOperationMappingValue = v.union(
  v.object({
    ...registeredOperationMappingBaseFields,
    mappingRef: v.string(),
    kind: v.union(v.literal('identity'), v.literal('field')),
    sourceOutputPointer: v.string(),
    targetInputPointer: v.string(),
  }),
  v.object({
    ...registeredOperationMappingBaseFields,
    mappingRef: v.string(),
    kind: v.literal('array_project'),
    sourceArrayPointer: v.string(),
    sourceItemPointer: v.string(),
    targetArrayPointer: v.string(),
    minItems: v.number(),
    maxItems: v.number(),
  }),
  v.object({
    ...registeredOperationMappingBaseFields,
    mappingRef: v.string(),
    kind: v.literal('registered_transform'),
    transformRef: v.string(),
    transformVersion: v.number(),
    sourceOutputPointer: v.string(),
    targetInputPointer: v.string(),
    inputCardinalityMax: v.number(),
    outputCardinalityMax: v.number(),
  }),
)

export { registeredOperationMappingMaterialValue }

export const capabilitySupplyTables = {
  capabilityPublications: defineTable({
    publicationRef: v.string(),
    operationRef: v.string(),
    revision: v.number(),
    businessId: v.id('businesses'),
    networkId: v.string(),
    ...contractRefFields,
    sourceKind: v.union(
      v.literal('ae_envelope'),
      v.literal('openapi_http'),
      v.literal('mcp'),
      v.literal('agent_plugin_mcp'),
      v.literal('x402'),
    ),
    sourceRevision: v.string(),
    sourceDigest: v.string(),
    publisherRef: v.string(),
    authorityMode: v.union(
      v.literal('provider_owned'), v.literal('ae_curated_external'),
      v.literal('third_party_gateway'), v.literal('observed_external'),
    ),
    provenanceDigest: v.string(),
    offeringId: v.string(),
    bindingId: v.string(),
    disposition: v.union(
      v.literal('current'),
      v.literal('withdrawn'),
      v.literal('incompatible'),
      v.literal('superseded'),
    ),
    connectionAuthority: v.optional(connectionAuthoritySnapshotValue),
    supersedesRevision: v.optional(v.number()),
    credentialState: v.union(
      v.literal('unobserved'),
      v.literal('ready'),
      v.literal('unavailable'),
    ),
    healthState: v.union(
      v.literal('unobserved'),
      v.literal('healthy'),
      v.literal('unhealthy'),
    ),
    readinessObservedAt: v.optional(v.number()),
    readinessValidUntil: v.optional(v.number()),
    readinessEvidenceRefs: v.array(v.string()),
    registrationEvidenceRefs: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    withdrawnAt: v.optional(v.number()),
  })
    .index('by_publicationRef_and_revision', ['publicationRef', 'revision'])
    .index('by_networkId_and_disposition', ['networkId', 'disposition'])
    .index('by_businessId_and_disposition', ['businessId', 'disposition'])
    .index('by_disposition_and_readinessValidUntil', ['disposition', 'readinessValidUntil'])
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
    authority: v.union(
      v.object({ kind: v.literal('keyless') }),
      v.object({
        kind: v.literal('provider_connection'),
        connectionRef: v.string(),
        providerRef: v.string(),
      }),
    ),
    connectionAuthority: v.optional(connectionAuthority),
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
  capabilityProviderConnections: defineTable({
    connectionRef: v.string(),
    businessId: v.id('businesses'),
    providerRef: v.string(),
    providerAccountRef: v.string(),
    adapterId: v.string(),
    credentialRef: v.union(v.string(), v.null()),
    grantedScopes: v.array(v.string()),
    grantedResources: v.array(v.string()),
    authorityGeneration: v.number(),
    authorityDigest: v.string(),
    lifecycle: v.union(
      v.literal('active'),
      v.literal('reauthorization_required'),
      v.literal('revocation_pending'),
      v.literal('revoked'),
      v.literal('cleanup_required'),
    ),
    observedAt: v.number(),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    reasonCode: v.optional(v.string()),
    evidenceRefs: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastCommandId: v.string(),
    lastCommandDigest: v.string(),
  })
    .index('by_connectionRef', ['connectionRef'])
    .index('by_businessId_and_lifecycle', ['businessId', 'lifecycle'])
    .index('by_providerRef_and_lifecycle', ['providerRef', 'lifecycle'])
    .index('by_connectionRef_and_authorityGeneration', ['connectionRef', 'authorityGeneration']),
  capabilityProviderApprovals: defineTable({
    decisionRef: v.string(),
    commandId: v.string(),
    commandDigest: v.string(),
    providerRef: v.string(),
    providerAccountRef: v.string(),
    connectionRef: v.string(),
    authorityGeneration: v.number(),
    connectionAuthorityDigest: v.string(),
    requestedScopes: v.array(v.string()),
    grantedScopes: v.array(v.string()),
    requestedResources: v.array(v.string()),
    grantedResources: v.array(v.string()),
    decision: v.union(v.literal('granted'), v.literal('refused'), v.literal('partial')),
    decisionDigest: v.string(),
    decisionTime: v.number(),
    decisionMakerAuthorityRef: v.string(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
  })
    .index('by_decisionRef', ['decisionRef'])
    .index('by_commandId', ['commandId'])
    .index('by_connectionRef_and_authorityGeneration', ['connectionRef', 'authorityGeneration']),
  registeredOperationMappings: defineTable({
    networkId: v.string(),
    mappingRef: v.string(),
    material: registeredOperationMappingMaterialValue,
    publisherRef: v.string(),
    authorityMode: v.union(
      v.literal('provider_owned'), v.literal('ae_curated_external'),
      v.literal('third_party_gateway'), v.literal('observed_external'),
    ),
    registrationEvidenceRefs: v.array(v.string()),
    registeredAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_networkId_and_mappingRef', ['networkId', 'mappingRef']),
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
