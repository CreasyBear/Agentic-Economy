import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const money = v.object({ currency: v.string(), amountMinor: v.number() })
const business = v.object({ nodeId: v.string(), bindingId: v.string(), name: v.string() })
const planInput = v.union(
  v.object({ kind: v.literal('literal'), value: v.union(v.string(), v.number(), v.boolean()) }),
  v.object({ kind: v.literal('action_output'), actionId: v.string(), field: v.string() }),
  v.object({ kind: v.literal('customer_fact'), fact: v.string() }),
)
const literalValue = v.union(v.string(), v.number(), v.boolean())
const requestRequirement = v.object({ field: v.string(), label: v.string(), value: literalValue })
const requestUnderstanding = v.object({
  outcome: v.string(),
  hardConstraints: v.array(requestRequirement),
  preferences: v.array(v.object({ field: v.string(), label: v.string(), value: literalValue, priority: v.number() })),
  substitutions: v.object({ allowed: v.boolean(), boundaries: v.array(v.string()) }),
  completionCriterion: v.string(),
  completionRequirement: v.object({
    evidenceRole: v.union(v.literal('provider_offer'), v.literal('result_artifact'), v.literal('status'), v.literal('provider_report')),
    valueType: v.union(
      v.literal('string'), v.literal('integer'), v.literal('boolean'), v.literal('url'), v.literal('money_minor'), v.literal('provider_offer_ref'),
    ),
  }),
  deadline: v.optional(v.number()),
})
const missingInformation = v.object({
  field: v.string(), customerLabel: v.string(),
  reason: v.union(v.literal('required_for_registered_capability'), v.literal('disambiguates_registered_capabilities')),
  candidateCapabilityContractIds: v.optional(v.array(v.string())),
})
const preparationRecipientKind = v.union(
  v.literal('candidate_provider'), v.literal('selected_provider'), v.literal('offer_issuer'), v.literal('named_recipient'),
)
const preparationAuthorityMode = v.union(v.literal('single_use'), v.literal('standing'))
const preparationAuthorityStatus = v.union(v.literal('active'), v.literal('revoked'))
const preparationDisclosureDisposition = v.union(
  v.literal('allocated'), v.literal('released'), v.literal('not_released'), v.literal('uncertain'),
)

export const customerRequestValue = v.object({
  requestId: v.string(), principalId: v.string(), delegatedAgentId: v.string(), intent: v.string(), revision: v.number(),
  compilationState: v.union(
    v.literal('submitted'), v.literal('needs_information'), v.literal('plan_ready'), v.literal('unsupported'),
  ),
  understanding: requestUnderstanding,
  knownFacts: v.record(v.string(), literalValue),
  routing: v.object({
    networkId: v.string(), currency: v.string(), maximumSpendMinor: v.number(),
    optimizeFor: v.union(v.literal('cost'), v.literal('latency')),
  }),
  createdAt: v.number(),
})

export const planRevisionValue = v.object({
  planRevisionId: v.string(), requestId: v.string(), requestRevision: v.number(), proposedByAgentId: v.string(), createdAt: v.number(),
  proposalProvenance: v.union(
    v.object({ kind: v.literal('agent_interpretation'), proposalDigest: v.string(), interpreterId: v.string() }),
    v.object({ kind: v.literal('direct_structured'), proposalDigest: v.string() }),
  ),
  completionEvidence: v.array(v.object({
    actionId: v.string(), field: v.string(),
    role: v.union(v.literal('provider_offer'), v.literal('result_artifact'), v.literal('status'), v.literal('provider_report')),
  })),
  actions: v.array(v.object({
    actionId: v.string(), capabilityContractId: v.string(), dependsOn: v.array(v.string()),
    input: v.record(v.string(), planInput),
    providerAffinity: v.optional(v.object({ kind: v.literal('offer_issuer'), inputField: v.string(), sourceActionId: v.string() })),
  })),
})

