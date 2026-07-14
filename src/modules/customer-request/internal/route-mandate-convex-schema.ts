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
  dataScope: v.array(v.object({
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
  })),
  effects: v.array(v.object({
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
  })),
  evidence: v.array(v.object({
    evidenceId: v.string(),
    outputPointer: v.string(),
    purpose: v.union(v.literal('comparison'), v.literal('completion'), v.literal('recovery')),
    annotationId: v.string(),
    label: v.string(),
    role: v.union(v.literal('comparison'), v.literal('completion_evidence'), v.literal('recovery')),
    semanticIdentity: v.optional(v.string()),
    guaranteed: v.boolean(),
    schemaIdentity: v.string(),
  })),
  cancellation: v.object({
    kind: v.union(v.literal('unsupported'), v.literal('adapter_managed')),
    evidenceRefs: v.array(v.string()),
  }),
  recovery: v.object({
    idempotency: v.union(v.literal('not_applicable'), v.literal('required')),
    recovery: v.union(v.literal('retry_safe'), v.literal('reconcile_required')),
  }),
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
      v.literal('replacement_issued'),
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
}
