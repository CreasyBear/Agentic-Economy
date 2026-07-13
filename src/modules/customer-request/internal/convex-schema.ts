import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { customerRequestV2Tables } from './convex-v2-schema'

const money = v.object({ currency: v.string(), amountMinor: v.number() })
const business = v.object({ nodeId: v.string(), bindingId: v.string(), name: v.string() })
const planInput = v.union(
  v.object({ kind: v.literal('literal'), value: v.union(v.string(), v.number(), v.boolean()) }),
  v.object({ kind: v.literal('action_output'), actionId: v.string(), field: v.string() }),
  v.object({ kind: v.literal('customer_fact'), fact: v.string() }),
)
const literalValue = v.union(v.string(), v.number(), v.boolean())
const capabilityValueType = v.union(
  v.literal('string'), v.literal('integer'), v.literal('boolean'), v.literal('url'), v.literal('money_minor'), v.literal('provider_offer_ref'),
)
const capabilityFieldDefinition = v.object({
  valueType: capabilityValueType,
  customerLabel: v.string(), required: v.boolean(),
  decisionRelevance: v.optional(v.union(v.literal('option_selection'), v.literal('commitment'))),
  disclosure: v.optional(v.object({
    classification: v.union(v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
    phase: v.union(v.literal('preparation'), v.literal('execution')),
    recipient: v.union(v.literal('candidate_provider'), v.literal('selected_provider'), v.literal('offer_issuer'), v.literal('named_recipient')),
    purposes: v.array(v.string()),
  })),
  evidenceRole: v.optional(v.union(v.literal('provider_offer'), v.literal('result_artifact'), v.literal('status'), v.literal('provider_report'))),
})
export const capabilityContractValue = v.object({
  capabilityContractId: v.string(), name: v.string(),
  operation: v.union(v.literal('query'), v.literal('quote'), v.literal('reserve'), v.literal('book'), v.literal('purchase'), v.literal('status'), v.literal('cancel')),
  preparation: v.optional(v.object({ purpose: v.string(), customerLabel: v.string() })),
  input: v.record(v.string(), capabilityFieldDefinition), output: v.record(v.string(), capabilityFieldDefinition),
  consequence: v.object({
    commitment: v.union(v.literal('none'), v.literal('hold'), v.literal('reservation'), v.literal('booking'), v.literal('purchase'), v.literal('cancellation')),
    spend: v.union(v.literal('none'), v.literal('quoted'), v.literal('metered')),
    reversibility: v.union(v.literal('not_applicable'), v.literal('reversible'), v.literal('conditional'), v.literal('irreversible')),
    approval: v.union(v.literal('none'), v.literal('explicit'), v.literal('mandate_or_explicit')),
  }),
  applicability: v.optional(v.array(v.object({ field: v.string(), acceptedValues: v.array(literalValue) }))),
  providerAffinity: v.optional(v.object({ kind: v.literal('offer_issuer'), inputField: v.string() })),
})
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

const requestFactSource = v.union(
  v.object({ kind: v.literal('customer'), assertionRef: v.string() }),
  v.object({ kind: v.literal('agent_inference'), inferenceRef: v.string() }),
)
const requestFact = v.object({ value: literalValue, source: requestFactSource })
export const requestSnapshotValue = v.object({
  requestId: v.string(), revision: v.number(), principalId: v.string(), delegatedAgentId: v.string(),
  intent: v.string(), networkId: v.string(), facts: v.record(v.string(), requestFact), snapshotDigest: v.string(), recordedAt: v.number(),
})
const informationRequirementValue = v.union(
  v.object({
    kind: v.optional(v.literal('contract_fact')), field: v.string(), customerLabel: v.string(), affectedCandidates: v.array(v.string()),
    probesEnabled: v.array(v.string()), requirementDigest: v.string(),
  }),
  v.object({ kind: v.literal('intent_direction'), prompt: v.string(), requirementDigest: v.string() }),
)
const understoodCriterionValue = v.object({
  field: v.string(), label: v.string(), value: literalValue,
  basis: v.union(v.literal('customer_provided'), v.literal('extracted_from_request')),
  criterionDigest: v.string(),
})
const preparationDisclosurePreviewValue = v.object({
  purposeLabel: v.string(), maximumRecipients: v.number(),
  categories: v.array(v.object({
    field: v.string(), label: v.string(),
    classification: v.union(v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
  })),
})
export const requestEvaluationValue = v.object({
  evaluationId: v.string(), requestId: v.string(), requestRevision: v.number(), registrySnapshotDigest: v.string(),
  factsDigest: v.string(), facts: v.optional(v.record(v.string(), requestFact)),
  criteria: v.optional(v.array(understoodCriterionValue)),
  decisionPreference: v.optional(v.object({
    objective: v.literal('lowest_maximum_price'), basis: v.literal('extracted_from_request'), evidenceRef: v.string(),
  })),
  preparationDisclosure: v.optional(preparationDisclosurePreviewValue), posture: v.union(
    v.literal('progress_available'), v.literal('needs_information'), v.literal('unsupported'),
  ),
  nextRequirement: v.optional(informationRequirementValue), evaluationDigest: v.string(), evaluatedAt: v.number(),
})
export const requestEvaluationCandidateValue = v.object({
  candidateRef: v.string(), businessId: v.string(), bindingId: v.string(), capabilityContractId: v.string(),
  viability: v.union(
    v.object({ kind: v.literal('viable') }),
    v.object({ kind: v.literal('blocked_on_information'), fields: v.array(v.string()) }),
  ),
})

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

export const customerRequestCompilationResultValue = v.union(
  v.object({ kind: v.literal('plan_ready'), request: customerRequestValue, understanding: requestUnderstanding, planRevision: planRevisionValue }),
  v.object({ kind: v.literal('needs_information'), request: customerRequestValue, understanding: requestUnderstanding, missingInformation: v.array(missingInformation) }),
  v.object({ kind: v.literal('unsupported'), request: customerRequestValue, reason: v.union(v.literal('no_registered_capability'), v.literal('unsafe_proposal')) }),
  v.object({ kind: v.literal('revision_conflict'), requestId: v.string(), expectedRevision: v.number() }),
  v.object({ kind: v.literal('identity_conflict'), requestId: v.string() }),
  v.object({ kind: v.literal('compilation_conflict'), requestId: v.string() }),
)

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

export const preparedRouteCandidateSetValue = v.object({
  inspectionRef: v.string(),
  decisionPreference: v.optional(v.object({
    objective: v.literal('lowest_maximum_price'), basis: v.literal('extracted_from_request'), evidenceRef: v.string(),
  })),
  candidates: v.array(v.object({
    optionRef: v.string(), business: v.object({ name: v.string() }),
    expectedCost: money, maximumCost: money, expectedLatencyMs: v.number(),
    priceComponents: v.array(v.object({ label: v.string(), amountMinor: v.number() })),
    comparableOutputs: v.array(v.object({ label: v.string(), value: v.union(v.string(), v.number(), v.boolean()) })),
    materialTerms: v.array(v.string()),
    cancellation: v.object({ kind: v.union(v.literal('supported'), v.literal('conditional'), v.literal('unsupported')), summary: v.string() }),
    commercialInfluence: v.optional(v.union(
      v.object({ status: v.literal('unknown') }),
      v.object({ status: v.literal('none'), summary: v.string() }),
      v.object({
        status: v.literal('disclosed'), relationship: v.union(
          v.literal('commission'), v.literal('sponsorship'), v.literal('rebate'), v.literal('ownership'), v.literal('other'),
        ),
        summary: v.string(), payerName: v.string(), beneficiaryName: v.string(), compensationBasis: v.string(),
        influencesEligibility: v.boolean(), influencesInclusion: v.boolean(), influencesOrder: v.boolean(),
      }),
    )),
    issuedAt: v.optional(v.number()), expiresAt: v.number(), inspectionRef: v.string(),
  })),
  attempts: v.array(v.object({
    business: v.object({ name: v.string() }),
    status: v.union(
      v.literal('not_contacted'), v.literal('contact_pending'), v.literal('contacted'), v.literal('option_received'),
      v.literal('unavailable'), v.literal('uncertain'),
    ),
    explanation: v.string(),
  })),
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
  v.literal('preparation_purpose_not_composable'),
  v.literal('route_currency_mismatch'), v.literal('route_spend_exceeded'), v.literal('route_data_contract_mismatch'),
  v.literal('route_recipient_limit_exceeded'), v.literal('route_quote_expired'), v.literal('route_ranking_required'),
)

export const customerRequestTables = {
  ...customerRequestV2Tables,
  customerRequestCapabilityContracts: defineTable({
    ...capabilityContractValue.fields,
    contractDigest: v.string(), status: v.union(v.literal('active'), v.literal('retired')),
    registeredAt: v.number(), updatedAt: v.number(),
  })
    .index('by_capabilityContractId', ['capabilityContractId'])
    .index('by_status_and_capabilityContractId', ['status', 'capabilityContractId']),

  customerRequestHeads: defineTable({
    requestId: v.string(), principalId: v.string(), delegatedAgentId: v.string(), currentRevision: v.number(),
    currentEvaluationId: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number(),
  }).index('by_requestId', ['requestId']),

  customerRequestSnapshots: defineTable({
    ...requestSnapshotValue.fields,
  }).index('by_requestId_and_revision', ['requestId', 'revision']),

  customerRequestCommands: defineTable({
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), requestId: v.string(),
    expectedRevision: v.number(), resultingRevision: v.number(), committedAt: v.number(),
  })
    .index('by_commandKey', ['commandKey'])
    .index('by_requestId_and_resultingRevision', ['requestId', 'resultingRevision']),

  customerRequestEvaluations: defineTable({
    ...requestEvaluationValue.fields,
  })
    .index('by_evaluationId', ['evaluationId'])
    .index('by_requestId_and_requestRevision', ['requestId', 'requestRevision']),

  customerRequestEvaluationCandidates: defineTable({
    evaluationId: v.string(), ...requestEvaluationCandidateValue.fields,
  })
    .index('by_evaluationId', ['evaluationId'])
    .index('by_candidateRef', ['candidateRef']),

  customerRequestEvaluationPreparations: defineTable({
    preparationKey: v.string(), requestId: v.string(), requestRevision: v.number(),
    evaluationId: v.string(), evaluationDigest: v.string(),
    status: v.union(v.literal('preparing'), v.literal('options_prepared'), v.literal('needs_attention')),
    candidateSet: v.optional(preparedRouteCandidateSetValue), inspectionRef: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_preparationKey', ['preparationKey'])
    .index('by_requestId_and_requestRevision', ['requestId', 'requestRevision']),

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
    status: v.union(v.literal('claimed'), v.literal('options_prepared'), v.literal('prepared'), v.literal('refused')), claimToken: v.string(), routingRequestId: v.string(),
    claimedAt: v.number(), leaseExpiresAt: v.number(), completedAt: v.optional(v.number()),
    preparedActionId: v.optional(v.string()), refusalReason: v.optional(preparationRefusalReason),
    candidateSet: v.optional(preparedRouteCandidateSetValue),
    refusalInspectionRef: v.optional(v.string()),
  })
    .index('by_preparationScope', ['preparationScope'])
    .index('by_preparationKey', ['preparationKey'])
    .index('by_requestId_and_requestRevision', ['requestId', 'requestRevision'])
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
    uncertainAt: v.optional(v.number()), reconciledAt: v.optional(v.number()),
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