export const preparedActionValue = v.object({
  preparedActionId: v.string(), requestId: v.string(), requestRevision: v.number(), planRevisionId: v.string(), actionId: v.string(),
  capabilityContractId: v.string(), resolvedInputDigest: v.string(), quoteId: v.string(), quoteDigest: v.string(), preparedActionDigest: v.string(),
  selectedBusiness: business,
  alternatives: v.array(v.object({ business, expectedCost: money, maximumCost: money, expectedLatencyMs: v.number() })),
  comparisonBasis: v.object({
    objective: v.union(v.literal('cost'), v.literal('latency')), selectedBecause: v.array(v.string()),
    commercialInfluence: v.union(v.literal('none'), v.literal('disclosed')),
  }),
  allowedFallbacks: v.array(v.object({ business, trigger: v.literal('effect_not_committed'), maximumCost: money })),
  expectedCost: money, maximumGrossCost: money,
  priceComponents: v.array(v.object({ kind: v.union(v.literal('provider'), v.literal('ae_fee'), v.literal('tax')), label: v.string(), amountMinor: v.number() })),
  disclosures: v.array(v.object({
    field: v.string(), dataCategory: v.optional(v.string()),
    timing: v.union(v.literal('already_shared_to_prepare'), v.literal('on_execution')),
    recipientBindingId: v.string(), recipientName: v.string(), purposes: v.array(v.string()),
    purposeLabels: v.optional(v.array(v.string())),
    status: v.optional(v.union(v.literal('released'), v.literal('not_released'), v.literal('uncertain'))),
    recordedAt: v.optional(v.number()), inspectionRef: v.optional(v.string()),
  })),
  materialTerms: v.array(v.object({ key: v.string(), label: v.string(), value: v.string() })),
  cancellation: v.object({ kind: v.union(v.literal('supported'), v.literal('conditional'), v.literal('unsupported')), summary: v.string() }),
  expectedBy: v.optional(v.number()), expiresAt: v.number(), preparedAt: v.number(),
})

export const preparationRefusalReason = v.union(
  v.literal('request_not_found'), v.literal('request_revision_changed'), v.literal('plan_revision_not_found'),
  v.literal('plan_revision_changed'), v.literal('action_not_found'), v.literal('capability_contract_not_found'),
  v.literal('action_input_unresolved'), v.literal('action_input_mismatch'), v.literal('preparation_authority_required'),
  v.literal('preparation_authority_invalid'), v.literal('authority_evidence_invalid'), v.literal('authority_signer_mismatch'),
  v.literal('authority_principal_mismatch'),
  v.literal('authority_agent_mismatch'), v.literal('authority_request_mismatch'), v.literal('authority_request_revision_mismatch'),
  v.literal('authority_field_denied'), v.literal('authority_recipient_denied'), v.literal('authority_purpose_denied'),
  v.literal('authority_expired'), v.literal('authority_revoked'), v.literal('authority_not_yet_valid'),
  v.literal('authority_state_conflict'), v.literal('authority_recipient_capacity_exceeded'),
  v.literal('authority_exposure_capacity_exceeded'), v.literal('authority_operation_capacity_exceeded'),
  v.literal('authority_allocation_conflict'), v.literal('preparation_release_contract_mismatch'),
  v.literal('preparation_data_release_uncertain'), v.literal('no_connected_option'), v.literal('route_contract_mismatch'),
  v.literal('route_currency_mismatch'), v.literal('route_spend_exceeded'), v.literal('route_data_contract_mismatch'),
  v.literal('route_recipient_limit_exceeded'), v.literal('route_quote_expired'),
)

