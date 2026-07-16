import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const capabilityContractRef = v.object({
  capabilityId: v.string(),
  version: v.number(),
  contractDigest: v.string(),
})

const money = v.object({ currency: v.string(), amountMinor: v.number() })

const registeredPrice = v.union(
  v.object({ kind: v.literal('fixed'), currency: v.string(), amountMinor: v.number() }),
  v.object({
    kind: v.literal('range'),
    currency: v.string(),
    minimumAmountMinor: v.number(),
    maximumAmountMinor: v.number(),
  }),
  v.object({ kind: v.literal('on_request') }),
)

const dataRecipient = v.union(
  v.object({ kind: v.literal('registered_binding'), businessId: v.string(), bindingId: v.string() }),
  v.object({ kind: v.literal('named_recipient'), recipientId: v.string() }),
)

const routeMandateDataScope = v.object({
  effectId: v.string(),
  inputPointer: v.string(),
  classification: v.union(
    v.literal('public'),
    v.literal('personal'),
    v.literal('sensitive'),
    v.literal('credential'),
  ),
  phase: v.union(v.literal('preparation'), v.literal('execution')),
  recipient: dataRecipient,
  purposes: v.array(v.string()),
})

const routeMandateEffect = v.object({
  effectId: v.string(),
  class: v.union(
    v.literal('data_release'),
    v.literal('financial_exposure'),
    v.literal('external_state_change'),
  ),
  authority: v.union(v.literal('none'), v.literal('explicit'), v.literal('mandate_or_explicit')),
  reversibility: v.union(
    v.literal('not_applicable'),
    v.literal('reversible'),
    v.literal('conditional'),
    v.literal('irreversible'),
  ),
})

const routeMandateEvidence = v.object({
  evidenceId: v.string(),
  outputPointer: v.string(),
  purpose: v.union(v.literal('comparison'), v.literal('completion'), v.literal('recovery')),
  annotationId: v.string(),
  label: v.string(),
  role: v.union(v.literal('comparison'), v.literal('completion_evidence'), v.literal('recovery')),
  semanticIdentity: v.optional(v.string()),
  guaranteed: v.boolean(),
  schemaIdentity: v.string(),
})

const routeMandateCancellation = v.object({
  kind: v.union(v.literal('unsupported'), v.literal('adapter_managed')),
  evidenceRefs: v.array(v.string()),
})

const routeMandateRecovery = v.object({
  idempotency: v.union(v.literal('not_applicable'), v.literal('required')),
  recovery: v.union(v.literal('retry_safe'), v.literal('reconcile_required')),
})

const routeMandateStep = v.object({
  position: v.number(),
  actionId: v.string(),
  candidateRef: v.string(),
  businessId: v.string(),
  offeringId: v.string(),
  bindingId: v.string(),
  contractRef: capabilityContractRef,
  offeringRegistrationHash: v.string(),
  bindingRegistrationHash: v.string(),
  publicationRef: v.string(),
  publicationRevision: v.number(),
  inputScopeDigest: v.string(),
  price: registeredPrice,
  dataScope: v.array(routeMandateDataScope),
  effects: v.array(routeMandateEffect),
  evidence: v.array(routeMandateEvidence),
  cancellation: routeMandateCancellation,
  recovery: routeMandateRecovery,
})

