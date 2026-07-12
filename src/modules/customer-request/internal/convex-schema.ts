import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const money = v.object({ currency: v.string(), amountMinor: v.number() })
const business = v.object({ nodeId: v.string(), bindingId: v.string(), name: v.string() })
const planInput = v.union(
  v.object({ kind: v.literal('literal'), value: v.union(v.string(), v.number(), v.boolean()) }),
  v.object({ kind: v.literal('action_output'), actionId: v.string(), field: v.string() }),
)

export const customerRequestValue = v.object({
  requestId: v.string(), principalId: v.string(), delegatedAgentId: v.string(), intent: v.string(), revision: v.number(),
  routing: v.object({
    networkId: v.string(), currency: v.string(), maximumSpendMinor: v.number(),
    optimizeFor: v.union(v.literal('cost'), v.literal('latency')),
  }),
  createdAt: v.number(),
})

export const planRevisionValue = v.object({
  planRevisionId: v.string(), requestId: v.string(), requestRevision: v.number(), proposedByAgentId: v.string(), createdAt: v.number(),
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
    field: v.string(), timing: v.union(v.literal('already_shared_to_prepare'), v.literal('on_execution')),
    recipientBindingId: v.string(), recipientName: v.string(), purposes: v.array(v.string()),
  })),
  materialTerms: v.array(v.object({ key: v.string(), label: v.string(), value: v.string() })),
  cancellation: v.object({ kind: v.union(v.literal('supported'), v.literal('conditional'), v.literal('unsupported')), summary: v.string() }),
  expectedBy: v.optional(v.number()), expiresAt: v.number(), preparedAt: v.number(),
})

export const preparationRefusalReason = v.union(
  v.literal('request_not_found'), v.literal('request_revision_changed'), v.literal('plan_revision_not_found'),
  v.literal('plan_revision_changed'), v.literal('action_not_found'), v.literal('capability_contract_not_found'),
  v.literal('action_input_unresolved'), v.literal('action_input_mismatch'), v.literal('preparation_authority_required'),
  v.literal('preparation_authority_invalid'), v.literal('no_connected_option'), v.literal('route_contract_mismatch'),
  v.literal('route_currency_mismatch'), v.literal('route_spend_exceeded'), v.literal('route_data_contract_mismatch'),
  v.literal('route_recipient_limit_exceeded'), v.literal('route_quote_expired'),
)

export const customerRequestTables = {
  customerRequests: defineTable({
    ...customerRequestValue.fields,
    requestDigest: v.string(), updatedAt: v.number(),
  }).index('by_requestId', ['requestId']),

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
}
