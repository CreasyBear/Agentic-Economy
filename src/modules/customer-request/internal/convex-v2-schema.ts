import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const capabilityContractRefV2Value = v.object({
  capabilityId: v.string(), version: v.number(), contractDigest: v.string(),
})
export const actionPreparationLineageV2Value = v.object({
  requestId: v.string(), requestRevision: v.number(), principalId: v.string(), delegatedAgentId: v.string(),
  planRevisionId: v.string(), planDigest: v.string(), actionId: v.string(),
  contractRef: capabilityContractRefV2Value, selectionKey: v.string(), semanticDigest: v.string(),
})
const capabilityRecipientV2Value = v.union(
  v.object({ kind: v.literal('candidate_binding') }),
  v.object({ kind: v.literal('selected_binding') }),
  v.object({ kind: v.literal('named_recipient'), recipientId: v.string() }),
)
const capabilityEffectV2Value = v.object({
  effectId: v.string(),
  class: v.union(v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change')),
  authority: v.union(v.literal('none'), v.literal('explicit'), v.literal('mandate_or_explicit')),
  reversibility: v.union(v.literal('not_applicable'), v.literal('reversible'), v.literal('conditional'), v.literal('irreversible')),
})
const preparationDeclarationV2Value = v.object({
  declarationKey: v.string(), effectId: v.string(), inputPointer: v.string(), schemaIdentity: v.string(),
  classification: v.union(v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
  phase: v.union(v.literal('preparation'), v.literal('execution')),
  recipient: capabilityRecipientV2Value, purposes: v.array(v.string()), effect: capabilityEffectV2Value,
  inputs: v.array(v.object({
    inputKey: v.string(), inputPointer: v.string(), label: v.string(), schemaIdentity: v.string(),
  })),
})
const actionPreparationDisclosureLimitsV2Value = v.object({
  maximumRecipients: v.number(), maximumExposures: v.number(), maximumOperations: v.number(),
})
const actionPreparationAuthorityScopeV2Value = v.object({
  declarations: v.array(preparationDeclarationV2Value), limits: actionPreparationDisclosureLimitsV2Value,
  authorityScopeDigest: v.string(),
})
const actionPreparationDisclosureReviewV2Value = v.object({
  reviewRef: v.string(), reviewDigest: v.string(), lineage: actionPreparationLineageV2Value,
  categories: v.array(v.object({
    inputKey: v.string(), inputPointer: v.string(), schemaIdentity: v.string(), label: v.string(),
    classification: v.union(v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
  })),
  purposes: v.array(v.string()), recipients: v.array(capabilityRecipientV2Value),
  effectRequirements: v.array(capabilityEffectV2Value),
  limits: actionPreparationDisclosureLimitsV2Value,
})
const actionPreparationAuthorityReservationV2Value = v.object({
  reservationRef: v.string(), reservationDigest: v.string(), authorityReference: v.string(),
  approvalDigest: v.string(), reviewDigest: v.string(),
  principalId: v.string(), ownerId: v.string(), credentialId: v.string(), lineage: actionPreparationLineageV2Value,
  authorityScopeDigest: v.string(),
  verification: v.object({
    kind: v.literal('clerk_owner'), authenticationEvidenceRef: v.string(), approvedAt: v.number(),
  }),
  reservedAt: v.number(),
})
export const actionPreparationApprovalEvidenceV2Value = v.object({
  approvalRef: v.string(), approvalDigest: v.string(), preparationRef: v.string(),
  reviewRef: v.string(), reviewDigest: v.string(), authorityScopeDigest: v.string(),
  principalId: v.string(), ownerId: v.string(), credentialId: v.string(),
  lineage: actionPreparationLineageV2Value, commandDigest: v.string(),
  verification: v.object({ kind: v.literal('clerk_owner'), authenticationEvidenceRef: v.string() }),
  approvedAt: v.number(),
})
export const durableActionPreparationV2Value = v.union(
  v.object({
    kind: v.literal('needs_information'), preparationRef: v.string(), preparationDigest: v.string(),
    lineage: actionPreparationLineageV2Value, projectedInputDigest: v.optional(v.string()),
    authorityScope: actionPreparationAuthorityScopeV2Value,
    disclosureReview: actionPreparationDisclosureReviewV2Value, preparedAt: v.number(),
    missing: v.array(v.object({
      inputKey: v.string(), inputPointer: v.string(), schemaIdentity: v.string(), label: v.string(),
    })),
  }),
  v.object({
    kind: v.literal('needs_authority'), preparationRef: v.string(), preparationDigest: v.string(),
    lineage: actionPreparationLineageV2Value, projectedInputDigest: v.optional(v.string()),
    authorityScope: actionPreparationAuthorityScopeV2Value,
    disclosureReview: actionPreparationDisclosureReviewV2Value, preparedAt: v.number(),
  }),
  v.object({
    kind: v.literal('ready_for_routing'), preparationRef: v.string(), preparationDigest: v.string(),
    lineage: actionPreparationLineageV2Value, projectedInputDigest: v.optional(v.string()),
    authorityScope: actionPreparationAuthorityScopeV2Value,
    disclosureReview: actionPreparationDisclosureReviewV2Value, preparedAt: v.number(),
    authorityReservation: v.optional(actionPreparationAuthorityReservationV2Value),
  }),
)
const preparedActionPriceV2Value = v.object({
  currency: v.string(), minimumAmountMinor: v.number(), maximumAmountMinor: v.number(),
  components: v.array(v.object({
    kind: v.literal('registered_offering'), label: v.string(),
    minimumAmountMinor: v.number(), maximumAmountMinor: v.number(), evidenceRefs: v.array(v.string()),
  })),
})
const preparedActionEvidenceV2Value = v.object({
  evidenceId: v.string(), outputPointer: v.string(),
  purpose: v.union(v.literal('comparison'), v.literal('completion'), v.literal('recovery')),
  schemaIdentity: v.string(), valueDigest: v.string(),
})
export const preparedActionV2Value = v.object({
  format: v.literal('ae.prepared-action:v2'), preparedActionRef: v.string(), preparedActionDigest: v.string(),
  lineage: actionPreparationLineageV2Value,
  business: v.object({ businessId: v.string(), name: v.string() }),
  offering: v.object({
    offeringId: v.string(), registrationHash: v.string(), registrationEvidenceRefs: v.array(v.string()),
    label: v.string(), summary: v.string(),
  }),
  binding: v.object({
    bindingId: v.string(), registrationHash: v.string(), registrationEvidenceRefs: v.array(v.string()),
  }),
  providerAssertion: v.object({
    assertionRef: v.string(), operationRef: v.string(), assertedAt: v.number(), validUntil: v.number(),
    responseDigest: v.string(), outputDigest: v.string(), output: v.any(), // runtime-validated JsonValue boundary
    evidence: v.array(preparedActionEvidenceV2Value),
  }),
  price: preparedActionPriceV2Value,
  materialTerms: v.array(v.object({ termId: v.string(), label: v.string(), value: v.string() })),
  commercialRelationship: v.object({
    kind: v.union(v.literal('none'), v.literal('direct'), v.literal('affiliate'), v.literal('ownership')),
    summary: v.string(), influencesEligibility: v.boolean(), influencesInclusion: v.boolean(),
    influencesOrder: v.boolean(), evidenceRefs: v.array(v.string()),
  }),
  cancellation: v.object({
    kind: v.union(v.literal('unsupported'), v.literal('adapter_managed')), evidenceRefs: v.array(v.string()),
  }),
  disclosure: v.object({
    authorityReference: v.string(), authorityScopeDigest: v.string(), operationRef: v.string(),
    releaseEvidenceRef: v.string(), allocationRefs: v.array(v.string()),
  }),
  comparison: v.union(
    v.object({
      kind: v.literal('single_option'), candidateCount: v.literal(1), selectedAssertionRef: v.string(),
    }),
    v.object({
      kind: v.literal('lowest_maximum_price'), candidateCount: v.number(), selectedAssertionRef: v.string(),
      evidenceRef: v.string(), commercialInfluence: v.union(v.literal('none'), v.literal('disclosed')),
      comparedAssertionRefs: v.array(v.string()),
    }),
  ),
  alternatives: v.array(v.object({
    assertionRef: v.string(), operationRef: v.string(), responseDigest: v.string(), outputDigest: v.string(),
    evidence: v.array(preparedActionEvidenceV2Value),
    business: v.object({ businessId: v.string(), name: v.string() }),
    offeringId: v.string(), offeringRegistrationHash: v.string(),
    offeringRegistrationEvidenceRefs: v.array(v.string()),
    bindingId: v.string(), bindingRegistrationHash: v.string(),
    bindingRegistrationEvidenceRefs: v.array(v.string()),
    price: preparedActionPriceV2Value,
    materialTerms: v.array(v.object({ termId: v.string(), label: v.string(), value: v.string() })),
    commercialRelationship: v.object({
      kind: v.union(v.literal('none'), v.literal('direct'), v.literal('affiliate'), v.literal('ownership')),
      summary: v.string(), influencesEligibility: v.boolean(), influencesInclusion: v.boolean(),
      influencesOrder: v.boolean(), evidenceRefs: v.array(v.string()),
    }),
    cancellation: v.object({
      kind: v.union(v.literal('unsupported'), v.literal('adapter_managed')), evidenceRefs: v.array(v.string()),
    }),
    disclosure: v.object({
      authorityReference: v.string(), authorityScopeDigest: v.string(), operationRef: v.string(),
      releaseEvidenceRef: v.string(), allocationRefs: v.array(v.string()),
    }),
    expiresAt: v.number(),
  })),
  fallbacks: v.array(v.object({
    operationRef: v.string(),
    reason: v.union(
      v.literal('disclosure_not_released'), v.literal('provider_response_invalid'),
      v.literal('provider_echo_mismatch'), v.literal('provider_assertion_expired'),
      v.literal('provider_evidence_invalid'), v.literal('commercial_terms_unavailable'),
    ),
    business: v.object({ businessId: v.string(), name: v.string() }),
    offeringId: v.string(), offeringRegistrationHash: v.string(),
    offeringRegistrationEvidenceRefs: v.array(v.string()),
    bindingId: v.string(), bindingRegistrationHash: v.string(),
    bindingRegistrationEvidenceRefs: v.array(v.string()),
    commercialRelationship: v.object({
      kind: v.union(v.literal('none'), v.literal('direct'), v.literal('affiliate'), v.literal('ownership')),
      summary: v.string(), influencesEligibility: v.boolean(), influencesInclusion: v.boolean(),
      influencesOrder: v.boolean(), evidenceRefs: v.array(v.string()),
    }),
    disclosureOutcome: v.union(v.literal('released'), v.literal('not_released'), v.literal('uncertain')),
    authorityReference: v.string(), authorityScopeDigest: v.string(),
    allocationRefs: v.array(v.string()), evidenceRefs: v.array(v.string()),
    responseDigest: v.optional(v.string()), assertionRef: v.optional(v.string()), validUntil: v.optional(v.number()),
  })),
  preparedAt: v.number(), expiresAt: v.number(),
})
export const preparedActionRecoveryReasonV2Value = v.union(
  v.literal('options_pending'), v.literal('disclosure_not_released'), v.literal('disclosure_uncertain'),
  v.literal('provider_response_invalid'), v.literal('provider_echo_mismatch'),
  v.literal('provider_assertion_expired'), v.literal('provider_evidence_invalid'),
  v.literal('commercial_terms_unavailable'), v.literal('selection_required'),
  v.literal('comparison_unavailable'), v.literal('commercial_influence_blocks_selection'),
  v.literal('prepared_action_too_large'),
  v.literal('capability_authority_changed'), v.literal('capability_graph_changed'),
)
const preparationEgressStateV2Value = v.union(
  v.literal('allocated'), v.literal('dispatching'), v.literal('released'),
  v.literal('not_released'), v.literal('uncertain'),
)
const factSourceV2Value = v.union(
  v.object({ kind: v.literal('customer'), assertionRef: v.string() }),
  v.object({ kind: v.literal('agent_inference'), inferenceRef: v.string() }),
)
export const requestFactV2Value = v.object({
  contractRef: capabilityContractRefV2Value,
  selectionKey: v.string(), inputKey: v.string(), inputPointer: v.string(), schemaIdentity: v.string(),
  value: v.any(), source: factSourceV2Value, // runtime-validated JsonValue boundary
})
const missingTargetV2Value = v.object({
  contractRef: capabilityContractRefV2Value,
  selectionKey: v.string(), inputKey: v.string(), inputPointer: v.string(), schemaIdentity: v.string(),
})
const informationRequirementV2Value = v.union(
  v.object({
    kind: v.literal('contract_fact'), requirementKey: v.string(), customerLabel: v.string(),
    targets: v.array(missingTargetV2Value),
    impact: v.object({ affectedCandidates: v.array(v.string()), probesEnabled: v.array(v.string()) }),
    requirementDigest: v.string(),
  }),
  v.object({ kind: v.literal('intent_direction'), prompt: v.string(), requirementDigest: v.string() }),
)
const criterionV2Value = v.object({
  inputKey: v.string(), inputPointer: v.string(), label: v.string(),
  value: v.any(), // runtime-validated JsonValue boundary
  basis: v.union(v.literal('customer_provided'), v.literal('extracted_from_request')), criterionDigest: v.string(),
})
const disclosureV2Value = v.object({
  maximumRecipients: v.number(), purposes: v.array(v.string()),
  categories: v.array(v.object({
    inputKey: v.string(), label: v.string(),
    classification: v.union(v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
  })),
})
export const requestEvaluationCandidateV2Value = v.object({
  candidateRef: v.string(), businessId: v.string(), offeringId: v.string(), bindingId: v.string(),
  contractRef: capabilityContractRefV2Value, selectionKey: v.string(), semanticDigest: v.string(),
  offeringRegistrationHash: v.string(), bindingRegistrationHash: v.string(),
  viability: v.union(
    v.object({ kind: v.literal('viable') }),
    v.object({ kind: v.literal('blocked_on_information'), inputs: v.array(v.object({
      ...missingTargetV2Value.fields, customerLabel: v.string(),
    })) }),
    v.object({ kind: v.literal('incompatible'), issueKeywords: v.array(v.string()) }),
  ),
})
const completionRequirementV2Value = v.object({
  actionId: v.string(), contractRef: capabilityContractRefV2Value,
  evidenceId: v.string(), outputPointer: v.string(), purpose: v.literal('completion'), schemaIdentity: v.string(),
})
const proposedActionV2Value = v.object({
  actionId: v.string(), contractRef: capabilityContractRefV2Value,
  selectionKey: v.string(), semanticDigest: v.string(), dependsOn: v.array(v.string()),
  inputs: v.array(requestFactV2Value),
})
export const customerRequestV2AggregateValue = v.object({
  aggregateVersion: v.literal(2),
  snapshot: v.object({
    requestId: v.string(), revision: v.number(), principalId: v.string(), delegatedAgentId: v.string(),
    intent: v.string(), networkId: v.string(), facts: v.array(requestFactV2Value),
    snapshotDigest: v.string(), recordedAt: v.number(),
  }),
  evaluation: v.object({
    requestId: v.string(), requestRevision: v.number(), registrySnapshotDigest: v.string(), factsDigest: v.string(),
    facts: v.array(requestFactV2Value), criteria: v.array(criterionV2Value),
    decisionPreference: v.optional(v.object({
      objective: v.literal('lowest_maximum_price'), basis: v.literal('extracted_from_request'), evidenceRef: v.string(),
    })),
    preparationDisclosure: v.optional(disclosureV2Value),
    candidates: v.array(requestEvaluationCandidateV2Value),
    completionRequirements: v.array(completionRequirementV2Value),
    nextRequirement: v.optional(informationRequirementV2Value),
    posture: v.union(v.literal('progress_available'), v.literal('needs_information'), v.literal('unsupported')),
    evaluationDigest: v.string(),
  }),
  plan: v.object({
    planRevisionId: v.string(), requestId: v.string(), requestRevision: v.number(), proposedByAgentId: v.string(),
    interpreterId: v.string(), proposalDigest: v.string(), registrySnapshotDigest: v.string(),
    actions: v.array(proposedActionV2Value), completionRequirements: v.array(completionRequirementV2Value),
    planDigest: v.string(), createdAt: v.number(),
  }),
  outcome: v.union(v.literal('plan_ready'), v.literal('needs_information'), v.literal('unsupported')),
  aggregateDigest: v.string(),
})

export const customerRequestV2Tables = {
  customerRequestAgentPrincipals: defineTable({
    principalId: v.string(), ownerId: v.string(), credentialId: v.string(), scopes: v.array(v.string()),
    recordedAt: v.number(), lastSeenAt: v.number(),
  })
    .index('by_principalId', ['principalId'])
    .index('by_credentialId', ['credentialId']),

  customerRequestV2Heads: defineTable({
    requestId: v.string(), principalId: v.string(), delegatedAgentId: v.string(), currentRevision: v.number(),
    currentAggregateDigest: v.string(), createdAt: v.number(), updatedAt: v.number(),
  }).index('by_requestId', ['requestId']),

  customerRequestV2Revisions: defineTable({
    requestId: v.string(), requestRevision: v.number(), aggregate: customerRequestV2AggregateValue,
  }).index('by_requestId_and_requestRevision', ['requestId', 'requestRevision']),

  customerRequestV2Commands: defineTable({
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), requestId: v.string(),
    expectedRevision: v.number(), resultingRevision: v.number(), aggregateDigest: v.string(), committedAt: v.number(),
  })
    .index('by_commandKey', ['commandKey'])
    .index('by_requestId_and_resultingRevision', ['requestId', 'resultingRevision']),

  customerRequestV2ActionPreparations: defineTable({
    preparationRef: v.string(), preparationDigest: v.string(), requestId: v.string(), requestRevision: v.number(),
    actionId: v.string(), lineage: actionPreparationLineageV2Value,
    preparation: durableActionPreparationV2Value, recordedAt: v.number(), updatedAt: v.number(),
  })
    .index('by_preparationRef', ['preparationRef'])
    .index('by_requestId_and_requestRevision_and_actionId', ['requestId', 'requestRevision', 'actionId']),

  customerRequestV2PreparationCommands: defineTable({
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(),
    authorityReference: v.optional(v.string()), lineage: actionPreparationLineageV2Value,
    preparationRef: v.string(), preparationDigest: v.string(), result: durableActionPreparationV2Value,
    committedAt: v.number(),
  }).index('by_commandKey', ['commandKey']),

  customerRequestV2PreparationDisclosureReviews: defineTable({
    reviewRef: v.string(), reviewDigest: v.string(), lineage: actionPreparationLineageV2Value,
    review: actionPreparationDisclosureReviewV2Value, recordedAt: v.number(),
  }).index('by_reviewRef', ['reviewRef']),

  customerRequestV2PreparationApprovalEvidence: defineTable({
    approvalRef: v.string(), approvalDigest: v.string(), preparationRef: v.string(),
    reviewRef: v.string(), reviewDigest: v.string(), authorityScopeDigest: v.string(),
    principalId: v.string(), ownerId: v.string(), credentialId: v.string(),
    lineage: actionPreparationLineageV2Value, commandDigest: v.string(),
    approval: actionPreparationApprovalEvidenceV2Value, recordedAt: v.number(),
  })
    .index('by_approvalRef', ['approvalRef'])
    .index('by_preparationRef', ['preparationRef']),

  customerRequestV2PreparationAuthorityReservations: defineTable({
    reservationRef: v.string(), reservationDigest: v.string(), authorityReference: v.string(),
    lineage: actionPreparationLineageV2Value,
    reservation: actionPreparationAuthorityReservationV2Value, recordedAt: v.number(),
  })
    .index('by_reservationRef', ['reservationRef'])
    .index('by_authorityReference', ['authorityReference']),

  customerRequestV2PreparationEgressConsumption: defineTable({
    authorityReference: v.string(), authorityScopeDigest: v.string(), preparationRef: v.string(),
    maximumRecipients: v.number(), maximumExposures: v.number(), maximumOperations: v.number(),
    consumedRecipients: v.number(), consumedExposures: v.number(), consumedOperations: v.number(),
    updatedAt: v.number(),
  }).index('by_authorityReference', ['authorityReference']),

  customerRequestV2PreparationEgressCommands: defineTable({
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), preparationRef: v.string(),
    authorityReference: v.string(), operationRefs: v.array(v.string()), committedAt: v.number(),
  }).index('by_commandKey', ['commandKey']),

  customerRequestV2PreparationEgressOperations: defineTable({
    operationRef: v.string(), operationDigest: v.string(), preparationRef: v.string(),
    requestId: v.string(), principalId: v.string(),
    authorityReference: v.string(), authorityScopeDigest: v.string(), lineage: actionPreparationLineageV2Value,
    businessId: v.id('businesses'), offeringId: v.string(), bindingId: v.string(),
    offeringRegistrationHash: v.string(), bindingRegistrationHash: v.string(),
    adapterId: v.string(), adapterConfigDigest: v.string(), adapterConfigJson: v.string(),
    endpointUrl: v.string(), credentialRef: v.string(), projectedInputDigest: v.string(),
    state: preparationEgressStateV2Value, allocatedAt: v.number(), dispatchStartedAt: v.optional(v.number()),
    dispatchAttemptRef: v.optional(v.string()), dispatchLeaseExpiresAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()), evidenceRef: v.optional(v.string()),
    responseStatus: v.optional(v.number()), responseContentType: v.optional(v.string()),
    responseBodyDigest: v.optional(v.string()), responseBodyText: v.optional(v.string()),
    failureCode: v.optional(v.string()),
  })
    .index('by_operationRef', ['operationRef'])
    .index('by_preparationRef', ['preparationRef'])
    .index('by_requestId_and_principalId', ['requestId', 'principalId'])
    .index('by_authorityReference', ['authorityReference']),

  customerRequestV2PreparationDisclosureAllocations: defineTable({
    allocationRef: v.string(), allocationDigest: v.string(), operationRef: v.string(), preparationRef: v.string(),
    authorityReference: v.string(), authorityScopeDigest: v.string(), lineage: actionPreparationLineageV2Value,
    declarationKey: v.string(), inputKey: v.string(), inputPointer: v.string(), schemaIdentity: v.string(),
    classification: v.union(v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
    purpose: v.string(), effect: capabilityEffectV2Value, declaredRecipient: capabilityRecipientV2Value,
    businessId: v.id('businesses'), offeringId: v.string(), bindingId: v.string(),
    offeringRegistrationHash: v.string(), bindingRegistrationHash: v.string(),
    valueDigest: v.string(), allocatedAt: v.number(),
  })
    .index('by_allocationRef', ['allocationRef'])
    .index('by_operationRef', ['operationRef'])
    .index('by_authorityReference', ['authorityReference']),

  customerRequestV2PreparationReconciliationObservations: defineTable({
    observationRef: v.string(), observationDigest: v.string(), operationRef: v.string(),
    disposition: v.union(v.literal('released'), v.literal('not_released'), v.literal('uncertain')),
    providerEvidenceRef: v.string(), responseDigest: v.string(),
    businessId: v.id('businesses'), offeringId: v.string(), bindingId: v.string(),
    offeringRegistrationHash: v.string(), bindingRegistrationHash: v.string(), observedAt: v.number(),
  })
    .index('by_observationRef', ['observationRef'])
    .index('by_operationRef', ['operationRef']),

  customerRequestV2PreparedActions: defineTable({
    preparedActionRef: v.string(), preparedActionDigest: v.string(), preparationRef: v.string(),
    requestId: v.string(), requestRevision: v.number(), actionId: v.string(),
    lineage: actionPreparationLineageV2Value, preparedAction: preparedActionV2Value, recordedAt: v.number(),
  })
    .index('by_preparedActionRef', ['preparedActionRef'])
    .index('by_preparationRef', ['preparationRef'])
    .index('by_requestId_and_requestRevision_and_actionId', ['requestId', 'requestRevision', 'actionId']),

  customerRequestV2PreparedActionRecoveries: defineTable({
    recoveryRef: v.string(), recoveryDigest: v.string(), preparationRef: v.string(),
    lineage: actionPreparationLineageV2Value, reason: preparedActionRecoveryReasonV2Value,
    operationRefs: v.array(v.string()), evidenceRefs: v.array(v.string()), observedAt: v.number(),
  })
    .index('by_recoveryRef', ['recoveryRef'])
    .index('by_preparationRef', ['preparationRef']),

  customerRequestV2PreparedActionCommands: defineTable({
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), preparationRef: v.string(),
    resultKind: v.union(v.literal('prepared'), v.literal('not_prepared')),
    resultRef: v.string(), resultDigest: v.string(), committedAt: v.number(),
  }).index('by_commandKey', ['commandKey']),
} as const
