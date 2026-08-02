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
const approvalGrantDataUseV2Value = v.object({
  effectId: v.string(), inputPointer: v.string(),
  classification: v.union(v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
  phase: v.union(v.literal('preparation'), v.literal('execution')),
  recipient: capabilityRecipientV2Value,
  purposes: v.array(v.string()),
})
const approvalGrantEvidenceScopeV2Value = v.object({
  evidenceId: v.string(), outputPointer: v.string(),
  purpose: v.union(v.literal('comparison'), v.literal('completion'), v.literal('recovery')),
  schemaIdentity: v.string(), valueDigest: v.string(),
})
export const approvalGrantV2Value = v.object({
  format: v.literal('ae.approval-grant:v2'),
  approvalGrantRef: v.string(), approvalGrantDigest: v.string(),
  preparedAction: v.object({ preparedActionRef: v.string(), preparedActionDigest: v.string() }),
  lineage: actionPreparationLineageV2Value,
  capability: v.object({
    contractRef: capabilityContractRefV2Value, selectionKey: v.string(), semanticDigest: v.string(),
  }),
  supply: v.object({
    businessId: v.string(),
    offering: v.object({
      offeringId: v.string(), registrationHash: v.string(),
      registrationEvidenceRefs: v.array(v.string()), evidenceDigest: v.string(),
    }),
    binding: v.object({
      bindingId: v.string(), registrationHash: v.string(),
      registrationEvidenceRefs: v.array(v.string()), evidenceDigest: v.string(),
    }),
  }),
  providerAssertion: v.object({
    assertionRef: v.string(), operationRef: v.string(), assertedAt: v.number(), validUntil: v.number(),
    responseDigest: v.string(), outputDigest: v.string(), evidenceDigest: v.string(),
  }),
  spend: v.object({ currency: v.string(), maximumAmountMinor: v.number() }),
  disclosure: v.object({ reviewRef: v.string(), reviewDigest: v.string(), authorityScopeDigest: v.string() }),
  dataScope: v.array(approvalGrantDataUseV2Value),
  effectScope: v.array(capabilityEffectV2Value),
  evidenceScope: v.array(approvalGrantEvidenceScopeV2Value),
  scopeDigest: v.string(),
  recovery: v.object({
    unknownOutcome: v.literal('reconcile_only'), automaticRetry: v.literal(false),
    registeredLifecycle: v.object({
      idempotency: v.union(v.literal('not_applicable'), v.literal('required')),
      recovery: v.union(v.literal('retry_safe'), v.literal('reconcile_required')),
    }),
  }),
  actor: v.object({
    kind: v.literal('clerk_owner'), principalId: v.string(), ownerId: v.string(), credentialId: v.string(),
    authenticationEvidenceRef: v.string(),
  }),
  issuedAt: v.number(), expiresAt: v.number(),
})
const actionAttemptLinkV2Value = v.object({ actionAttemptRef: v.string(), actionAttemptDigest: v.string() })
export const actionAttemptV2Value = v.object({
  format: v.literal('ae.action-attempt:v2'),
  actionAttemptRef: v.string(), actionAttemptDigest: v.string(), state: v.literal('admitted'),
  approvalGrantRef: v.string(), approvalGrantDigest: v.string(), authority: approvalGrantV2Value,
  authorityLineageDigest: v.string(), authorityBudgetRef: v.string(),
  admissionKeyDigest: v.string(), lineage: actionPreparationLineageV2Value,
  maximumSpend: v.object({ currency: v.string(), amountMinor: v.number() }),
  recovery: v.object({ unknownOutcome: v.literal('reconcile_only'), automaticRetry: v.literal(false) }),
  idempotencyClaimRef: v.string(), spendReservationRef: v.string(), dataReservationRef: v.string(),
  providerReleaseGrantRef: v.string(), disclosureGrantRef: v.string(),
  admittedAt: v.number(), expiresAt: v.number(),
})
export const actionAuthorityBudgetV2Value = v.object({
  format: v.literal('ae.action-authority-budget:v2'),
  authorityBudgetRef: v.string(), authorityBudgetDigest: v.string(),
  approvalGrantRef: v.string(), approvalGrantDigest: v.string(), authorityLineageDigest: v.string(),
  state: v.union(v.literal('available'), v.literal('exhausted')),
  currency: v.string(), maximumSpendMinor: v.number(), reservedSpendMinor: v.number(),
  executionScopeDigest: v.string(), maximumExposureCount: v.number(), reservedExposureCount: v.number(),
  updatedAt: v.number(), expiresAt: v.number(),
})
export const approvalGrantConsumptionV2Value = v.object({
  format: v.literal('ae.approval-grant-consumption:v2'),
  consumptionRef: v.string(), consumptionDigest: v.string(),
  approvalGrantRef: v.string(), approvalGrantDigest: v.string(),
  authorityLineageDigest: v.string(), attempt: actionAttemptLinkV2Value, consumedAt: v.number(),
})
export const actionAttemptIdempotencyClaimV2Value = v.object({
  format: v.literal('ae.action-attempt-idempotency-claim:v2'),
  idempotencyClaimRef: v.string(), idempotencyClaimDigest: v.string(), admissionKeyDigest: v.string(),
  approvalGrantRef: v.string(), approvalGrantDigest: v.string(), authorityLineageDigest: v.string(),
  attempt: actionAttemptLinkV2Value, claimedAt: v.number(),
})
export const actionAttemptSpendReservationV2Value = v.object({
  format: v.literal('ae.action-attempt-spend-reservation:v2'),
  spendReservationRef: v.string(), spendReservationDigest: v.string(), authorityBudgetRef: v.string(),
  state: v.literal('reserved'), currency: v.string(), amountMinor: v.number(),
  reservedBeforeMinor: v.number(), reservedAfterMinor: v.number(),
  approvalGrantRef: v.string(), approvalGrantDigest: v.string(),
  authorityLineageDigest: v.string(), attempt: actionAttemptLinkV2Value,
  reservedAt: v.number(), expiresAt: v.number(),
})
export const actionAttemptDataReservationV2Value = v.object({
  format: v.literal('ae.action-attempt-data-reservation:v2'),
  dataReservationRef: v.string(), dataReservationDigest: v.string(), authorityBudgetRef: v.string(),
  state: v.literal('reserved'), scope: v.array(approvalGrantDataUseV2Value), scopeDigest: v.string(),
  exposureDigest: v.string(), declarationCount: v.number(), exposureCount: v.number(),
  reservedExposureBefore: v.number(), reservedExposureAfter: v.number(),
  approvalGrantRef: v.string(), approvalGrantDigest: v.string(),
  authorityLineageDigest: v.string(), attempt: actionAttemptLinkV2Value,
  reservedAt: v.number(), expiresAt: v.number(),
})
export const providerReleaseGrantV2Value = v.object({
  format: v.literal('ae.provider-release-grant:v2'),
  providerReleaseGrantRef: v.string(), providerReleaseGrantDigest: v.string(), state: v.literal('unreleased'),
  businessId: v.string(), offeringId: v.string(), bindingId: v.string(),
  approvalGrantRef: v.string(), approvalGrantDigest: v.string(),
  authorityLineageDigest: v.string(), attempt: actionAttemptLinkV2Value,
  issuedAt: v.number(), expiresAt: v.number(),
})
export const actionDisclosureGrantV2Value = v.object({
  format: v.literal('ae.disclosure-grant:v2'),
  disclosureGrantRef: v.string(), disclosureGrantDigest: v.string(), state: v.literal('unreleased'),
  bindingId: v.string(), scope: v.array(approvalGrantDataUseV2Value), scopeDigest: v.string(),
  exposureDigest: v.string(), approvalGrantRef: v.string(), approvalGrantDigest: v.string(),
  authorityLineageDigest: v.string(), attempt: actionAttemptLinkV2Value,
  issuedAt: v.number(), expiresAt: v.number(),
})
export const providerExecutionLineageV2Value = v.object({
  requestId: v.string(), requestRevision: v.number(), principalId: v.string(), delegatedAgentId: v.string(),
  planRevisionId: v.string(), planDigest: v.string(), actionId: v.string(),
  preparedActionRef: v.string(), preparedActionDigest: v.string(),
  approvalGrantRef: v.string(), approvalGrantDigest: v.string(),
  actionAttemptRef: v.string(), actionAttemptDigest: v.string(), authorityLineageDigest: v.string(),
  contractRef: capabilityContractRefV2Value, selectionKey: v.string(), semanticDigest: v.string(),
  businessId: v.string(), offeringId: v.string(), offeringRegistrationHash: v.string(),
  bindingId: v.string(), bindingRegistrationHash: v.string(),
})
export const providerInvocationEnvelopeV2Value = v.object({
  format: v.literal('ae.provider-invocation-envelope:v2'),
  envelopeRef: v.string(), envelopeDigest: v.string(), state: v.literal('ready_for_provider'),
  providerIdempotencyKey: v.string(), lineage: providerExecutionLineageV2Value, lineageDigest: v.string(),
  providerReleaseGrantRef: v.string(), providerReleaseGrantDigest: v.string(),
  disclosureGrantRef: v.string(), disclosureGrantDigest: v.string(),
  input: v.object({ schemaIdentity: v.string(), value: v.any(), valueDigest: v.string() }), // runtime-validated JsonValue boundary
  output: v.object({ schemaIdentity: v.string() }),
  spend: v.object({ currency: v.string(), maximumAmountMinor: v.number() }),
  dataScope: v.array(approvalGrantDataUseV2Value), dataScopeDigest: v.string(),
  effectScope: v.array(capabilityEffectV2Value), evidenceScope: v.array(approvalGrantEvidenceScopeV2Value),
  authorityScopeDigest: v.string(),
  recovery: v.object({
    unknownOutcome: v.literal('reconcile_only'), automaticRetry: v.literal(false),
    registeredLifecycle: v.object({
      idempotency: v.union(v.literal('not_applicable'), v.literal('required')),
      recovery: v.union(v.literal('retry_safe'), v.literal('reconcile_required')),
    }),
  }),
  releasedAt: v.number(), expiresAt: v.number(),
})
export const actionAttemptReleaseV2Value = v.object({
  format: v.literal('ae.action-attempt-release:v2'),
  releaseRef: v.string(), releaseDigest: v.string(), state: v.literal('released'),
  actionAttemptRef: v.string(), actionAttemptDigest: v.string(),
  providerReleaseGrantRef: v.string(), providerReleaseGrantDigest: v.string(),
  disclosureGrantRef: v.string(), disclosureGrantDigest: v.string(),
  envelopeRef: v.string(), envelopeDigest: v.string(), authorityLineageDigest: v.string(),
  providerIdempotencyKey: v.string(), releasedAt: v.number(),
})
export const providerResultEchoV2Value = v.object({
  envelopeRef: v.string(), envelopeDigest: v.string(),
  actionAttemptRef: v.string(), actionAttemptDigest: v.string(),
  authorityLineageDigest: v.string(), providerIdempotencyKey: v.string(),
})
export const providerResultV2Value = v.object({
  format: v.literal('ae.provider-result:v2'), echo: providerResultEchoV2Value, output: v.any(), // runtime-validated JsonValue boundary
})
export const providerOutcomeV2Value = v.union(
  v.object({
    format: v.literal('ae.provider-outcome:v2'), outcomeRef: v.string(), outcomeDigest: v.string(),
    state: v.literal('succeeded'), envelopeRef: v.string(), envelopeDigest: v.string(), responseDigest: v.string(),
    output: v.any(), outputDigest: v.string(), lineage: providerExecutionLineageV2Value, lineageDigest: v.string(), // runtime-validated JsonValue boundary
    recovery: v.object({ unknownOutcome: v.literal('reconcile_only'), automaticRetry: v.literal(false) }),
    observedAt: v.number(),
  }),
  v.object({
    format: v.literal('ae.provider-outcome:v2'), outcomeRef: v.string(), outcomeDigest: v.string(),
    state: v.literal('unknown_external_state'),
    reason: v.union(
      v.literal('provider_response_invalid'), v.literal('provider_echo_mismatch'),
      v.literal('provider_output_invalid'),
    ),
    envelopeRef: v.string(), envelopeDigest: v.string(), responseDigest: v.string(),
    lineage: providerExecutionLineageV2Value, lineageDigest: v.string(),
    recovery: v.object({ kind: v.literal('reconcile_required'), automaticRetry: v.literal(false) }),
    observedAt: v.number(),
  }),
)
export const providerRootRunV2Value = v.object({
  format: v.literal('ae.provider-root-run:v2'), rootRunRef: v.string(), rootRunDigest: v.string(),
  state: v.union(v.literal('succeeded'), v.literal('unknown_external_state')),
  outcomeRef: v.string(), outcomeDigest: v.string(), envelopeRef: v.string(), envelopeDigest: v.string(),
  lineage: providerExecutionLineageV2Value, lineageDigest: v.string(), recordedAt: v.number(),
})
export const providerLeafRunV2Value = v.object({
  format: v.literal('ae.provider-leaf-run:v2'), leafRunRef: v.string(), leafRunDigest: v.string(),
  state: v.union(v.literal('succeeded'), v.literal('unknown_external_state')),
  outcomeRef: v.string(), outcomeDigest: v.string(), envelopeRef: v.string(), envelopeDigest: v.string(),
  businessId: v.string(), offeringId: v.string(), bindingId: v.string(),
  lineage: providerExecutionLineageV2Value, lineageDigest: v.string(), recordedAt: v.number(),
})
export const providerProtocolEvidenceV2Value = v.object({
  format: v.literal('ae.provider-protocol-evidence:v2'),
  protocolEvidenceRef: v.string(), protocolEvidenceDigest: v.string(),
  disposition: v.union(v.literal('validated_result'), v.literal('unknown_external_state')),
  outcomeRef: v.string(), outcomeDigest: v.string(), envelopeRef: v.string(), envelopeDigest: v.string(),
  responseDigest: v.string(), outputDigest: v.optional(v.string()),
  providerResult: v.optional(providerResultV2Value),
  observedEcho: v.optional(providerResultEchoV2Value),
  lineage: providerExecutionLineageV2Value, lineageDigest: v.string(), recordedAt: v.number(),
})
export const providerReconciliationEvidenceV2Value = v.object({
  evidenceId: v.string(), purpose: v.union(v.literal('completion'), v.literal('recovery')),
  outputPointer: v.string(), schemaIdentity: v.string(), value: v.any(), valueDigest: v.string(), // runtime-validated JsonValue boundary
})
const providerReconciliationTerminalV2Value = v.object({
  providerResult: providerResultV2Value, output: v.any(), outputDigest: v.string(), // runtime-validated JsonValue boundary
  evidence: v.array(providerReconciliationEvidenceV2Value),
})
export const providerReconciliationUnknownReasonV2Value = v.union(
  v.literal('provider_pending'), v.literal('evidence_invalid'),
  v.literal('provider_identity_mismatch'), v.literal('provider_echo_mismatch'),
  v.literal('provider_output_invalid'), v.literal('terminal_evidence_missing'),
)
export const providerReconciliationObservationV2Value = v.object({
  format: v.literal('ae.provider-reconciliation-observation:v2'),
  observationRef: v.string(), observationDigest: v.string(),
  state: v.union(v.literal('unknown_external_state'), v.literal('succeeded'), v.literal('failed')),
  reason: v.optional(providerReconciliationUnknownReasonV2Value),
  originOutcomeRef: v.string(), originOutcomeDigest: v.string(),
  envelopeRef: v.string(), envelopeDigest: v.string(), providerEvidenceRef: v.optional(v.string()),
  providerEvidenceIdentityDigest: v.optional(v.string()),
  report: v.any(), reportDigest: v.string(), lineage: providerExecutionLineageV2Value, // runtime-validated JsonValue boundary
  lineageDigest: v.string(), terminal: v.optional(providerReconciliationTerminalV2Value),
  recovery: v.object({
    kind: v.union(v.literal('reconcile_required'), v.literal('terminal')),
    automaticRetry: v.literal(false),
  }),
  observedAt: v.number(),
})
export const actionAttemptResolutionV2Value = v.object({
  format: v.literal('ae.action-attempt-resolution:v2'),
  resolutionRef: v.string(), resolutionDigest: v.string(),
  state: v.union(v.literal('unknown_external_state'), v.literal('succeeded'), v.literal('failed')),
  actionAttemptRef: v.string(), actionAttemptDigest: v.string(),
  originOutcomeRef: v.string(), originOutcomeDigest: v.string(),
  latestObservationRef: v.string(), latestObservationDigest: v.string(),
  lineage: providerExecutionLineageV2Value, lineageDigest: v.string(),
  terminal: v.optional(providerReconciliationTerminalV2Value),
  automaticRetry: v.literal(false), updatedAt: v.number(),
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
    customerPrompt: v.optional(v.string()),
    targets: v.array(missingTargetV2Value),
    impact: v.object({ affectedCandidates: v.array(v.string()), probesEnabled: v.array(v.string()) }),
    requirementDigest: v.string(),
  }),
  v.object({ kind: v.literal('intent_direction'), prompt: v.string(), requirementDigest: v.string() }),
)
const criterionV2Value = v.object({
  inputKey: v.string(), inputPointer: v.string(), label: v.string(),
  value: v.any(), // runtime-validated JsonValue boundary
  basis: v.union(v.literal('customer_provided'), v.literal('extracted_from_request')),
  impact: v.optional(v.union(
    v.literal('eligibility_and_comparison'), v.literal('uncertainty'), v.literal('authority_boundary'),
  )),
  criterionDigest: v.string(),
})
const disclosureV2Value = v.object({
  maximumRecipients: v.number(), purposes: v.array(v.string()),
  categories: v.array(v.object({
    inputKey: v.string(), label: v.string(),
    classification: v.union(v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
  })),
})
const registeredPriceV2Value = v.union(
  v.object({ kind: v.literal('fixed'), currency: v.string(), amountMinor: v.number() }),
  v.object({ kind: v.literal('range'), currency: v.string(), minimumAmountMinor: v.number(), maximumAmountMinor: v.number() }),
  v.object({ kind: v.literal('on_request') }),
)
const commercialRelationshipV2Value = v.object({
  kind: v.union(v.literal('none'), v.literal('direct'), v.literal('affiliate'), v.literal('ownership')),
  summary: v.string(), influencesEligibility: v.boolean(), influencesInclusion: v.boolean(),
  influencesOrder: v.boolean(), evidenceRefs: v.array(v.string()),
})
export const requestEvaluationCandidateV2Value = v.object({
  candidateRef: v.string(), businessId: v.string(), offeringId: v.string(), bindingId: v.string(),
  contractRef: capabilityContractRefV2Value, selectionKey: v.string(), semanticDigest: v.string(),
  offeringRegistrationHash: v.string(), bindingRegistrationHash: v.string(),
  publicationRef: v.optional(v.string()), publicationRevision: v.optional(v.number()), readinessValidUntil: v.optional(v.number()),
  price: v.optional(registeredPriceV2Value),
  // Optional only for immutable Request revisions written before recommendation integrity was source-owned.
  commercialRelationship: v.optional(commercialRelationshipV2Value),
  // Optional only for immutable Request revisions written before RoutePlan cancellation was bound.
  // Current production compilation always supplies it and mandate creation rejects its absence.
  cancellation: v.optional(v.object({
    kind: v.union(v.literal('unsupported'), v.literal('adapter_managed')),
    evidenceRefs: v.array(v.string()),
  })),
  viability: v.union(
    v.object({ kind: v.literal('viable') }),
    v.object({ kind: v.literal('blocked_on_information'), inputs: v.array(v.object({
      ...missingTargetV2Value.fields, customerLabel: v.string(), customerPrompt: v.optional(v.string()),
    })) }),
    v.object({ kind: v.literal('incompatible'), issueKeywords: v.array(v.string()) }),
  ),
})
const completionRequirementV2Value = v.object({
  actionId: v.string(), contractRef: capabilityContractRefV2Value,
  evidenceId: v.string(), outputPointer: v.string(), purpose: v.literal('completion'), schemaIdentity: v.string(),
})
const actionInputMappingV2Value = v.object({
  mappingId: v.string(),
  semanticIdentity: v.string(),
  source: v.object({ actionId: v.string(), annotationId: v.string(), evidenceId: v.string(), outputPointer: v.string() }),
  target: v.object({ annotationId: v.string(), inputKey: v.string(), inputPointer: v.string() }),
  schemaIdentity: v.string(), authority: v.literal('registered_contract_semantics'),
})
const proposedActionV2Value = v.object({
  actionId: v.string(), contractRef: capabilityContractRefV2Value,
  selectionKey: v.string(), semanticDigest: v.string(), dependsOn: v.array(v.string()),
  inputs: v.array(requestFactV2Value),
  inputMappings: v.array(actionInputMappingV2Value),
})
const routePlanV2Value = v.object({
  routePlanId: v.string(), requestId: v.string(), requestRevision: v.number(), registrySnapshotDigest: v.string(),
  steps: v.array(v.object({
    actionId: v.string(), candidateRef: v.string(), businessId: v.string(), offeringId: v.string(), bindingId: v.string(),
    contractRef: capabilityContractRefV2Value, offeringRegistrationHash: v.string(), bindingRegistrationHash: v.string(),
    publicationRef: v.string(), publicationRevision: v.number(),
    resolvedInputs: v.array(requestFactV2Value), deferredInputs: v.array(actionInputMappingV2Value),
    price: registeredPriceV2Value,
    // Optional only for immutable RoutePlan generations written before recommendation integrity was source-owned.
    commercialRelationship: v.optional(commercialRelationshipV2Value),
    dataUse: v.array(v.object({
      effectId: v.string(), inputPointer: v.string(),
      classification: v.union(v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
      phase: v.union(v.literal('preparation'), v.literal('execution')),
      recipient: v.union(
        v.object({ kind: v.literal('candidate_binding') }),
        v.object({ kind: v.literal('selected_binding') }),
        v.object({ kind: v.literal('named_recipient'), recipientId: v.string() }),
      ),
      purposes: v.array(v.string()),
    })),
    effects: v.array(v.object({
      effectId: v.string(), class: v.union(v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change')),
      authority: v.union(v.literal('none'), v.literal('explicit'), v.literal('mandate_or_explicit')),
      reversibility: v.union(v.literal('not_applicable'), v.literal('reversible'), v.literal('conditional'), v.literal('irreversible')),
    })),
    evidence: v.array(v.object({
      evidenceId: v.string(), outputPointer: v.string(), purpose: v.union(v.literal('comparison'), v.literal('completion'), v.literal('recovery')),
      annotationId: v.string(), label: v.string(), role: v.union(v.literal('comparison'), v.literal('completion_evidence'), v.literal('recovery')),
      semanticIdentity: v.optional(v.string()), guaranteed: v.boolean(), schemaIdentity: v.string(),
    })),
    // Optional only for immutable RoutePlan generations written before #172.
    cancellation: v.optional(v.object({
      kind: v.union(v.literal('unsupported'), v.literal('adapter_managed')),
      evidenceRefs: v.array(v.string()),
    })),
    recovery: v.object({
      idempotency: v.union(v.literal('not_applicable'), v.literal('required')),
      recovery: v.union(v.literal('retry_safe'), v.literal('reconcile_required')),
    }),
  })),
  edges: v.array(v.object({
    mappingId: v.string(),
    semanticIdentity: v.string(),
    source: v.object({ actionId: v.string(), annotationId: v.string(), evidenceId: v.string(), outputPointer: v.string() }),
    target: v.object({ annotationId: v.string(), inputKey: v.string(), inputPointer: v.string() }),
    schemaIdentity: v.string(), authority: v.literal('registered_contract_semantics'),
    fromStep: v.string(), toStep: v.string(),
  })),
  maximumTotalCost: v.union(
    v.object({ kind: v.literal('known'), currency: v.string(), amountMinor: v.number() }),
    v.object({ kind: v.literal('requires_preparation') }),
  ),
  expiresAt: v.number(), uncertainty: v.array(v.union(
    v.literal('cost_requires_preparation'), v.literal('customer_fact_requires_evidence'),
  )),
  fallbacks: v.object({
    ordering: v.literal('unranked'),
    alternatives: v.array(v.object({
      alternativeRouteRef: v.string(), when: v.literal('route_unavailable_before_approval'),
    })),
  }), authority: v.literal('proposal_only'), routeDigest: v.string(),
  comparison: v.object({
    fit: v.literal('all_steps_viable'), completeness: v.literal('complete'),
    dataExposureCount: v.number(), irreversibleEffectCount: v.number(), evidenceRequirementCount: v.number(),
    // Historical generations remain readable; new compilation and every customer projection use the truthful current label.
    trust: v.union(v.literal('registered_current_option'), v.literal('registered_live_supply')),
    outcomeSignature: v.optional(v.string()),
    hardConstraints: v.optional(v.union(v.literal('satisfied'), v.literal('not_evaluated'))),
    duration: v.optional(v.literal('not_declared')),
    recovery: v.optional(v.union(v.literal('retry_safe'), v.literal('reconcile_required'))),
    freshnessValidUntil: v.optional(v.number()),
    ordering: v.union(
      v.object({ kind: v.literal('unranked') }),
      v.object({
        kind: v.literal('ranked'), objective: v.literal('lowest_maximum_price'), position: v.number(),
        evidenceRef: v.optional(v.string()),
      }),
    ),
  }),
})
export const routePlanGenerationV2Value = v.object({
  format: v.literal('ae.route-plan-generation:v1'),
  generationRef: v.string(), generation: v.number(), generationDigest: v.string(),
  requestId: v.string(), requestRevision: v.number(),
  compiler: v.object({
    compilerVersion: v.literal('customer-request-route-compiler:v1'), interpreterId: v.string(),
    interpretationEvidence: v.union(
      v.object({
        kind: v.literal('model_output'), systemInstructionVersion: v.string(),
        inputDigest: v.string(), outputDigest: v.string(),
      }),
      v.object({ kind: v.literal('deterministic_input') }),
    ),
    proposalDigest: v.string(),
  }),
  registrySnapshotDigest: v.string(),
  // Optional only so immutable generations written before #169 remain readable.
  // Every new commit path requires this snapshot before accepting a generation.
  decisionSnapshot: v.optional(v.object({
    requestSnapshotDigest: v.string(), factsDigest: v.string(),
    criteria: v.array(criterionV2Value),
    completionRequirements: v.array(completionRequirementV2Value),
    evaluationDigest: v.string(), planRevisionId: v.string(), planDigest: v.string(),
  })),
  routes: v.array(routePlanV2Value),
  authority: v.literal('proposal_only'), createdAt: v.number(),
})
export const customerRequestV2AggregateValue = v.object({
  aggregateVersion: v.literal(2),
  snapshot: v.object({
    requestId: v.string(), revision: v.number(), principalId: v.string(), delegatedAgentId: v.string(),
    intent: v.string(), networkId: v.string(), facts: v.array(requestFactV2Value),
    routeExclusions: v.optional(v.array(v.object({
      choiceSignature: v.string(), reportedRouteRef: v.string(), reportedGenerationRef: v.string(),
      reason: v.string(), recordedAtRevision: v.number(),
    }))),
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
    interpreterId: v.string(),
    interpretationEvidence: v.union(
      v.object({
        kind: v.literal('model_output'), systemInstructionVersion: v.string(),
        inputDigest: v.string(), outputDigest: v.string(),
      }),
      v.object({ kind: v.literal('deterministic_input') }),
    ),
    proposalDigest: v.string(), registrySnapshotDigest: v.string(),
    actions: v.array(proposedActionV2Value), completionRequirements: v.array(completionRequirementV2Value),
    compilerVersion: v.literal('customer-request-route-compiler:v1'), authority: v.literal('proposal_only'),
    planDigest: v.string(), createdAt: v.number(),
  }),
  completedTaskReferences: v.optional(v.array(v.object({
    role: v.literal('prior_completed_task'),
    referenceRef: v.string(), invocationRef: v.string(),
    actionId: v.string(), actionVersion: v.string(),
    sourceResultRef: v.string(), resultDigest: v.string(),
    businessOutcome: v.union(v.literal('queued_communication'), v.literal('completed')),
    referencedAt: v.number(),
  }))),
  importedCommitmentReferences: v.optional(v.array(v.object({
    role: v.literal('imported_commitment_claim'),
    referenceRef: v.string(), claimRef: v.string(), claimDigest: v.string(),
    issuerRef: v.string(), observerRef: v.string(),
    subject: v.object({ kind: v.string(), ref: v.string() }),
    commitmentKind: v.string(),
    source: v.object({ system: v.string(), reference: v.string(), digest: v.string() }),
    observedAt: v.number(), assertedAt: v.optional(v.number()),
    validity: v.union(
      v.object({ kind: v.literal('valid_until'), validUntil: v.number() }),
      v.object({ kind: v.literal('unknown') }),
      v.object({
        kind: v.literal('withdrawn'), withdrawnAt: v.number(),
        evidenceRefs: v.array(v.string()),
      }),
    ),
    evidenceRefs: v.array(v.string()),
    verification: v.literal('imported_unverified'),
    observationPosture: v.literal('imported_claim_only'),
    referencedAt: v.number(),
  }))),
  outcome: v.union(v.literal('plan_ready'), v.literal('needs_information'), v.literal('unsupported')),
  aggregateDigest: v.string(),
})


// Deprecated persisted-row compatibility: immutable revisions written before the
// route inputs became explicit remain readable, but current writers never emit this shape.
const {
  resolvedInputs: _legacyResolvedInputs,
  deferredInputs: _legacyDeferredInputs,
  ...legacyRouteStepV2Fields
} = routePlanV2Value.fields.steps.element.fields
const legacyRoutePlanV2Value = v.object({
  ...routePlanV2Value.fields,
  steps: v.array(v.object(legacyRouteStepV2Fields)),
})
const legacyCustomerRequestV2AggregateValue = v.object({
  ...customerRequestV2AggregateValue.fields,
  plan: v.object({
    ...customerRequestV2AggregateValue.fields.plan.fields,
    routes: v.array(legacyRoutePlanV2Value),
  }),
})

// Retained historical format: new commands cannot write it, but existing signed
// ancestry remains readable and is returned to the Request flow as resubmit-only.
export const customerRequestV2StoredAggregateValue = v.union(
  customerRequestV2AggregateValue,
  legacyCustomerRequestV2AggregateValue,
)

export const customerRequestV2Tables = {
  customerRequestAgentPrincipals: defineTable({
    principalId: v.string(), ownerId: v.string(), ownerTokenIdentifier: v.optional(v.string()),
    credentialId: v.string(), scopes: v.array(v.string()),
    recordedAt: v.number(), lastSeenAt: v.number(),
  })
    .index('by_principalId', ['principalId'])
    .index('by_credentialId', ['credentialId'])
    .index('by_ownerId', ['ownerId'])
    .index('by_ownerId_and_lastSeenAt', ['ownerId', 'lastSeenAt']),

  customerRequestV2Heads: defineTable({
    requestId: v.string(), principalId: v.string(), delegatedAgentId: v.string(), currentRevision: v.number(),
    currentAggregateDigest: v.string(), createdAt: v.number(), updatedAt: v.number(),
  }).index('by_requestId', ['requestId']),

  customerRequestV2SubmissionShells: defineTable({
    commandKey: v.string(), commandDigest: v.string(),
    requestId: v.string(), principalId: v.string(), delegatedAgentId: v.string(),
    intent: v.string(), networkId: v.string(), createdAt: v.number(),
  })
    .index('by_commandKey', ['commandKey'])
    .index('by_requestId', ['requestId']),

  customerRequestV2Revisions: defineTable({
    requestId: v.string(), requestRevision: v.number(), aggregate: customerRequestV2StoredAggregateValue,
  }).index('by_requestId_and_requestRevision', ['requestId', 'requestRevision']),

  customerRequestV2RoutePlanHeads: defineTable({
    requestId: v.string(), currentGeneration: v.number(), currentRequestRevision: v.number(),
    currentGenerationRef: v.optional(v.string()), currentGenerationDigest: v.optional(v.string()),
    currentDecisionCommandKey: v.optional(v.string()), currentDecisionCommandDigest: v.optional(v.string()),
    createdAt: v.number(), updatedAt: v.number(),
  }).index('by_requestId', ['requestId']),

  customerRequestV2RoutePlanGenerations: defineTable({
    requestId: v.string(), generation: v.number(), generationRef: v.string(), generationDigest: v.string(),
    requestRevision: v.number(), routeGeneration: routePlanGenerationV2Value, recordedAt: v.number(),
  })
    .index('by_requestId_and_generation', ['requestId', 'generation'])
    .index('by_requestId_and_generationRef', ['requestId', 'generationRef'])
    .index('by_generationRef', ['generationRef']),

  customerRequestV2Commands: defineTable({
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), requestId: v.string(),
    expectedRevision: v.number(), resultingRevision: v.number(), aggregateDigest: v.string(),
    expectedRouteGeneration: v.optional(v.number()), resultingRouteGenerationRef: v.optional(v.string()),
    noEffect: v.optional(v.boolean()), committedAt: v.number(),
  })
    .index('by_commandKey', ['commandKey'])
    .index('by_requestId_and_resultingRevision', ['requestId', 'resultingRevision']),

  customerRequestV2RoutePlanGenerationCommands: defineTable({
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), requestId: v.string(),
    expectedRequestRevision: v.number(), expectedGeneration: v.number(), expectedGenerationRef: v.string(),
    expectedDecisionCommandKey: v.optional(v.string()),
    resultKind: v.union(
      v.literal('unchanged'), v.literal('superseded'),
      v.literal('needs_information'), v.literal('unsupported'), v.literal('retryable'),
    ),
    retryReason: v.optional(v.union(
      v.literal('current_supply_unavailable'),
      v.literal('interpreter_unavailable'),
      v.literal('interpretation_unusable'),
      v.literal('context_changed'),
    )),
    resultAggregate: v.optional(customerRequestV2AggregateValue),
    resultingGeneration: v.optional(v.number()), resultingGenerationRef: v.optional(v.string()),
    resultingGenerationDigest: v.optional(v.string()), committedAt: v.number(),
  })
    .index('by_commandKey', ['commandKey'])
    .index('by_requestId_and_resultingGeneration', ['requestId', 'resultingGeneration']),

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

  customerRequestV2ApprovalGrants: defineTable({
    approvalGrantRef: v.string(), approvalGrantDigest: v.string(),
    preparedActionRef: v.string(), preparedActionDigest: v.string(),
    requestId: v.string(), requestRevision: v.number(), actionId: v.string(), principalId: v.string(),
    approvalGrant: approvalGrantV2Value, recordedAt: v.number(),
  })
    .index('by_approvalGrantRef', ['approvalGrantRef'])
    .index('by_preparedActionRef', ['preparedActionRef'])
    .index('by_requestId_and_requestRevision_and_actionId', ['requestId', 'requestRevision', 'actionId']),

  customerRequestV2ApprovalGrantCommands: defineTable({
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(),
    requestId: v.string(), requestRevision: v.number(), preparedActionRef: v.string(),
    resultRef: v.string(), resultDigest: v.string(), committedAt: v.number(),
  }).index('by_commandKey', ['commandKey']),

  customerRequestV2ActionAttempts: defineTable({
    actionAttemptRef: v.string(), actionAttemptDigest: v.string(), approvalGrantRef: v.string(),
    requestId: v.string(), requestRevision: v.number(), actionId: v.string(), principalId: v.string(),
    actionAttempt: actionAttemptV2Value, recordedAt: v.number(),
  })
    .index('by_actionAttemptRef', ['actionAttemptRef'])
    .index('by_approvalGrantRef', ['approvalGrantRef'])
    .index('by_requestId_and_requestRevision_and_actionId', ['requestId', 'requestRevision', 'actionId']),

  customerRequestV2ActionAuthorityBudgets: defineTable({
    authorityBudgetRef: v.string(), authorityBudgetDigest: v.string(),
    approvalGrantRef: v.string(), requestId: v.string(), requestRevision: v.number(), actionId: v.string(),
    authorityLineageDigest: v.string(), budget: actionAuthorityBudgetV2Value, recordedAt: v.number(),
  })
    .index('by_authorityBudgetRef', ['authorityBudgetRef'])
    .index('by_requestId_and_requestRevision_and_actionId', ['requestId', 'requestRevision', 'actionId']),

  customerRequestV2ApprovalGrantConsumptions: defineTable({
    consumptionRef: v.string(), consumptionDigest: v.string(), approvalGrantRef: v.string(),
    actionAttemptRef: v.string(), authorityLineageDigest: v.string(),
    consumption: approvalGrantConsumptionV2Value, recordedAt: v.number(),
  })
    .index('by_consumptionRef', ['consumptionRef'])
    .index('by_approvalGrantRef', ['approvalGrantRef']),

  customerRequestV2ActionAttemptIdempotencyClaims: defineTable({
    idempotencyClaimRef: v.string(), idempotencyClaimDigest: v.string(), admissionKeyDigest: v.string(),
    actionAttemptRef: v.string(), authorityLineageDigest: v.string(),
    idempotencyClaim: actionAttemptIdempotencyClaimV2Value, recordedAt: v.number(),
  })
    .index('by_idempotencyClaimRef', ['idempotencyClaimRef'])
    .index('by_admissionKeyDigest', ['admissionKeyDigest']),

  customerRequestV2ActionAttemptSpendReservations: defineTable({
    spendReservationRef: v.string(), spendReservationDigest: v.string(), actionAttemptRef: v.string(),
    authorityLineageDigest: v.string(), reservation: actionAttemptSpendReservationV2Value, recordedAt: v.number(),
  })
    .index('by_spendReservationRef', ['spendReservationRef'])
    .index('by_actionAttemptRef', ['actionAttemptRef']),

  customerRequestV2ActionAttemptDataReservations: defineTable({
    dataReservationRef: v.string(), dataReservationDigest: v.string(), actionAttemptRef: v.string(),
    authorityLineageDigest: v.string(), reservation: actionAttemptDataReservationV2Value, recordedAt: v.number(),
  })
    .index('by_dataReservationRef', ['dataReservationRef'])
    .index('by_actionAttemptRef', ['actionAttemptRef']),

  customerRequestV2ProviderReleaseGrants: defineTable({
    providerReleaseGrantRef: v.string(), providerReleaseGrantDigest: v.string(), actionAttemptRef: v.string(),
    authorityLineageDigest: v.string(), grant: providerReleaseGrantV2Value, recordedAt: v.number(),
  })
    .index('by_providerReleaseGrantRef', ['providerReleaseGrantRef'])
    .index('by_actionAttemptRef', ['actionAttemptRef']),

  customerRequestV2ActionDisclosureGrants: defineTable({
    disclosureGrantRef: v.string(), disclosureGrantDigest: v.string(), actionAttemptRef: v.string(),
    authorityLineageDigest: v.string(), grant: actionDisclosureGrantV2Value, recordedAt: v.number(),
  })
    .index('by_disclosureGrantRef', ['disclosureGrantRef'])
    .index('by_actionAttemptRef', ['actionAttemptRef']),

  customerRequestV2ActionAttemptReleases: defineTable({
    commandKey: v.string(), commandDigest: v.string(),
    actionAttemptRef: v.string(), actionAttemptDigest: v.string(),
    providerReleaseGrantRef: v.string(), disclosureGrantRef: v.string(),
    envelopeRef: v.string(), envelopeDigest: v.string(), authorityLineageDigest: v.string(),
    releaseRef: v.string(), releaseDigest: v.string(), release: actionAttemptReleaseV2Value,
    envelope: providerInvocationEnvelopeV2Value, committedAt: v.number(),
  })
    .index('by_commandKey', ['commandKey'])
    .index('by_actionAttemptRef', ['actionAttemptRef'])
    .index('by_providerReleaseGrantRef', ['providerReleaseGrantRef'])
    .index('by_disclosureGrantRef', ['disclosureGrantRef'])
    .index('by_envelopeRef', ['envelopeRef']),

  customerRequestV2ProviderOutcomes: defineTable({
    commandKey: v.string(), commandDigest: v.string(), actionAttemptRef: v.string(),
    envelopeRef: v.string(), envelopeDigest: v.string(), outcomeRef: v.string(), outcomeDigest: v.string(),
    authorityLineageDigest: v.string(), responseDigest: v.string(),
    outcome: providerOutcomeV2Value, committedAt: v.number(),
  })
    .index('by_commandKey', ['commandKey'])
    .index('by_actionAttemptRef', ['actionAttemptRef'])
    .index('by_outcomeRef', ['outcomeRef']),

  customerRequestV2ProviderRootRuns: defineTable({
    rootRunRef: v.string(), rootRunDigest: v.string(), outcomeRef: v.string(), actionAttemptRef: v.string(),
    authorityLineageDigest: v.string(), rootRun: providerRootRunV2Value, recordedAt: v.number(),
  })
    .index('by_rootRunRef', ['rootRunRef'])
    .index('by_outcomeRef', ['outcomeRef']),

  customerRequestV2ProviderLeafRuns: defineTable({
    leafRunRef: v.string(), leafRunDigest: v.string(), outcomeRef: v.string(), actionAttemptRef: v.string(),
    authorityLineageDigest: v.string(), leafRun: providerLeafRunV2Value, recordedAt: v.number(),
  })
    .index('by_leafRunRef', ['leafRunRef'])
    .index('by_outcomeRef', ['outcomeRef']),

  customerRequestV2ProviderProtocolEvidence: defineTable({
    protocolEvidenceRef: v.string(), protocolEvidenceDigest: v.string(),
    outcomeRef: v.string(), actionAttemptRef: v.string(), authorityLineageDigest: v.string(),
    protocolEvidence: providerProtocolEvidenceV2Value, recordedAt: v.number(),
  })
    .index('by_protocolEvidenceRef', ['protocolEvidenceRef'])
    .index('by_outcomeRef', ['outcomeRef']),

  customerRequestV2ProviderReconciliationObservations: defineTable({
    observationRef: v.string(), observationDigest: v.string(), actionAttemptRef: v.string(),
    originOutcomeRef: v.string(), providerEvidenceRef: v.optional(v.string()),
    providerEvidenceIdentityDigest: v.optional(v.string()), authorityLineageDigest: v.string(),
    observation: providerReconciliationObservationV2Value, recordedAt: v.number(),
  })
    .index('by_observationRef', ['observationRef'])
    .index('by_providerEvidenceIdentityDigest', ['providerEvidenceIdentityDigest'])
    .index('by_actionAttemptRef_and_recordedAt', ['actionAttemptRef', 'recordedAt']),

  customerRequestV2ActionAttemptResolutions: defineTable({
    resolutionRef: v.string(), resolutionDigest: v.string(), actionAttemptRef: v.string(),
    requestId: v.string(), requestRevision: v.number(), actionId: v.string(), principalId: v.string(),
    state: v.union(v.literal('unknown_external_state'), v.literal('succeeded'), v.literal('failed')),
    authorityLineageDigest: v.string(), resolution: actionAttemptResolutionV2Value, updatedAt: v.number(),
  })
    .index('by_resolutionRef', ['resolutionRef'])
    .index('by_actionAttemptRef', ['actionAttemptRef'])
    .index('by_requestId_and_requestRevision_and_actionId', ['requestId', 'requestRevision', 'actionId']),

  customerRequestV2ProviderReconciliationCommands: defineTable({
    commandKey: v.string(), commandDigest: v.string(), actionAttemptRef: v.string(),
    reportDigest: v.string(), observationRef: v.string(), observationDigest: v.string(),
    resolutionRef: v.string(), resolutionDigest: v.string(), committedAt: v.number(),
  }).index('by_commandKey', ['commandKey']),

  customerRequestV2ActionAttemptAdmissionCommands: defineTable({
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(),
    requestId: v.string(), requestRevision: v.number(),
    approvalGrantRef: v.string(), authorityLineageDigest: v.string(),
    resultRef: v.string(), resultDigest: v.string(), committedAt: v.number(),
  })
    .index('by_commandKey', ['commandKey'])
    .index('by_resultRef', ['resultRef']),
} as const