export const routeMandateValue = v.object({
  format: v.literal('ae.route-mandate:v1'),
  mandateRef: v.string(),
  mandateDigest: v.string(),
  principal: v.object({ principalId: v.string(), authenticationEvidenceRef: v.string() }),
  authorization: v.union(
    v.object({
      kind: v.literal('explicit'),
      authorizationEvidenceRef: v.string(),
      authorizationEvidenceDigest: v.string(),
      authorityScopeDigest: v.string(),
    }),
    v.object({
      kind: v.literal('standing_low_risk'),
      standingPolicyRef: v.string(),
      standingPolicyDigest: v.string(),
      authorityUseRef: v.string(),
      authorityScopeDigest: v.string(),
    }),
  ),
  request: v.object({ requestId: v.string(), requestRevision: v.number() }),
  route: v.object({
    generationRef: v.string(),
    generation: v.number(),
    generationDigest: v.string(),
    registrySnapshotDigest: v.string(),
    routePlanId: v.string(),
    routeDigest: v.string(),
    stepGraphDigest: v.string(),
    steps: v.array(routeMandateStep),
    maximumTotalSpend: money,
    dataScopeDigest: v.string(),
    effectScopeDigest: v.string(),
    evidenceScopeDigest: v.string(),
    routeExpiresAt: v.number(),
    fallback: v.object({
      kind: v.literal('new_mandate_required'),
      alternatives: v.array(v.object({ routePlanId: v.string(), routeDigest: v.string() })),
    }),
  }),
  issuedAt: v.number(),
  expiresAt: v.number(),
})

export const routeMandateIssueEvidenceValue = v.object({
  authentication: v.object({
    evidenceRef: v.string(),
    issuer: v.string(),
    subject: v.string(),
    tokenIdentifier: v.string(),
  }),
  authorization: v.object({
    kind: v.literal('explicit'),
    evidenceRef: v.string(),
    evidenceDigest: v.string(),
    commandDigest: v.string(),
    principalId: v.string(),
    requestId: v.string(),
    requestRevision: v.number(),
    generationRef: v.string(),
    selectedRoutePlanId: v.string(),
    maximumTotalSpend: money,
    issuedAt: v.number(),
    expiresAt: v.number(),
    authenticatedActor: v.object({
      issuer: v.string(),
      subject: v.string(),
      tokenIdentifier: v.string(),
    }),
  }),
})

export const routeStepGrantValue = v.object({
  format: v.literal('ae.route-step-grant:v1'),
  grantRef: v.string(),
  grantDigest: v.string(),
  authorityDigest: v.string(),
  mandateRef: v.string(),
  mandateDigest: v.string(),
  principalId: v.string(),
  request: v.object({ requestId: v.string(), requestRevision: v.number() }),
  route: v.object({
    generationRef: v.string(),
    generationDigest: v.string(),
    routePlanId: v.string(),
    routeDigest: v.string(),
  }),
  step: v.object({
    position: v.number(),
    actionId: v.string(),
    candidateRef: v.string(),
    businessId: v.string(),
    offeringId: v.string(),
    bindingId: v.string(),
    contractRef: capabilityContractRef,
    offeringRegistrationHash: v.string(),
    bindingRegistrationHash: v.string(),
    publicationRef: v.string(),
    publicationRevision: v.number(),
    inputScopeDigest: v.string(),
    maximumSpend: money,
    dataScope: v.array(routeMandateDataScope),
    effects: v.array(routeMandateEffect),
    evidence: v.array(routeMandateEvidence),
    cancellation: routeMandateCancellation,
    recovery: routeMandateRecovery,
  }),
  fallbackUse: v.object({ kind: v.literal('primary_route') }),
  operationKeyDigest: v.string(),
  admission: v.object({ reservationRef: v.string(), reservationDigest: v.string() }),
  admittedAt: v.number(),
  expiresAt: v.number(),
})