export const customerRequestTables = {
  customerRequests: defineTable({
    requestId: v.string(), principalId: v.string(), delegatedAgentId: v.string(), intent: v.string(), revision: v.number(),
    compilationState: v.optional(v.union(
      v.literal('submitted'), v.literal('needs_information'), v.literal('plan_ready'), v.literal('unsupported'),
    )),
    understanding: v.optional(requestUnderstanding),
    knownFacts: v.optional(v.record(v.string(), literalValue)),
    routing: customerRequestValue.fields.routing,
    createdAt: v.number(),
    requestDigest: v.string(), updatedAt: v.number(),
  }).index('by_requestId', ['requestId']),

  customerRequestRevisions: defineTable({
    ...customerRequestValue.fields,
    requestDigest: v.string(), recordedAt: v.number(),
  })
    .index('by_requestId_and_revision', ['requestId', 'revision']),

  customerRequestCompilationCommands: defineTable({
    compilationKey: v.string(), commandDigest: v.string(), requestId: v.string(), requestRevision: v.number(),
    planRevisionId: v.optional(v.string()), committedAt: v.number(),
    outcome: v.union(
      v.object({ kind: v.literal('plan_ready') }),
      v.object({ kind: v.literal('needs_information'), missingInformation: v.array(missingInformation) }),
      v.object({
        kind: v.literal('unsupported'),
        reason: v.union(v.literal('no_registered_capability'), v.literal('unsafe_proposal')),
      }),
    ),
  })
    .index('by_compilationKey', ['compilationKey'])
    .index('by_requestId_and_requestRevision', ['requestId', 'requestRevision']),

  customerRequestPlanRevisions: defineTable({
    ...planRevisionValue.fields,
    planDigest: v.string(),
  })
    .index('by_planRevisionId', ['planRevisionId'])
    .index('by_requestId_and_requestRevision', ['requestId', 'requestRevision']),

  customerRequestPreparationCommands: defineTable({
    preparationKey: v.string(), preparationScope: v.string(), commandDigest: v.string(),
    requestId: v.string(), requestRevision: v.number(), planRevisionId: v.string(), actionId: v.string(),
    status: v.union(v.literal('claimed'), v.literal('prepared'), v.literal('refused')), claimToken: v.string(), routingRequestId: v.string(),
    claimedAt: v.number(), leaseExpiresAt: v.number(), completedAt: v.optional(v.number()),
    preparedActionId: v.optional(v.string()), refusalReason: v.optional(preparationRefusalReason),
    refusalInspectionRef: v.optional(v.string()),
  })
    .index('by_preparationScope', ['preparationScope'])
    .index('by_preparationKey', ['preparationKey'])
    .index('by_requestId_and_status', ['requestId', 'status'])
    .index('by_status_and_leaseExpiresAt', ['status', 'leaseExpiresAt']),

  customerRequestPreparedActions: defineTable({
    ...preparedActionValue.fields,
    preparationScope: v.string(), recordedAt: v.number(),
  })
    .index('by_preparedActionId', ['preparedActionId'])
    .index('by_preparationScope', ['preparationScope'])
    .index('by_requestId_and_requestRevision', ['requestId', 'requestRevision'])
    .index('by_quoteId', ['quoteId']),

  customerRequestPreparationAuthorities: defineTable({
    authorityId: v.string(), authorityVersion: v.number(), authorityDigest: v.string(),
    principalId: v.string(), delegatedAgentId: v.string(), requestId: v.string(), requestRevision: v.number(),
    mode: preparationAuthorityMode, status: preparationAuthorityStatus,
    verification: v.object({ evidenceRef: v.string(), issuerId: v.string(), signerId: v.string(), keyId: v.string() }),
    permittedFields: v.array(v.string()), permittedRecipientKinds: v.array(preparationRecipientKind),
    permittedRecipientBindingIds: v.array(v.string()), permittedPurposes: v.array(v.string()),
    maximumRecipients: v.number(), maximumExposures: v.number(), maximumOperations: v.number(),
    consumedRecipients: v.number(), consumedExposures: v.number(), consumedOperations: v.number(),
    grantedAt: v.number(), expiresAt: v.number(), recordedAt: v.number(), updatedAt: v.number(),
  })
    .index('by_authorityId', ['authorityId'])
    .index('by_requestId_and_status', ['requestId', 'status'])
    .index('by_status_and_expiresAt', ['status', 'expiresAt']),

  customerRequestPreparationDisclosureAllocations: defineTable({
    allocationId: v.string(), allocationDigest: v.string(), operationKey: v.string(), authorityUseKey: v.string(),
    authorityId: v.string(), authorityVersion: v.number(), authorityDigest: v.string(),
    requestId: v.string(), requestRevision: v.number(), planRevisionId: v.string(), actionId: v.string(), capabilityContractId: v.string(),
    recipientNodeId: v.string(), recipientBindingId: v.string(), recipientName: v.string(), recipientKind: preparationRecipientKind,
    purpose: v.string(), purposeLabel: v.string(), fields: v.array(v.string()),
    fieldCategories: v.array(v.object({ field: v.string(), label: v.string() })),
    disposition: preparationDisclosureDisposition,
    allocatedAt: v.number(), resolvedAt: v.optional(v.number()), providerEvidenceRef: v.optional(v.string()),
  })
    .index('by_allocationId', ['allocationId'])
    .index('by_operationKey', ['operationKey'])
    .index('by_authorityId_and_allocatedAt', ['authorityId', 'allocatedAt'])
    .index('by_requestId_and_requestRevision', ['requestId', 'requestRevision']),

  customerRequestPreparationDisclosureRecipients: defineTable({
    authorityId: v.string(), recipientBindingId: v.string(), firstAllocatedAt: v.number(),
  })
    .index('by_authorityId_and_recipientBindingId', ['authorityId', 'recipientBindingId']),

  customerRequestPreparationAuthorityUses: defineTable({
    authorityId: v.string(), authorityUseKey: v.string(), firstAllocatedAt: v.number(),
  })
    .index('by_authorityId_and_authorityUseKey', ['authorityId', 'authorityUseKey']),

  customerRequestPreparationDisclosureExposures: defineTable({
    authorityId: v.string(), recipientBindingId: v.string(), purpose: v.string(), field: v.string(), firstAllocatedAt: v.number(),
  })
    .index('by_authorityId_and_recipientBindingId_and_purpose_and_field', ['authorityId', 'recipientBindingId', 'purpose', 'field'])
    .index('by_authorityId_and_firstAllocatedAt', ['authorityId', 'firstAllocatedAt']),
}