export const customerRequestRouteMandateTables = {
  customerRequestRouteMandateIssues: defineTable({
    mandateRef: v.string(),
    mandateDigest: v.string(),
    principalId: v.string(),
    requestId: v.string(),
    requestRevision: v.number(),
    generationRef: v.string(),
    routePlanId: v.string(),
    mandate: routeMandateValue,
    evidence: routeMandateIssueEvidenceValue,
    recordedAt: v.number(),
  })
    .index('by_mandateRef', ['mandateRef'])
    .index('by_requestId_and_recordedAt', ['requestId', 'recordedAt']),

  customerRequestRouteMandateHeads: defineTable({
    requestId: v.string(),
    principalId: v.string(),
    currentMandateRef: v.string(),
    currentMandateDigest: v.string(),
    currentRequestRevision: v.number(),
    currentGenerationRef: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_requestId', ['requestId']),

  customerRequestRouteMandateCommands: defineTable({
    commandKey: v.string(),
    commandDigest: v.string(),
    principalId: v.string(),
    requestId: v.string(),
    mandateRef: v.string(),
    mandateDigest: v.string(),
    result: routeMandateValue,
    committedAt: v.number(),
  }).index('by_commandKey', ['commandKey']),

  customerRequestRouteMandateRevocations: defineTable({
    revocationRef: v.string(),
    mandateRef: v.string(),
    mandateDigest: v.string(),
    principalId: v.string(),
    requestId: v.string(),
    reason: v.union(
      v.literal('customer_revoked'),
      v.literal('request_revised'),
      v.literal('route_generation_superseded'),
    ),
    requestRevision: v.number(),
    generationRef: v.string(),
    supersededByRequestRevision: v.optional(v.number()),
    supersededByGenerationRef: v.optional(v.string()),
    evidenceDigest: v.string(),
    recordedAt: v.number(),
  })
    .index('by_revocationRef', ['revocationRef'])
    .index('by_mandateRef', ['mandateRef'])
    .index('by_requestId_and_recordedAt', ['requestId', 'recordedAt']),

  customerRequestRouteMandateRevocationCommands: defineTable({
    commandKey: v.string(),
    commandDigest: v.string(),
    principalId: v.string(),
    requestId: v.string(),
    mandateRef: v.string(),
    revocationRef: v.string(),
    committedAt: v.number(),
  }).index('by_commandKey', ['commandKey']),

  customerRequestRouteStepReservations: defineTable({
    reservationRef: v.string(),
    reservationDigest: v.string(),
    mandateRef: v.string(),
    mandateDigest: v.string(),
    requestId: v.string(),
    routePlanId: v.string(),
    routeDigest: v.string(),
    generationRef: v.string(),
    actionId: v.string(),
    position: v.number(),
    operationKeyDigest: v.string(),
    reservedSpend: money,
    authorityDigest: v.string(),
    grantRef: v.string(),
    grantDigest: v.string(),
    recordedAt: v.number(),
  })
    .index('by_reservationRef', ['reservationRef'])
    .index('by_mandateRef_and_actionId', ['mandateRef', 'actionId'])
    .index('by_mandateRef_and_recordedAt', ['mandateRef', 'recordedAt']),

  customerRequestRouteDataReservations: defineTable({
    allocationRef: v.string(),
    allocationDigest: v.string(),
    reservationRef: v.string(),
    mandateRef: v.string(),
    actionId: v.string(),
    effectId: v.string(),
    inputPointer: v.string(),
    classification: v.union(
      v.literal('public'),
      v.literal('personal'),
      v.literal('sensitive'),
      v.literal('credential'),
    ),
    phase: v.union(v.literal('preparation'), v.literal('execution')),
    recipient: dataRecipient,
    purpose: v.string(),
    recordedAt: v.number(),
  })
    .index('by_allocationRef', ['allocationRef'])
    .index('by_reservationRef', ['reservationRef'])
    .index('by_mandateRef_and_recordedAt', ['mandateRef', 'recordedAt']),

  customerRequestRouteStepAdmissionCommands: defineTable({
    commandKey: v.string(),
    commandDigest: v.string(),
    principalId: v.string(),
    requestId: v.string(),
    mandateRef: v.string(),
    actionId: v.string(),
    reservationRef: v.string(),
    grantRef: v.string(),
    grantDigest: v.string(),
    committedAt: v.number(),
  }).index('by_commandKey', ['commandKey']),

  customerRequestRouteRuns: defineTable({
    runRef: v.string(),
    runDigest: v.string(),
    principalId: v.string(),
    requestId: v.string(),
    requestRevision: v.number(),
    mandateRef: v.string(),
    mandateDigest: v.string(),
    generationRef: v.string(),
    routePlanId: v.string(),
    routeDigest: v.string(),
    businesses: v.optional(v.array(v.object({
      businessRef: v.string(),
      name: v.string(),
    }))),
    state: v.union(
      v.literal('queued'),
      v.literal('running'),
      v.literal('outcome_unknown'),
      v.literal('completed'),
      v.literal('failed'),
      v.literal('cancelled'),
    ),
    totalSteps: v.number(),
    completedSteps: v.number(),
    currentPosition: v.number(),
    resultJson: v.optional(v.string()),
    resultDigest: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_runRef', ['runRef'])
    .index('by_requestId', ['requestId'])
    .index('by_mandateRef', ['mandateRef']),

  customerRequestRouteRunHeads: defineTable({
    requestId: v.string(),
    principalId: v.string(),
    currentRunRef: v.string(),
    currentMandateRef: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_requestId', ['requestId']),

  customerRequestRouteRunCommands: defineTable({
    commandKey: v.string(),
    commandDigest: v.string(),
    principalId: v.string(),
    requestId: v.string(),
    runRef: v.string(),
    committedAt: v.number(),
  }).index('by_commandKey', ['commandKey']),

  customerRequestRouteCancellationCommands: defineTable({
    commandKey: v.string(),
    commandDigest: v.string(),
    principalId: v.string(),
    requestId: v.string(),
    runRef: v.string(),
    result: v.union(v.literal('cancelled'), v.literal('too_late')),
    committedAt: v.number(),
  }).index('by_commandKey', ['commandKey']),

  customerRequestRouteProblemReports: defineTable({
    reportRef: v.string(),
    commandKey: v.string(),
    commandDigest: v.string(),
    principalId: v.string(),
    requestId: v.string(),
    runRef: v.string(),
    mandateRef: v.optional(v.string()),
    attemptRef: v.optional(v.string()),
    step: v.optional(v.number()),
    businessName: v.optional(v.string()),
    category: v.union(
      v.literal('incorrect_result'), v.literal('unexpected_cost'), v.literal('privacy_concern'),
      v.literal('could_not_stop'), v.literal('other'),
    ),
    summary: v.string(),
    createdAt: v.number(),
  })
    .index('by_commandKey', ['commandKey'])
    .index('by_requestId', ['requestId']),

  customerRequestRouteStepAttempts: defineTable({
    attemptRef: v.string(),
    attemptDigest: v.string(),
    runRef: v.string(),
    requestId: v.string(),
    mandateRef: v.string(),
    actionId: v.string(),
    position: v.number(),
    operationKeyDigest: v.string(),
    grant: routeStepGrantValue,
    inputJson: v.string(),
    inputDigest: v.string(),
    outputJson: v.optional(v.string()),
    outputDigest: v.optional(v.string()),
    transportObservationJson: v.optional(v.string()),
    transportObservationDigest: v.optional(v.string()),
    evidence: v.optional(v.array(v.object({
      evidenceId: v.string(),
      outputPointer: v.string(),
      schemaIdentity: v.string(),
      valueDigest: v.string(),
    }))),
    state: v.union(
      v.literal('queued'),
      v.literal('leased'),
      v.literal('dispatched'),
      v.literal('accepted'),
      v.literal('succeeded'),
      v.literal('failed'),
      v.literal('outcome_unknown'),
      v.literal('cancelled'),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_attemptRef', ['attemptRef'])
    .index('by_runRef_and_position', ['runRef', 'position'])
    .index('by_mandateRef_and_actionId', ['mandateRef', 'actionId']),

  customerRequestRouteDispatchOutbox: defineTable({
    dispatchRef: v.string(),
    dispatchDigest: v.string(),
    runRef: v.string(),
    attemptRef: v.string(),
    operationKeyDigest: v.string(),
    state: v.union(
      v.literal('pending'),
      v.literal('leased'),
      v.literal('delivered'),
      v.literal('failed'),
      v.literal('outcome_unknown'),
      v.literal('cancelled'),
    ),
    availableAt: v.number(),
    leaseOwner: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_dispatchRef', ['dispatchRef'])
    .index('by_attemptRef', ['attemptRef'])
    .index('by_state_and_availableAt', ['state', 'availableAt']),
}
