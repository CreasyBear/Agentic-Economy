import { v, type Infer } from 'convex/values'

import {
  openCapabilityDecisionModel,
  projectCapabilityInputValueSchemas,
  sameCapabilityContractRef,
  isBoundedJsonValue,
  type CapabilityContractRef,
  type CapabilityDecisionModel,
  type JsonValue,
} from '@/modules/capability-contract/public'
import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { CustomerRoutePlan } from '@/modules/customer-request/agent-contract'
import {
  compileCustomerRequest,
  writableCustomerRequestV2Aggregate,
  type CompileCustomerRequestResult,
  type CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import {
  writableCustomerRequestRoutePlanGeneration,
  type CustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'
import {
  capabilitySemanticsKey,
  customerRouteRef,
  projectCustomerRoutePlanDecision,
} from '@/modules/customer-request/route-plan-customer-projection'
import {
  requestRegistrySnapshotDigest, type RegisteredEvaluationBinding, type RegisteredSupplyPrice, type RequestFact,
} from '@/modules/customer-request/evaluation'
import {
  customerRequestV2AggregateValue,
  durableActionPreparationV2Value,
  preparedActionRecoveryReasonV2Value,
  preparedActionV2Value,
  routePlanGenerationV2Value,
} from '@/modules/customer-request/runtime'
import {
  projectCustomerActionStatus,
  projectCustomerCriteria,
  projectNeedsAttention,
  projectRequestEvaluation,
  projectRouteConfirmed,
  projectRouteCancelled,
  projectRouteProgress,
  projectRoutePlansReady,
  type CustomerRequestView,
} from '@/modules/customer-request/customer-projection'
import {
  bindCustomerCapabilityDescriptor,
  createJsonCustomerRequestSemanticInterpreter,
  type CustomerRequestSemanticProposal,
} from '@/modules/customer-request/semantic-interpreter'
import { createOpenRouterCustomerRequestSemanticTransport } from '@/modules/customer-request/openrouter-transport'
import { verifyCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'

import { internal } from './_generated/api'
import { action, env, type ActionCtx } from './_generated/server'

const MAX_INTERPRETER_DESCRIPTOR_BYTES = 512_000
const MAX_CONTRACT_PROJECTED_INPUT_SCHEMA_BYTES = 256_000

const serviceAssertion = v.object({
  principalId: v.string(), ownerId: v.string(), credentialId: v.string(), scopes: v.array(v.string()),
  issuedAt: v.number(), signature: v.string(),
})
const commercialInfluence = v.union(
  v.object({ status: v.literal('unknown') }),
  v.object({ status: v.literal('none'), summary: v.string() }),
  v.object({
    status: v.literal('disclosed'),
    relationship: v.union(
      v.literal('commission'), v.literal('sponsorship'), v.literal('rebate'),
      v.literal('ownership'), v.literal('other'),
    ),
    summary: v.string(), payerName: v.string(), beneficiaryName: v.string(), compensationBasis: v.string(),
    influencesEligibility: v.boolean(), influencesInclusion: v.boolean(), influencesOrder: v.boolean(),
  }),
)
const customerOption = v.object({
  optionRef: v.string(), business: v.object({ name: v.string() }),
  expectedCost: v.object({ currency: v.string(), amountMinor: v.number() }),
  maximumCost: v.object({ currency: v.string(), amountMinor: v.number() }),
  expectedLatencyMs: v.number(),
  priceComponents: v.array(v.object({ label: v.string(), amountMinor: v.number() })),
  comparableOutputs: v.array(v.object({
    label: v.string(), value: v.union(v.string(), v.number(), v.boolean()),
  })),
  materialTerms: v.array(v.string()),
  cancellation: v.object({
    kind: v.union(v.literal('supported'), v.literal('conditional'), v.literal('unsupported')),
    summary: v.string(),
  }),
  expiresAt: v.number(),
  provenance: v.object({ kind: v.literal('provider_assertion'), observedAt: v.optional(v.number()), validUntil: v.number() }),
  commercialInfluence,
})
const customerOptionSet = v.object({
  cardinality: v.union(v.literal('none'), v.literal('single'), v.literal('multiple')),
  optionCount: v.number(),
  ordering: v.union(
    v.object({
      kind: v.literal('not_applicable'),
      commercialInfluence: v.union(v.literal('none'), v.literal('disclosed'), v.literal('unknown')),
    }),
    v.object({
      kind: v.literal('unranked'),
      commercialInfluence: v.union(v.literal('none'), v.literal('disclosed'), v.literal('unknown')),
    }),
    v.object({
      kind: v.literal('recommended'), commercialInfluence: v.union(v.literal('none'), v.literal('disclosed')),
      objective: v.literal('lowest_maximum_price'), optionRef: v.string(), evidenceRef: v.string(),
      reasons: v.array(v.string()), tradeoffs: v.array(v.string()),
    }),
  ),
  coverage: v.object({
    evaluated: v.number(), optionsReceived: v.number(), unavailable: v.number(), pending: v.number(), uncertain: v.number(),
    businesses: v.array(v.object({
      name: v.string(),
      status: v.union(
        v.literal('not_contacted'), v.literal('contact_pending'), v.literal('contacted'),
        v.literal('option_received'), v.literal('unavailable'), v.literal('uncertain'),
      ),
      explanation: v.string(),
    })),
  }),
  options: v.array(customerOption),
})
const customerPreparedAction = v.object({
  actionRef: v.string(), businessName: v.string(), offeringLabel: v.string(), summary: v.string(),
  price: v.object({ currency: v.string(), minimumAmountMinor: v.number(), maximumAmountMinor: v.number() }),
  materialTerms: v.array(v.object({ label: v.string(), value: v.string() })),
  cancellation: v.object({ kind: v.union(v.literal('available'), v.literal('unsupported')) }),
  validUntil: v.number(),
  selection: v.object({
    basis: v.union(v.literal('single_option'), v.literal('lowest_maximum_price')),
    alternativeCount: v.number(), unavailableCount: v.number(),
    commercialInfluence: v.union(v.literal('none'), v.literal('disclosed')),
  }),
  dataUse: v.object({
    categories: v.array(v.object({
      label: v.string(), classification: v.union(
        v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential'),
      ),
    })),
    purposes: v.array(v.string()),
  }),
  effects: v.array(v.object({
    class: v.union(v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change')),
    reversibility: v.union(v.literal('not_applicable'), v.literal('reversible'), v.literal('conditional'), v.literal('irreversible')),
  })),
  alternatives: v.array(v.object({
    businessName: v.string(),
    price: v.object({ currency: v.string(), minimumAmountMinor: v.number(), maximumAmountMinor: v.number() }),
    validUntil: v.number(),
  })),
})
const customerBusiness = v.object({ businessRef: v.string(), name: v.string() })
const customerRouteMaximumCost = v.union(
  v.object({ kind: v.literal('known'), currency: v.string(), amountMinor: v.number() }),
  v.object({ kind: v.literal('requires_preparation') }),
)
const customerRouteRecipient = v.object({
  recipientRef: v.string(), name: v.string(), purposes: v.array(v.string()),
  fields: v.array(v.object({
    fieldRef: v.string(), label: v.string(), classification: v.union(
      v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential'),
    ),
  })),
})
const customerRouteEffect = v.object({
  kind: v.union(
    v.literal('information_shared'), v.literal('financial_commitment'), v.literal('external_change'),
  ),
  reversibility: v.union(
    v.literal('not_applicable'), v.literal('reversible'), v.literal('conditional'), v.literal('irreversible'),
  ),
})
const customerRouteEvidence = v.object({
  label: v.string(), purpose: v.union(v.literal('comparison'), v.literal('completion'), v.literal('recovery')),
})
const customerRouteRecovery = v.object({
  step: v.number(), businessName: v.string(),
  posture: v.union(v.literal('retry_safe'), v.literal('reconcile_required')),
})
const customerRouteResult = v.object({
  resultRef: v.string(), summary: v.string(), deliverables: v.array(v.string()),
})
const customerRouteResultChange = v.object({
  resultRef: v.string(), summary: v.string(), deliverables: v.array(v.string()),
  position: v.optional(v.number()),
})
const customerRouteCommercialInfluence = v.union(
  v.object({ status: v.literal('unknown') }),
  v.object({ status: v.literal('none'), evidenceRefs: v.array(v.string()) }),
  v.object({
    status: v.literal('disclosed'), summaries: v.array(v.string()), evidenceRefs: v.array(v.string()),
    affectsDecision: v.boolean(),
  }),
)
const customerRouteComparisonEvidence = v.object({
  outcomeRef: v.string(),
  outcomeFit: v.union(v.literal('same_promised_result'), v.literal('different_promised_result')),
  completeness: v.literal('complete'), hardConstraints: v.literal('satisfied'),
  maximumCost: customerRouteMaximumCost,
  dataExposureCount: v.number(), irreversibleEffectCount: v.number(), uncertaintyCount: v.number(),
  duration: v.literal('not_declared'),
  recovery: v.union(v.literal('retry_safe'), v.literal('reconcile_required')),
  trust: v.literal('registered_live_supply'), evidenceCount: v.number(),
  freshness: v.object({ state: v.union(v.literal('current'), v.literal('expired')), validUntil: v.number() }),
  commercialInfluence: customerRouteCommercialInfluence,
})
const customerRoute = v.object({
  routeRef: v.string(), quoteDigest: v.string(), result: customerRouteResult,
  availability: v.union(v.literal('current'), v.literal('expired')),
  stepCount: v.number(), businesses: v.array(customerBusiness),
  maximumTotalCost: customerRouteMaximumCost,
  dataUse: v.object({
    recipientCount: v.number(), recipients: v.array(customerRouteRecipient), purposes: v.array(v.string()),
  }),
  effects: v.array(customerRouteEffect), evidence: v.array(customerRouteEvidence),
  recovery: v.array(customerRouteRecovery),
  cancellation: v.object({
    kind: v.union(v.literal('available'), v.literal('partially_available'), v.literal('unavailable')),
    summary: v.string(),
  }),
  validUntil: v.number(),
  fallback: v.object({
    available: v.boolean(), alternatives: v.array(v.object({
      routeRef: v.string(), when: v.literal('route_unavailable_before_confirmation'),
    })),
  }),
  uncertainty: v.array(v.literal('price_needs_confirmation')),
  comparison: customerRouteComparisonEvidence,
  steps: v.optional(v.array(v.object({
    step: v.number(), business: customerBusiness, after: v.array(v.number()),
  }))),
})
const customerRouteDecisionChange = v.union(
  v.object({
    kind: v.literal('route_result'),
    before: v.object({ routeCount: v.number(), results: v.array(customerRouteResultChange) }),
    after: v.object({ routeCount: v.number(), results: v.array(customerRouteResultChange) }),
  }),
  v.object({
    kind: v.literal('businesses'),
    before: v.array(v.object({ resultRef: v.string(), businesses: v.array(customerBusiness) })),
    after: v.array(v.object({ resultRef: v.string(), businesses: v.array(customerBusiness) })),
  }),
  v.object({
    kind: v.literal('step_shape'),
    before: v.array(v.object({ resultRef: v.string(), steps: v.number(), dependencies: v.number() })),
    after: v.array(v.object({ resultRef: v.string(), steps: v.number(), dependencies: v.number() })),
  }),
  v.object({
    kind: v.literal('maximum_cost'),
    before: v.array(v.object({ resultRef: v.string(), cost: customerRouteMaximumCost })),
    after: v.array(v.object({ resultRef: v.string(), cost: customerRouteMaximumCost })),
  }),
  v.object({
    kind: v.literal('data_use'),
    before: v.array(v.object({ resultRef: v.string(), recipients: v.array(customerRouteRecipient) })),
    after: v.array(v.object({ resultRef: v.string(), recipients: v.array(customerRouteRecipient) })),
  }),
  v.object({
    kind: v.literal('effects'),
    before: v.array(v.object({ resultRef: v.string(), effects: v.array(customerRouteEffect) })),
    after: v.array(v.object({ resultRef: v.string(), effects: v.array(customerRouteEffect) })),
  }),
  v.object({
    kind: v.literal('evidence'),
    before: v.array(v.object({ resultRef: v.string(), evidence: v.array(customerRouteEvidence) })),
    after: v.array(v.object({ resultRef: v.string(), evidence: v.array(customerRouteEvidence) })),
  }),
  v.object({
    kind: v.literal('uncertainty'),
    before: v.array(v.object({
      resultRef: v.string(), uncertainty: v.array(v.literal('price_needs_confirmation')),
    })),
    after: v.array(v.object({
      resultRef: v.string(), uncertainty: v.array(v.literal('price_needs_confirmation')),
    })),
  }),
  v.object({
    kind: v.literal('expiry'),
    before: v.array(v.object({ resultRef: v.string(), validUntil: v.number() })),
    after: v.array(v.object({ resultRef: v.string(), validUntil: v.number() })),
  }),
  v.object({
    kind: v.literal('fallback'),
    before: v.array(v.object({ resultRef: v.string(), alternatives: v.array(customerRouteResult) })),
    after: v.array(v.object({ resultRef: v.string(), alternatives: v.array(customerRouteResult) })),
  }),
  v.object({
    kind: v.literal('recovery'),
    before: v.array(v.object({ resultRef: v.string(), steps: v.array(customerRouteRecovery) })),
    after: v.array(v.object({ resultRef: v.string(), steps: v.array(customerRouteRecovery) })),
  }),
  v.object({
    kind: v.literal('cancellation'),
    before: v.array(v.object({
      resultRef: v.string(), cancellation: v.object({
        kind: v.union(v.literal('available'), v.literal('partially_available'), v.literal('unavailable')),
        summary: v.string(),
      }),
    })),
    after: v.array(v.object({
      resultRef: v.string(), cancellation: v.object({
        kind: v.union(v.literal('available'), v.literal('partially_available'), v.literal('unavailable')),
        summary: v.string(),
      }),
    })),
  }),
)
const customerRouteDecision = v.object({
  generationRef: v.string(), requestRevision: v.number(),
  outcome: v.object({
    kind: v.union(v.literal('routes_available'), v.literal('routes_expired')),
    routeCount: v.number(), summary: v.string(),
  }),
  routes: v.array(customerRoute),
  comparison: v.union(
    v.object({ kind: v.literal('single'), summary: v.string() }),
    v.object({
      kind: v.literal('recommended'), summary: v.string(), routeRef: v.string(),
      objective: v.literal('lowest_maximum_price'), evidenceRef: v.string(),
      commercialInfluence: v.union(v.literal('none'), v.literal('disclosed')),
      reasons: v.array(v.string()), tradeoffs: v.array(v.string()),
    }),
    v.object({
      kind: v.literal('unranked'),
      reason: v.union(
        v.literal('customer_preference_absent'), v.literal('tie'), v.literal('commercial_influence'),
        v.literal('stale_evidence'), v.literal('comparison_evidence_missing'),
      ),
      summary: v.string(),
    }),
    v.object({
      kind: v.literal('incomparable'), summary: v.string(),
      groups: v.array(v.object({ outcomeRef: v.string(), routeRefs: v.array(v.string()) })),
    }),
  ),
  actions: v.object({
    review: v.object({
      kind: v.literal('inspect_current_option'), createsAuthority: v.literal(false),
      startsWork: v.literal(false), summary: v.string(),
    }),
    confirm: v.object({
      kind: v.literal('confirm_current_option'), createsAuthority: v.literal(true),
      startsWork: v.literal(false), summary: v.string(),
    }),
    start: v.object({
      kind: v.literal('start_confirmed_option'), availableAfter: v.literal('confirmation'),
      startsWork: v.literal(true), summary: v.string(),
    }),
    change: v.object({
      kind: v.literal('revise_request'), createsAuthority: v.literal(false), startsWork: v.literal(false),
      preservesRequest: v.literal(true), summary: v.string(),
    }),
    decline: v.object({
      kind: v.literal('leave_unconfirmed'), createsAuthority: v.literal(false), startsWork: v.literal(false),
      preservesRequest: v.literal(true), summary: v.string(),
    }),
  }),
  changes: v.union(
    v.object({ kind: v.literal('initial') }),
    v.object({ kind: v.literal('unchanged'), previousGenerationRef: v.string() }),
    v.object({
      kind: v.literal('changed'), previousGenerationRef: v.string(), items: v.array(customerRouteDecisionChange),
    }),
  ),
  nextBoundary: v.object({ kind: v.literal('confirmation'), authorityCreated: v.literal(false) }),
})
const customerRouteConfirmation = v.object({
  confirmationRef: v.string(), generationRef: v.string(), requestRevision: v.number(),
  confirmedAt: v.number(), validUntil: v.number(), route: customerRoute,
})
const customerView = v.object({
  kind: v.literal('request'), requestRef: v.string(), revision: v.number(),
  routeGenerationRef: v.optional(v.string()),
  state: v.union(
    v.literal('needs_information'), v.literal('ready_to_compare'), v.literal('routes_ready'), v.literal('route_confirmed'), v.literal('in_progress'), v.literal('preparing_options'),
    v.literal('options_ready'), v.literal('no_options'), v.literal('needs_authorization'),
    v.literal('unsupported'), v.literal('needs_attention'),
    v.literal('outcome_unknown'), v.literal('completed'), v.literal('failed'), v.literal('cancelled'),
  ),
  summary: v.string(),
  nextAction: v.union(
    v.literal('provide_information'), v.literal('prepare_options'), v.literal('inspect_routes'), v.literal('inspect_confirmation'), v.literal('wait'),
    v.literal('inspect_options'), v.literal('revise_request'), v.literal('review_disclosure'), v.literal('retry'),
    v.literal('none'),
  ),
  missingFields: v.array(v.object({ field: v.string(), label: v.string(), explanation: v.string() })),
  criteria: v.array(v.object({
    label: v.string(), value: v.any(), // runtime-validated JsonValue boundary
    basis: v.union(v.literal('customer_provided'), v.literal('extracted_from_request')),
    impact: v.literal('eligibility_and_comparison'),
  })),
  disclosureReview: v.optional(v.object({
    purpose: v.string(), maximumRecipients: v.number(),
    categories: v.array(v.object({
      label: v.string(), classification: v.union(
        v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential'),
      ),
    })),
  })),
  preparationRef: v.optional(v.string()),
  clarification: v.optional(v.union(
    v.object({ kind: v.literal('intent_direction'), prompt: v.string(), answerKind: v.literal('natural_language') }),
    v.object({ kind: v.literal('contract_fact'), requirementKey: v.string(), prompt: v.string(), answerKind: v.literal('typed_value') }),
  )),
  options: v.array(customerOption),
  optionSet: v.optional(customerOptionSet),
  preparedAction: v.optional(customerPreparedAction),
  action: v.optional(v.object({
    state: v.union(v.literal('unknown'), v.literal('completed'), v.literal('failed')),
    resolution: v.union(
      v.literal('awaiting_evidence'), v.literal('provider_result'), v.literal('reconciled'), v.literal('not_sent'),
    ),
    automaticRetry: v.literal(false), result: v.optional(v.any()), observedAt: v.number(), // runtime-validated JsonValue boundary
  })),
  progress: v.optional(v.object({
    completed: v.number(), total: v.number(),
    current: v.object({
      step: v.number(),
      state: v.union(
        v.literal('queued'), v.literal('contacting'), v.literal('awaiting_result'),
        v.literal('validating_result'), v.literal('needs_attention'),
      ),
    }),
  })),
  activity: v.optional(v.object({
    actor: v.literal('ae_for_customer'),
    certainty: v.union(
      v.literal('pending'), v.literal('unknown'), v.literal('confirmed'),
      v.literal('failed'), v.literal('cancelled'),
    ),
    updatedAt: v.number(),
    nextCheckAt: v.optional(v.number()),
    retry: v.union(v.literal('not_needed'), v.literal('blocked_until_reconciled'), v.literal('manual_after_failure')),
    cancellation: v.union(
      v.literal('available_before_next_step'), v.literal('too_late_or_unsupported'), v.literal('complete'),
    ),
    safeNextAction: v.union(
      v.literal('check_progress'), v.literal('wait_for_evidence'), v.literal('review_result'),
      v.literal('revise_request'), v.literal('none'),
    ),
  })),
  decision: v.optional(customerRouteDecision),
  confirmation: v.optional(customerRouteConfirmation),
})
const conflict = v.object({
  kind: v.literal('conflict'), requestRef: v.string(),
  reason: v.union(
    v.literal('revision_changed'), v.literal('options_changed'),
    v.literal('identity_changed'), v.literal('idempotency_key_reused'),
  ),
})
const refusedReason = v.union(
  v.literal('authentication_required'), v.literal('request_not_found'),
  v.literal('interpreter_unavailable'), v.literal('capabilities_unavailable'),
)
const actionResult = v.union(customerView, conflict, v.object({ kind: v.literal('refused'), reason: refusedReason }))
type ActionResult = Infer<typeof actionResult>
export const submit = action({
  args: {
    compilationKey: v.string(), requestId: v.string(), expectedRevision: v.optional(v.number()),
    delegatedAgentId: v.string(), customerJob: v.string(),
    routing: v.object({
      networkId: v.string(), currency: v.optional(v.string()), maximumSpendMinor: v.optional(v.number()),
      optimizeFor: v.optional(v.union(v.literal('cost'), v.literal('latency'))),
    }),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    if (args.expectedRevision !== undefined && args.expectedRevision !== 0) return {
      kind: 'conflict', requestRef: args.requestId, reason: 'revision_changed',
    }
    const command = {
      compilationKey: args.compilationKey,
      requestId: args.requestId,
      ...(args.expectedRevision === undefined ? {} : { expectedRevision: args.expectedRevision }),
      delegatedAgentId: args.delegatedAgentId,
      customerJob: args.customerJob,
      routing: args.routing,
    }
    const caller = await resolveRequestCaller(ctx, 'submit', command, args.serviceAuth, args.delegatedAgentId)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    return await interpretCompileCommit(ctx, {
      commandKey: namespacedKey(caller.principalId, 'submit', args.requestId, args.compilationKey),
      commandDigest: canonicalDigest(command),
      requestId: args.requestId,
      expectedRevision: args.expectedRevision ?? 0,
      expectedRouteGeneration: 0,
      principalId: caller.principalId,
      delegatedAgentId: caller.delegatedAgentId,
      intent: args.customerJob,
      networkId: args.routing.networkId,
      priorFacts: [],
    })
  },
})

export const refine = action({
  args: {
    requestRef: v.string(), expectedRevision: v.number(), idempotencyKey: v.string(), message: v.string(),
    mode: v.optional(v.union(v.literal('append'), v.literal('replace'))),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const caller = await resolveRequestCaller(ctx, 'refine', {
      requestRef: args.requestRef, expectedRevision: args.expectedRevision,
      idempotencyKey: args.idempotencyKey, message: args.message,
      ...(args.mode === undefined ? {} : { mode: args.mode }),
    }, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    const current = await loadCurrent(ctx, args.requestRef)
    if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== caller.principalId) {
      return { kind: 'refused', reason: 'request_not_found' }
    }
    const recoveryBlock = await recoverUnresolvedEgress(ctx, current.aggregate)
    if (recoveryBlock !== undefined) return recoveryBlock
    if (current.aggregate.snapshot.revision !== args.expectedRevision) return {
      kind: 'conflict', requestRef: args.requestRef, reason: 'revision_changed',
    }
    const mode = args.mode ?? 'append'
    const intent = mode === 'replace'
      ? args.message.trim()
      : `${current.aggregate.snapshot.intent.trim()}\n${args.message.trim()}`
    const expectedRouteGeneration = await loadCurrentRouteGenerationNumber(ctx, current)
    if (expectedRouteGeneration === undefined) return writableView(projectNeedsAttention({
      requestRef: args.requestRef, revision: args.expectedRevision,
      summary: 'AE could not verify the current options. Try this request again.',
    }))
    return await interpretCompileCommit(ctx, {
      commandKey: namespacedKey(caller.principalId, 'refine', args.requestRef, args.idempotencyKey),
      commandDigest: canonicalDigest({
        requestRef: args.requestRef, expectedRevision: args.expectedRevision,
        idempotencyKey: args.idempotencyKey, message: args.message,
        ...(args.mode === undefined ? {} : { mode }),
      }),
      requestId: args.requestRef,
      expectedRevision: args.expectedRevision,
      expectedRouteGeneration,
      principalId: caller.principalId,
      delegatedAgentId: current.aggregate.snapshot.delegatedAgentId,
      intent,
      networkId: current.aggregate.snapshot.networkId,
      priorFacts: current.aggregate.snapshot.facts,
      replaceCustomerRequestLiteral: true,
    })
  },
})

export const provideFacts = action({
  args: {
    requestRef: v.string(), expectedRevision: v.number(), idempotencyKey: v.string(),
    requirementKey: v.string(), value: v.any(), // runtime-validated JsonValue boundary
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const caller = await resolveRequestCaller(ctx, 'facts', {
      requestRef: args.requestRef, expectedRevision: args.expectedRevision,
      idempotencyKey: args.idempotencyKey, requirementKey: args.requirementKey, value: args.value,
    }, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    const current = await loadCurrent(ctx, args.requestRef)
    if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== caller.principalId) {
      return { kind: 'refused', reason: 'request_not_found' }
    }
    const recoveryBlock = await recoverUnresolvedEgress(ctx, current.aggregate)
    if (recoveryBlock !== undefined) return recoveryBlock
    if (current.aggregate.snapshot.revision !== args.expectedRevision) return {
      kind: 'conflict', requestRef: args.requestRef, reason: 'revision_changed',
    }
    const requirement = current.aggregate.evaluation.nextRequirement
    if (requirement?.kind !== 'contract_fact' || requirement.requirementKey !== args.requirementKey) {
      return writableView(projectNeedsAttention({
        requestRef: args.requestRef, revision: args.expectedRevision,
        summary: 'Answer the current question before continuing.',
      }))
    }
    const graph = await loadRequestGraph(ctx, current.aggregate.snapshot.networkId)
    if (graph.kind !== 'available') return { kind: 'refused', reason: 'capabilities_unavailable' }
    if (graph.registrySnapshotDigest !== current.aggregate.evaluation.registrySnapshotDigest) {
      return writableView(projectNeedsAttention({
        requestRef: args.requestRef, revision: args.expectedRevision,
        summary: 'The available options changed. Review the request again before answering.',
      }))
    }
    const answerFacts = bindRequirementAnswer(requirement, args.value, graph.models, args.expectedRevision + 1)
    if (answerFacts === undefined) return writableView(projectNeedsAttention({
      requestRef: args.requestRef, revision: args.expectedRevision,
      summary: 'That answer does not match the requested information.',
    }))
    const selections = current.aggregate.plan.actions.flatMap((action) => {
      const model = graph.models.find((candidate) => sameCapabilityContractRef(candidate.contractRef, action.contractRef))
      if (model === undefined || model.selectionKey !== action.selectionKey || model.semanticDigest !== action.semanticDigest) return []
      return [{
        selectionKey: model.selectionKey,
        contractRef: model.contractRef,
        facts: answerFacts.filter((fact) => fact.selectionKey === model.selectionKey
          && sameCapabilityContractRef(fact.contractRef, model.contractRef)),
      }]
    })
    const proposal: CustomerRequestSemanticProposal = { kind: 'capability_candidates', selections }
    const expectedRouteGeneration = await loadCurrentRouteGenerationNumber(ctx, current)
    if (expectedRouteGeneration === undefined) return writableView(projectNeedsAttention({
      requestRef: args.requestRef, revision: args.expectedRevision,
      summary: 'AE could not verify the current options. Try this request again.',
    }))
    return await compileCommit(ctx, {
      commandKey: namespacedKey(caller.principalId, 'facts', args.requestRef, args.idempotencyKey),
      commandDigest: canonicalDigest({
        requestRef: args.requestRef, expectedRevision: args.expectedRevision,
        idempotencyKey: args.idempotencyKey, requirementKey: args.requirementKey, value: args.value,
      }),
      requestId: args.requestRef,
      expectedRevision: args.expectedRevision,
      expectedRouteGeneration,
      principalId: caller.principalId,
      delegatedAgentId: current.aggregate.snapshot.delegatedAgentId,
      intent: current.aggregate.snapshot.intent,
      networkId: current.aggregate.snapshot.networkId,
      priorFacts: rebindStoredFacts(current.aggregate.snapshot.facts, graph.models),
      proposal,
      interpreterId: 'customer:requirement-answer',
      graph,
    })
  },
})

export const resume = action({
  args: { requestRef: v.string(), serviceAuth: v.optional(serviceAssertion) },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const caller = await resolveRequestCaller(ctx, 'resume', { requestRef: args.requestRef }, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    const current = await loadCurrent(ctx, args.requestRef)
    if (current.kind === 'needs_attention') return writableView(projectNeedsAttention({
      requestRef: args.requestRef, revision: 0,
      summary: 'This earlier request used a retired contract format. Start a new request to continue.',
    }))
    if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== caller.principalId) {
      return { kind: 'refused', reason: 'request_not_found' }
    }
    const currentRun = await ctx.runQuery(internal.customerRequestRouteExecution.getCurrent, {
      requestId: args.requestRef,
    })
    if (currentRun.kind === 'found') return projectStoredRouteRun(current.aggregate, currentRun.run)
    const currentMandate = await ctx.runQuery(internal.customerRequestRouteMandate.getCurrentForPrincipal, {
      requestId: args.requestRef, principalId: caller.principalId,
    })
    if (currentMandate.kind === 'active') {
      const preview = await projectCurrentRoutePlans(ctx, current.aggregate)
      if (preview.kind === 'request' && preview.decision !== undefined) {
        const route = preview.decision.routes.find(({ routeRef }) => (
          routeRef === customerRouteRef(
            currentMandate.mandate.route.generationRef,
            currentMandate.mandate.route.routePlanId,
          )
        ))
        if (route !== undefined) return projectConfirmedRoute(current.aggregate, route, currentMandate.mandate)
      }
    }
    if (current.aggregate.outcome !== 'plan_ready') {
      return projectStoredAggregate(current.aggregate, undefined)
    }
    if (current.routeGenerationRef !== undefined) {
      const routeReadback: Readonly<
        | { kind: 'found'; routeGeneration: StoredRouteGeneration }
        | { kind: 'not_found' }
      > = await ctx.runQuery(internal.customerRequestV2.getCurrentRoutePlanGeneration, {
        requestId: current.aggregate.snapshot.requestId,
      })
      if (routeReadback.kind !== 'found') return writableView(projectNeedsAttention({
        requestRef: args.requestRef, revision: current.aggregate.snapshot.revision,
        summary: 'AE could not verify the current options. Try this request again.',
      }))
      const generationRepresentsStoredPlan = storedGenerationRepresentsAggregate(
        routeReadback.routeGeneration, current.aggregate,
      )
      if (!generationRepresentsStoredPlan) return await projectCurrentRoutePlans(ctx, current.aggregate)
    }
    const recoveryBlock = await recoverUnresolvedEgress(ctx, current.aggregate)
    if (recoveryBlock !== undefined) return recoveryBlock
    if (current.aggregate.plan.actions.length === 1) {
      const action = current.aggregate.plan.actions[0]
      if (action !== undefined) {
        const preparation: PreparationResumeResult = await ctx.runQuery(
          internal.customerRequestV2Preparation.resume,
          {
            requestId: args.requestRef,
            requestRevision: current.aggregate.snapshot.revision,
            actionId: action.actionId,
            principalId: caller.principalId,
          },
        )
        if (preparation.kind === 'current') {
          if (preparation.preparation.kind === 'ready_for_routing') {
            const egress: {
              operationCount: number
              states: Array<{ operationRef: string; state: 'allocated' | 'dispatching' | 'released' | 'not_released' | 'uncertain' }>
            } = await ctx.runQuery(
              internal.customerRequestV2PreparationEgressState.status,
              { preparationRef: preparation.preparation.preparationRef, principalId: caller.principalId },
            )
            if (egress.operationCount > 0) {
              const resumed: {
                kind: 'completed' | 'needs_attention'
                states?: Array<{
                  operationRef: string; state: 'released' | 'not_released' | 'uncertain' | 'in_flight'
                }>
              } = await ctx.runAction(internal.customerRequestV2PreparationEgress.resume, {
                preparationRef: preparation.preparation.preparationRef, principalId: caller.principalId,
              })
              if (resumed.kind !== 'completed' || resumed.states === undefined) return writableView(projectNeedsAttention({
                requestRef: current.aggregate.snapshot.requestId, revision: current.aggregate.snapshot.revision,
                summary: 'The registered options or permission changed. Review this request again.',
              }))
              if (resumed.states.some(({ state }) => state === 'uncertain' || state === 'in_flight')) {
                return projectEgressCustomerState(current.aggregate, preparation.preparation, resumed.states)
              }
              return await resolvePreparedAction(ctx, current.aggregate, preparation.preparation)
            }
          }
          return projectStoredPreparation(current.aggregate, preparation.preparation)
        }
        if (preparation.kind === 'stale') return writableView(projectNeedsAttention({
          requestRef: args.requestRef,
          revision: current.aggregate.snapshot.revision,
          summary: 'The registered options changed. Review this request again.',
        }))
      }
    }
    return current.routeGenerationRef === undefined
      ? projectStoredAggregate(current.aggregate, undefined)
      : await projectCurrentRoutePlans(ctx, current.aggregate)
  },
})

export const compare = action({
  args: {
    requestRef: v.string(), revision: v.number(), idempotencyKey: v.string(),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => await prepareCurrentAction(ctx, args),
})

export const confirmRoute = action({
  args: {
    requestRef: v.string(), revision: v.number(), routeRef: v.string(), idempotencyKey: v.string(),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const command = {
      requestRef: args.requestRef, revision: args.revision,
      routeRef: args.routeRef, idempotencyKey: args.idempotencyKey,
    }
    const caller = await resolveRequestCaller(ctx, 'confirm', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    const current = await loadCurrent(ctx, args.requestRef)
    if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== caller.principalId) {
      return { kind: 'refused', reason: 'request_not_found' }
    }
    if (current.aggregate.snapshot.revision !== args.revision) return {
      kind: 'conflict', requestRef: args.requestRef, reason: 'revision_changed',
    }
    const preview = await projectCurrentRoutePlans(ctx, current.aggregate)
    if (preview.kind !== 'request' || preview.decision === undefined
      || preview.decision.outcome.kind !== 'routes_available') return preview
    const route = preview.decision.routes.find(({ routeRef }) => routeRef === args.routeRef)
    if (route === undefined) return preview
    if (route.availability !== 'current') return preview
    if (route.maximumTotalCost.kind !== 'known') return preview
    const routeReadback: Readonly<
      | { kind: 'found'; routeGeneration: StoredRouteGeneration }
      | { kind: 'not_found' }
    > = await ctx.runQuery(internal.customerRequestV2.getCurrentRoutePlanGeneration, {
      requestId: args.requestRef,
    })
    const selectedRoute = routeReadback.kind === 'found'
      ? routeReadback.routeGeneration.routes.find(({ routePlanId }) => (
          customerRouteRef(preview.decision?.generationRef ?? '', routePlanId) === args.routeRef
        ))
      : undefined
    if (selectedRoute === undefined) return await projectCurrentRoutePlans(ctx, current.aggregate)
    const result = await ctx.runMutation(internal.customerRequestRouteMandate.issue, {
      requestId: args.requestRef,
      expectedRequestRevision: args.revision,
      expectedGenerationRef: preview.decision.generationRef,
      selectedRoutePlanId: selectedRoute.routePlanId,
      maximumTotalSpend: {
        currency: route.maximumTotalCost.currency,
        amountMinor: route.maximumTotalCost.amountMinor,
      },
      expiresAt: route.validUntil,
      idempotencyKey: args.idempotencyKey,
      ...(args.serviceAuth === undefined ? {} : {
        serviceAuthorization: { command, assertion: args.serviceAuth },
      }),
    })
    if (result.kind === 'issued' || result.kind === 'replayed') {
      return projectConfirmedRoute(current.aggregate, route, result.mandate)
    }
    if (result.kind === 'conflict') {
      if (result.reason === 'command_changed') return {
        kind: 'conflict', requestRef: args.requestRef, reason: 'idempotency_key_reused',
      }
      if (result.reason === 'request_revision_changed') return {
        kind: 'conflict', requestRef: args.requestRef, reason: 'revision_changed',
      }
      if (result.reason === 'route_generation_changed') {
        return await projectCurrentRoutePlans(ctx, current.aggregate)
      }
      return { kind: 'conflict', requestRef: args.requestRef, reason: 'options_changed' }
    }
    return writableView(projectNeedsAttention({
      requestRef: args.requestRef, revision: args.revision,
      summary: result.reason === 'authentication_required'
        ? 'Sign in again before confirming this choice.'
        : 'This choice can no longer be confirmed. Review the current options.',
    }))
  },
})

export const runRoute = action({
  args: {
    requestRef: v.string(), idempotencyKey: v.string(),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const command = { requestRef: args.requestRef, idempotencyKey: args.idempotencyKey }
    const caller = await resolveRequestCaller(ctx, 'run', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    const current = await loadCurrent(ctx, args.requestRef)
    if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== caller.principalId) {
      return { kind: 'refused', reason: 'request_not_found' }
    }
    const result = await ctx.runMutation(internal.customerRequestRouteExecution.startOrResume, {
      requestId: args.requestRef,
      principalId: caller.principalId,
      idempotencyKey: args.idempotencyKey,
    })
    if (result.kind === 'conflict') return {
      kind: 'conflict', requestRef: args.requestRef, reason: 'idempotency_key_reused',
    }
    if (result.kind === 'refused') return writableView(projectNeedsAttention({
      requestRef: args.requestRef,
      revision: current.aggregate.snapshot.revision,
      summary: result.reason === 'confirmation_expired'
        ? 'This choice expired before it could start. Review the current options.'
        : 'This choice cannot start yet. Review the current request.',
      criteria: projectCustomerCriteria(current.aggregate.evaluation.criteria),
    }))
    return projectStoredRouteRun(current.aggregate, result.run)
  },
})

export const cancelRoute = action({
  args: {
    requestRef: v.string(), idempotencyKey: v.string(),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const command = { requestRef: args.requestRef, idempotencyKey: args.idempotencyKey }
    const caller = await resolveRequestCaller(ctx, 'cancel', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    const current = await loadCurrent(ctx, args.requestRef)
    if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== caller.principalId) {
      return { kind: 'refused', reason: 'request_not_found' }
    }
    const result = await ctx.runMutation(internal.customerRequestRouteExecution.cancelCurrent, {
      requestId: args.requestRef,
      principalId: caller.principalId,
      idempotencyKey: args.idempotencyKey,
    })
    if (result.kind === 'conflict') return {
      kind: 'conflict', requestRef: args.requestRef, reason: 'idempotency_key_reused',
    }
    if (result.kind === 'refused') return writableView(projectNeedsAttention({
      requestRef: args.requestRef,
      revision: current.aggregate.snapshot.revision,
      summary: 'There is no active request to stop.',
    }))
    return projectStoredRouteRun(current.aggregate, result.run)
  },
})

const problemReceipt = v.object({
  kind: v.literal('problem_reported'), requestRef: v.string(), reportRef: v.string(),
  state: v.literal('received'), reportedAt: v.number(),
})
const problemActionResult = v.union(problemReceipt, conflict, v.object({ kind: v.literal('refused'), reason: refusedReason }))
type ProblemActionResult = Infer<typeof problemActionResult>

export const reportRouteProblem = action({
  args: {
    requestRef: v.string(), idempotencyKey: v.string(),
    category: v.union(
      v.literal('incorrect_result'), v.literal('unexpected_cost'), v.literal('privacy_concern'),
      v.literal('could_not_stop'), v.literal('other'),
    ),
    summary: v.string(), serviceAuth: v.optional(serviceAssertion),
  },
  returns: problemActionResult,
  handler: async (ctx, args): Promise<ProblemActionResult> => {
    const command = {
      requestRef: args.requestRef, idempotencyKey: args.idempotencyKey,
      category: args.category, summary: args.summary,
    }
    const caller = await resolveRequestCaller(ctx, 'report', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused' as const, reason: 'authentication_required' as const }
    const current = await loadCurrent(ctx, args.requestRef)
    if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== caller.principalId) {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    const result: Readonly<
      | { kind: 'reported'; reportRef: string; reportedAt: number }
      | { kind: 'replayed'; reportRef: string; reportedAt: number }
      | { kind: 'conflict' }
      | { kind: 'refused' }
    > = await ctx.runMutation(internal.customerRequestRouteExecution.reportProblem, {
      requestId: args.requestRef, idempotencyKey: args.idempotencyKey,
      category: args.category, summary: args.summary, principalId: caller.principalId,
    })
    if (result.kind === 'conflict') return {
      kind: 'conflict' as const, requestRef: args.requestRef, reason: 'idempotency_key_reused' as const,
    }
    if (result.kind === 'refused') return { kind: 'refused' as const, reason: 'request_not_found' as const }
    return {
      kind: 'problem_reported' as const, requestRef: args.requestRef,
      reportRef: result.reportRef, state: 'received' as const, reportedAt: result.reportedAt,
    }
  },
})

const evidenceExport = v.object({
  kind: v.literal('evidence'), requestRef: v.string(),
  state: v.union(
    v.literal('queued'), v.literal('running'), v.literal('outcome_unknown'),
    v.literal('completed'), v.literal('failed'), v.literal('cancelled'),
  ),
  generatedAt: v.number(),
  steps: v.array(v.object({
    step: v.number(),
    state: v.union(
      v.literal('queued'), v.literal('contacting'), v.literal('awaiting_result'), v.literal('completed'),
      v.literal('failed'), v.literal('outcome_unknown'), v.literal('cancelled'),
    ),
    observedAt: v.number(), evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
  })),
  result: v.optional(v.any()), // runtime-validated JsonValue boundary
})
const evidenceActionResult = v.union(evidenceExport, v.object({ kind: v.literal('refused'), reason: refusedReason }))
type EvidenceActionResult = Infer<typeof evidenceActionResult>

export const exportRouteEvidence = action({
  args: { requestRef: v.string(), serviceAuth: v.optional(serviceAssertion) },
  returns: evidenceActionResult,
  handler: async (ctx, args): Promise<EvidenceActionResult> => {
    const command = { requestRef: args.requestRef }
    const caller = await resolveRequestCaller(ctx, 'evidence', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused' as const, reason: 'authentication_required' as const }
    const current = await loadCurrent(ctx, args.requestRef)
    if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== caller.principalId) {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    const exported: Readonly<
      | { kind: 'none' }
      | {
          kind: 'found'
          state: 'queued' | 'running' | 'outcome_unknown' | 'completed' | 'failed' | 'cancelled'
          generatedAt: number
          resultJson?: string
          steps: readonly Readonly<{
            step: number
            state: 'queued' | 'contacting' | 'awaiting_result' | 'completed' | 'failed' | 'outcome_unknown' | 'cancelled'
            observedAt: number
            evidence: readonly Readonly<{ receiptRef: string; label: string }>[]
          }>[]
        }
    > = await ctx.runQuery(internal.customerRequestRouteExecution.exportCustomerEvidence, {
      requestId: args.requestRef, principalId: caller.principalId,
    })
    if (exported.kind === 'none') return { kind: 'refused' as const, reason: 'request_not_found' as const }
    const result = exported.resultJson === undefined ? undefined : parseCustomerRouteResult(exported.resultJson)
    return {
      kind: 'evidence' as const, requestRef: args.requestRef, state: exported.state,
      generatedAt: exported.generatedAt, steps: exported.steps.map((step) => ({
        ...step, evidence: step.evidence.map((item) => ({ ...item })),
      })),
      ...(result === undefined ? {} : { result }),
    }
  },
})

export const authorizePreparation = action({
  args: {
    requestRef: v.string(), revision: v.number(), preparationRef: v.string(), idempotencyKey: v.string(),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { kind: 'refused', reason: 'authentication_required' }
    const current = await loadCurrent(ctx, args.requestRef)
    if (current.kind === 'needs_attention') return writableView(projectNeedsAttention({
      requestRef: args.requestRef, revision: 0,
      summary: 'This earlier request used a retired contract format. Start a new request to continue.',
    }))
    if (current.kind !== 'current') return { kind: 'refused', reason: 'request_not_found' }
    const requestPrincipalId = current.aggregate.snapshot.principalId
    const ownsDirectRequest = requestPrincipalId === identity.tokenIdentifier
    const agentPrincipal = ownsDirectRequest ? null : await ctx.runQuery(internal.customerRequestPrincipals.getAgentPrincipal, {
      principalId: requestPrincipalId,
    })
    if (!ownsDirectRequest && agentPrincipal?.ownerId !== identity.subject) {
      return { kind: 'refused', reason: 'request_not_found' }
    }
    if (current.aggregate.snapshot.revision !== args.revision) return {
      kind: 'conflict', requestRef: args.requestRef, reason: 'revision_changed',
    }
    if (current.aggregate.plan.actions.length !== 1 || current.aggregate.plan.actions[0] === undefined) {
      return writableView(projectNeedsAttention({
        requestRef: args.requestRef, revision: args.revision,
        summary: 'This request needs an action choice before AE can prepare it.',
      }))
    }
    const command = {
      requestRef: args.requestRef, revision: args.revision,
      preparationRef: args.preparationRef, idempotencyKey: args.idempotencyKey,
    }
    const now = Date.now()
    const result: PreparationMutationResult = await ctx.runMutation(internal.customerRequestV2Preparation.prepare, {
      commandKey: namespacedKey(requestPrincipalId, 'authorize', args.requestRef, args.idempotencyKey),
      commandDigest: canonicalDigest(command),
      principalId: requestPrincipalId,
      requestId: args.requestRef,
      expectedRevision: args.revision,
      actionId: current.aggregate.plan.actions[0].actionId,
      preparationRef: args.preparationRef,
      approvalActor: {
        kind: 'clerk_owner', requestPrincipalId, ownerId: identity.subject,
        credentialId: identity.tokenIdentifier,
        authenticationEvidenceRef: `clerk-identity:${canonicalDigest({
          issuer: identity.issuer, subject: identity.subject, tokenIdentifier: identity.tokenIdentifier,
        })}`,
        approvedAt: now,
      },
      now,
    })
    if ((result.kind === 'stored' || result.kind === 'replayed') && result.preparation.kind === 'ready_for_routing') {
      return await runPreparationEgress(ctx, current.aggregate, result.preparation, {
        principalId: requestPrincipalId,
        commandKey: namespacedKey(requestPrincipalId, 'egress', args.requestRef, args.idempotencyKey),
        commandDigest: canonicalDigest({
          requestRef: args.requestRef, revision: args.revision,
          preparationRef: result.preparation.preparationRef, idempotencyKey: args.idempotencyKey,
        }),
      })
    }
    return preparationResultView(current.aggregate, result, args.requestRef, args.revision)
  },
})

async function interpretCompileCommit(ctx: ActionCtx, input: Readonly<{
  commandKey: string
  commandDigest: string
  requestId: string
  expectedRevision: number
  expectedRouteGeneration: number
  principalId: string
  delegatedAgentId: string
  intent: string
  networkId: string
  priorFacts: StoredAggregate['snapshot']['facts']
  replaceCustomerRequestLiteral?: boolean
}>): Promise<ActionResult> {
  const replay = await replayCommittedCommand(ctx, input)
  if (replay !== undefined) return replay
  const graph = await loadRequestGraph(ctx, input.networkId)
  if (graph.kind !== 'available') return { kind: 'refused', reason: 'capabilities_unavailable' }
  const interpreter = createConfiguredRequestInterpreter()
  if (interpreter === undefined) return { kind: 'refused', reason: 'interpreter_unavailable' }
  const priorFacts = rebindStoredFacts(input.priorFacts, graph.models).filter((fact) => (
    input.replaceCustomerRequestLiteral !== true
    || fact.source.kind !== 'customer'
    || !fact.source.assertionRef.startsWith('assertion:customer-request-literal:')
  ))
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let proposal: CustomerRequestSemanticProposal
    try {
      proposal = await interpreter.propose({ customerJob: input.intent, capabilities: graph.descriptors })
    } catch (error) {
      console.error('customer_request_semantic_interpretation_failed', interpreterFailureCode(error))
      return { kind: 'refused', reason: 'interpreter_unavailable' }
    }
    const compilationInput: CompileCommitInput = {
      ...input, priorFacts, proposal, interpreterId: interpreter.interpreterId, graph,
    }
    const preview = compileProposal(compilationInput)
    if (preview.kind === 'compiled') {
      return await compileCommit(ctx, { ...compilationInput, compiledResult: preview })
    }
    if (preview.reason === 'capability_graph_invalid') break
  }
  return writableView(projectNeedsAttention({
    requestRef: input.requestId, revision: input.expectedRevision,
    summary: 'The request could not be interpreted safely.',
  }))
}

type CompileCommitInput = Readonly<{
  commandKey: string
  commandDigest: string
  requestId: string
  expectedRevision: number
  expectedRouteGeneration: number
  principalId: string
  delegatedAgentId: string
  intent: string
  networkId: string
  priorFacts: readonly RequestFact[]
  proposal: CustomerRequestSemanticProposal
  interpreterId: string
  graph: RequestGraph
  compiledResult?: Extract<CompileCustomerRequestResult, { kind: 'compiled' }>
}>

function compileProposal(input: CompileCommitInput) {
  return compileCustomerRequest({
    requestId: input.requestId,
    expectedRevision: input.expectedRevision,
    expectedRouteGeneration: input.expectedRouteGeneration,
    principalId: input.principalId,
    delegatedAgentId: input.delegatedAgentId,
    intent: input.intent,
    networkId: input.networkId,
    priorFacts: input.priorFacts,
    proposal: input.proposal,
    interpreterId: input.interpreterId,
    bindings: input.graph.bindings,
    models: input.graph.models,
    now: Date.now(),
  })
}

async function compileCommit(ctx: ActionCtx, input: CompileCommitInput): Promise<ActionResult> {
  const replay = await replayCommittedCommand(ctx, input)
  if (replay !== undefined) return replay
  const compiled = input.compiledResult === undefined
    ? compileProposal(input)
    : input.compiledResult
  if (compiled.kind === 'refused') return writableView(projectNeedsAttention({
    requestRef: input.requestId,
    revision: input.expectedRevision,
    summary: compiled.reason === 'capability_graph_invalid'
      ? 'The registered options changed. Try this request again.'
      : 'The request could not be interpreted safely.',
  }))
  const result: CommitResult = await ctx.runMutation(internal.customerRequestV2.commitAggregate, {
    commandKey: input.commandKey,
    commandDigest: input.commandDigest,
    expectedRevision: input.expectedRevision,
    expectedRouteGeneration: input.expectedRouteGeneration,
    aggregate: writableCustomerRequestV2Aggregate(compiled.aggregate),
    ...(compiled.routeGeneration === undefined
      ? {}
      : { routeGeneration: writableCustomerRequestRoutePlanGeneration(compiled.routeGeneration) }),
  })
  if (result.kind === 'revision_conflict' || result.kind === 'route_generation_conflict') return {
    kind: 'conflict', requestRef: input.requestId, reason: 'revision_changed',
  }
  if (result.kind === 'identity_conflict') return {
    kind: 'conflict', requestRef: input.requestId, reason: 'identity_changed',
  }
  if (result.kind === 'command_conflict') return {
    kind: 'conflict', requestRef: input.requestId, reason: 'idempotency_key_reused',
  }
  if (result.kind === 'aggregate_invalid') return writableView(projectNeedsAttention({
    requestRef: input.requestId, revision: input.expectedRevision,
    summary: 'The request changed before it could be recorded. Try again.',
  }))
  if (result.kind === 'context_stale') return writableView(projectNeedsAttention({
    requestRef: input.requestId, revision: input.expectedRevision,
    summary: 'The registered options changed. Try this request again.',
  }))
  return projectStoredAggregate(compiled.aggregate, compiled.routeGeneration?.generationRef)
}

async function replayCommittedCommand(ctx: ActionCtx, input: Readonly<{
  commandKey: string
  commandDigest: string
  requestId: string
  principalId: string
}>): Promise<ActionResult | undefined> {
  const replay: CommandReplayResult = await ctx.runQuery(internal.customerRequestV2.getCommandReplay, {
    commandKey: input.commandKey,
    commandDigest: input.commandDigest,
    principalId: input.principalId,
    requestId: input.requestId,
  })
  if (replay.kind === 'not_found') return undefined
  if (replay.kind === 'conflict') return {
    kind: 'conflict', requestRef: input.requestId, reason: 'idempotency_key_reused',
  }
  if (replay.kind === 'needs_attention') return writableView(projectNeedsAttention({
    requestRef: input.requestId,
    revision: 0,
    summary: 'This earlier request used a retired format. Start a new request to continue.',
  }))
  return projectStoredAggregate(replay.aggregate, replay.routeGenerationRef)
}

type EligibleSupply = Readonly<{
  offering: Readonly<{
    offeringId: string; businessId: string; networkId: string; capabilityId: string; version: number; contractDigest: string
    presentation: Readonly<{
      label: string; summary: string
      price: RegisteredSupplyPrice
      commercialRelationship: Readonly<{
        kind: 'none' | 'direct' | 'affiliate' | 'ownership'
        summary: string
        influencesEligibility: boolean
        influencesInclusion: boolean
        influencesOrder: boolean
        evidenceRefs: readonly string[]
      }>
    }>; registrationHash: string
  }>
  publication?: Readonly<{ publicationRef: string; revision: number; readinessValidUntil: number }>
  binding: Readonly<{
    bindingId: string; offeringId: string; networkId: string; capabilityId: string; version: number; contractDigest: string
    registrationHash: string
    cancellation: Readonly<{
      kind: 'unsupported' | 'adapter_managed'
      evidenceRefs: readonly string[]
    }>
  }>
}>
type EligibleSupplyResult = Readonly<
  | { kind: 'available'; supplies: readonly EligibleSupply[] }
  | { kind: 'unavailable'; reason: string }
>
type RequestGraph = Readonly<{
  kind: 'available'
  models: readonly CapabilityDecisionModel[]
  descriptors: ReturnType<typeof bindCustomerCapabilityDescriptor>[]
  bindings: readonly RegisteredEvaluationBinding[]
  registrySnapshotDigest: string
}>

async function loadRequestGraph(ctx: ActionCtx, networkId: string): Promise<RequestGraph | Readonly<{ kind: 'unavailable' }>> {
  const supply: EligibleSupplyResult = await ctx.runQuery(internal.capabilitySupply.listEligible, { networkId, limit: 64 })
  if (supply.kind !== 'available' || supply.supplies.length === 0) return { kind: 'unavailable' }
  const modelsByRef = new Map<string, CapabilityDecisionModel>()
  const descriptors: ReturnType<typeof bindCustomerCapabilityDescriptor>[] = []
  let descriptorBytes = 0
  const bindings = []
  for (const item of supply.supplies) {
    const contractRef = {
      capabilityId: item.binding.capabilityId,
      version: item.binding.version,
      contractDigest: item.binding.contractDigest,
    }
    const key = exactRefKey(contractRef)
    let model = modelsByRef.get(key)
    if (model === undefined) {
      const stored: ExactContractResult = await ctx.runQuery(
        internal.capabilityContractDocuments.getActiveExactInternal, contractRef,
      )
      if (stored.kind !== 'found') return { kind: 'unavailable' }
      const decoded = encodeCapabilityContractDocumentJson(stored.documentJson)
      if (!sameCapabilityContractRef(decoded.contract.ref, contractRef)) return { kind: 'unavailable' }
      model = openCapabilityDecisionModel(decoded.contract)
      modelsByRef.set(key, model)
      let descriptor: ReturnType<typeof bindCustomerCapabilityDescriptor>
      try {
        descriptor = bindCustomerCapabilityDescriptor({
          contractRef: model.contractRef,
          selectionKey: model.selectionKey,
          name: decoded.contract.name,
          description: decoded.contract.description,
          inputs: model.inputs,
          valueSchemas: projectCapabilityInputValueSchemas(
            decoded.contract.inputSchema,
            model.inputs,
            MAX_CONTRACT_PROJECTED_INPUT_SCHEMA_BYTES,
          ),
          evidence: model.evidence.map(({ label, purpose, schemaIdentity, semanticIdentity, guaranteed }) => ({
            label, purpose, schemaIdentity, guaranteed,
            ...(semanticIdentity === undefined ? {} : { semanticIdentity }),
          })),
        })
      } catch {
        return { kind: 'unavailable' }
      }
      descriptorBytes += new TextEncoder().encode(JSON.stringify(descriptor)).byteLength
      if (descriptorBytes > MAX_INTERPRETER_DESCRIPTOR_BYTES) return { kind: 'unavailable' }
      descriptors.push(descriptor)
    }
    bindings.push({
      businessId: String(item.offering.businessId),
      offeringId: item.offering.offeringId,
      bindingId: item.binding.bindingId,
      contractRef: model.contractRef,
      offeringRegistrationHash: item.offering.registrationHash,
      bindingRegistrationHash: item.binding.registrationHash,
      price: item.offering.presentation.price,
      commercialRelationship: {
        ...item.offering.presentation.commercialRelationship,
        evidenceRefs: [...item.offering.presentation.commercialRelationship.evidenceRefs],
      },
      cancellation: {
        ...item.binding.cancellation,
        evidenceRefs: [...item.binding.cancellation.evidenceRefs],
      },
      ...(item.publication === undefined ? {} : {
        publicationRef: item.publication.publicationRef,
        publicationRevision: item.publication.revision,
        readinessValidUntil: item.publication.readinessValidUntil,
      }),
    })
  }
  const registrySnapshotDigest = requestRegistrySnapshotDigest(bindings)
  return {
    kind: 'available',
    models: [...modelsByRef.values()],
    descriptors,
    bindings,
    registrySnapshotDigest,
  }
}

type ExactContractResult = Readonly<
  | { kind: 'found'; ref: CapabilityContractRef; documentJson: string; registeredAt: number }
  | { kind: 'unavailable'; reason: string }
>
type CommitResult = Readonly<
  | { kind: 'stored' | 'replayed'; requestId: string; revision: number }
  | {
      kind: 'revision_conflict' | 'route_generation_conflict' | 'identity_conflict'
        | 'command_conflict' | 'aggregate_invalid' | 'context_stale'
    }
>
type CommandReplayResult = Readonly<
  | { kind: 'not_found' }
  | { kind: 'conflict' }
  | { kind: 'needs_attention'; requestId: string; reason: 'historical_request_resubmit_required'; resumable: false }
  | { kind: 'replayed'; aggregate: StoredAggregate; routeGenerationRef?: string }
>
type GenerationRefreshResult = Readonly<
  | { kind: 'unchanged'; routeGeneration: StoredRouteGeneration }
  | { kind: 'superseded'; routeGeneration: StoredRouteGeneration }
  | { kind: 'needs_information'; aggregate: StoredAggregate }
  | { kind: 'unsupported'; aggregate: StoredAggregate }
  | {
      kind: 'retryable'
      reason: 'current_supply_unavailable' | 'interpreter_unavailable' | 'interpretation_unusable' | 'context_changed'
    }
  | {
      kind: 'request_conflict' | 'route_generation_conflict' | 'identity_conflict'
        | 'command_conflict' | 'candidate_invalid' | 'context_stale'
    }
>
type GenerationRefreshReplayResult = GenerationRefreshResult | Readonly<{ kind: 'not_found' }>
type StoredAggregateResult = Readonly<
  | {
      kind: 'current'; aggregate: StoredAggregate
      routeGenerationNumber: number; routeGenerationRef?: string; currentDecisionCommandKey?: string
    }
  | { kind: 'needs_attention'; requestId: string; reason: 'historical_request_resubmit_required'; resumable: false }
  | { kind: 'not_found' }
>
type StoredAggregate = Infer<typeof customerRequestV2AggregateValue>
type StoredRouteGeneration = Infer<typeof routePlanGenerationV2Value>
type RoutePlanProjectionMaterial = Readonly<
  | {
      kind: 'found'
      current: StoredRouteGeneration
      previous?: StoredRouteGeneration
      businesses: readonly Readonly<{ businessId: string; name: string }>[]
      capabilities: readonly Readonly<{
        capabilityId: string; version: number; contractDigest: string
        name: string; description: string; resultLabels: readonly string[]
      }>[]
    }
  | { kind: 'not_found' }
>
type StoredPreparation = Infer<typeof durableActionPreparationV2Value>
type PreparationMutationResult = Readonly<
  | { kind: 'stored' | 'replayed'; preparation: StoredPreparation }
  | { kind: 'conflict'; reason: 'revision_changed' | 'idempotency_key_reused' }
  | { kind: 'needs_attention'; reason: 'capability_graph_changed' | 'historical_request_resubmit_required' | 'preparation_recipient_unsupported' }
  | { kind: 'refused'; reason: 'request_not_found' | 'action_not_found' | 'request_not_ready' | 'authority_reference_invalid' | 'authority_invalid' }
>
type PreparationResumeResult = Readonly<
  | { kind: 'current'; preparation: StoredPreparation }
  | { kind: 'not_found' | 'stale' }
>
type PreparedActionMutationResult = Readonly<
  | { kind: 'prepared'; preparedAction: Infer<typeof preparedActionV2Value> }
  | { kind: 'not_prepared'; reason: Infer<typeof preparedActionRecoveryReasonV2Value>; recoveryRef: string }
  | { kind: 'conflict'; reason: 'idempotency_key_reused' | 'prepared_action_material_changed' }
>
function storedGenerationRepresentsAggregate(
  generation: StoredRouteGeneration,
  aggregate: StoredAggregate,
): boolean {
  if (generation.decisionSnapshot !== undefined) {
    return generation.decisionSnapshot.requestSnapshotDigest === aggregate.snapshot.snapshotDigest
      && generation.decisionSnapshot.factsDigest === aggregate.evaluation.factsDigest
      && generation.decisionSnapshot.evaluationDigest === aggregate.evaluation.evaluationDigest
      && generation.decisionSnapshot.planRevisionId === aggregate.plan.planRevisionId
      && generation.decisionSnapshot.planDigest === aggregate.plan.planDigest
  }
  // Historical generations predate decision snapshots. They were atomically
  // validated against this immutable plan at commit, so exact compiler lineage
  // and creation time identify the only aggregate they can safely prepare.
  return generation.createdAt === aggregate.plan.createdAt
    && generation.registrySnapshotDigest === aggregate.plan.registrySnapshotDigest
    && generation.compiler.compilerVersion === aggregate.plan.compilerVersion
    && generation.compiler.interpreterId === aggregate.plan.interpreterId
    && generation.compiler.proposalDigest === aggregate.plan.proposalDigest
}

async function projectCurrentRoutePlans(
  ctx: ActionCtx,
  aggregate: StoredAggregate,
): Promise<ActionResult> {
  let material: RoutePlanProjectionMaterial
  try {
    material = await ctx.runQuery(internal.customerRequestV2.getCurrentRoutePlanProjectionMaterial, {
      requestId: aggregate.snapshot.requestId,
    })
  } catch (error) {
    console.error('customer_request_route_plan_projection_failed', error)
    return writableView(projectNeedsAttention({
      requestRef: aggregate.snapshot.requestId,
      revision: aggregate.snapshot.revision,
      summary: 'AE could not verify the current ways forward. Try this request again.',
    }))
  }
  if (material.kind !== 'found'
    || material.current.requestId !== aggregate.snapshot.requestId
    || material.current.requestRevision !== aggregate.snapshot.revision) {
    return writableView(projectNeedsAttention({
      requestRef: aggregate.snapshot.requestId,
      revision: aggregate.snapshot.revision,
      summary: 'AE could not verify the current ways forward. Try this request again.',
    }))
  }
  let decision: ReturnType<typeof projectCustomerRoutePlanDecision>
  try {
    decision = projectCustomerRoutePlanDecision({
      current: material.current,
      ...(material.previous === undefined ? {} : { previous: material.previous }),
      businessNames: Object.fromEntries(material.businesses.map(({ businessId, name }) => [businessId, name])),
      capabilitySemantics: Object.fromEntries(material.capabilities.map((capability) => [
        capabilitySemanticsKey(capability),
        {
          name: capability.name,
          description: capability.description,
          resultLabels: capability.resultLabels,
        },
      ])),
      now: Date.now(),
    })
  } catch (error) {
    console.error('customer_request_route_plan_projection_invalid', error)
    return writableView(projectNeedsAttention({
      requestRef: aggregate.snapshot.requestId,
      revision: aggregate.snapshot.revision,
      summary: 'AE could not verify the current ways forward. Try this request again.',
    }))
  }
  return writableView(projectRoutePlansReady({
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    summary: aggregate.snapshot.intent,
    decision,
    criteria: projectCustomerCriteria(material.current.decisionSnapshot?.criteria ?? aggregate.evaluation.criteria),
  }))
}

async function loadCurrent(ctx: ActionCtx, requestId: string): Promise<StoredAggregateResult> {
  return await ctx.runQuery(internal.customerRequestV2.getCurrentAggregate, { requestId })
}

async function loadCurrentRouteGenerationNumber(
  ctx: ActionCtx,
  current: Extract<StoredAggregateResult, { kind: 'current' }>,
): Promise<number | undefined> {
  if (current.routeGenerationRef === undefined) return current.routeGenerationNumber
  const result: Readonly<
    | { kind: 'found'; routeGeneration: StoredRouteGeneration }
    | { kind: 'not_found' }
  > = await ctx.runQuery(internal.customerRequestV2.getRoutePlanGeneration, {
    requestId: current.aggregate.snapshot.requestId,
    generationRef: current.routeGenerationRef,
  })
  return result.kind === 'found' ? result.routeGeneration.generation : undefined
}

async function prepareCurrentAction(
  ctx: ActionCtx,
  args: Readonly<{
    requestRef: string
    revision: number
    idempotencyKey: string
    serviceAuth?: Infer<typeof serviceAssertion>
  }>,
): Promise<ActionResult> {
  const command = {
    requestRef: args.requestRef,
    revision: args.revision,
    idempotencyKey: args.idempotencyKey,
  }
  const caller = await resolveRequestCaller(ctx, 'compare', command, args.serviceAuth)
  if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
  const current = await loadCurrent(ctx, args.requestRef)
  if (current.kind === 'needs_attention') return writableView(projectNeedsAttention({
    requestRef: args.requestRef, revision: 0,
    summary: 'This earlier request used a retired contract format. Start a new request to continue.',
  }))
  if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== caller.principalId) {
    return { kind: 'refused', reason: 'request_not_found' }
  }
  if (current.aggregate.snapshot.revision !== args.revision) return {
    kind: 'conflict', requestRef: args.requestRef, reason: 'revision_changed',
  }
  if (current.routeGenerationRef !== undefined) {
    const routeReadback: Readonly<
      | { kind: 'found'; routeGeneration: StoredRouteGeneration }
      | { kind: 'not_found' }
    > = await ctx.runQuery(internal.customerRequestV2.getCurrentRoutePlanGeneration, {
      requestId: current.aggregate.snapshot.requestId,
    })
    if (routeReadback.kind !== 'found') return writableView(projectNeedsAttention({
      requestRef: args.requestRef,
      revision: args.revision,
      summary: 'AE could not verify the current options. Try this request again.',
    }))
    const routes = routeReadback.routeGeneration.routes
    const graph = await loadRequestGraph(ctx, current.aggregate.snapshot.networkId)
    const routesAreCurrent = graph.kind === 'available'
      && graph.registrySnapshotDigest === routeReadback.routeGeneration.registrySnapshotDigest
      && routes.every((route) => route.expiresAt > Date.now())
      && routes.every((route) => route.steps.every((step) => graph.bindings.some((binding) => (
        binding.businessId === step.businessId
        && binding.offeringId === step.offeringId
        && binding.bindingId === step.bindingId
        && sameCapabilityContractRef(binding.contractRef, step.contractRef)
        && binding.offeringRegistrationHash === step.offeringRegistrationHash
        && binding.bindingRegistrationHash === step.bindingRegistrationHash
        && binding.publicationRef === step.publicationRef
        && binding.publicationRevision === step.publicationRevision
        && binding.readinessValidUntil !== undefined
        && binding.readinessValidUntil >= route.expiresAt
        && binding.price !== undefined
        && canonicalDigest(binding.price) === canonicalDigest(step.price)
      ))))
    if (!routesAreCurrent) {
      if (graph.kind !== 'available') return await persistRetryableRouteRefresh(
        ctx, args, caller, current, routeReadback.routeGeneration, 'current_supply_unavailable',
      )
      const transientBindingUnavailable = routes.some((route) => route.steps.some((step) => (
        graph.bindings.some((binding) => (
          binding.businessId === step.businessId
          && binding.offeringId === step.offeringId
          && binding.bindingId === step.bindingId
          && sameCapabilityContractRef(binding.contractRef, step.contractRef)
          && (binding.publicationRef === undefined
            || binding.readinessValidUntil === undefined
            || binding.readinessValidUntil <= Date.now())
        ))
      )))
      if (transientBindingUnavailable) return await persistRetryableRouteRefresh(
        ctx, args, caller, current, routeReadback.routeGeneration, 'current_supply_unavailable',
      )
      return await refreshCurrentRouteGeneration(
        ctx, args, caller, current, graph, routeReadback.routeGeneration,
      )
    }
    return await projectCurrentRoutePlans(ctx, current.aggregate)
  } else if (current.aggregate.plan.actions.length !== 1 || current.aggregate.plan.actions[0] === undefined) {
    return writableView(projectNeedsAttention({
      requestRef: args.requestRef,
      revision: args.revision,
      summary: 'AE could not verify the current options. Try this request again.',
    }))
  }
  const action = current.aggregate.plan.actions[0]
  const result: PreparationMutationResult = await ctx.runMutation(internal.customerRequestV2Preparation.prepare, {
    commandKey: namespacedKey(caller.principalId, 'compare', args.requestRef, args.idempotencyKey),
    commandDigest: canonicalDigest(command),
    principalId: caller.principalId,
    requestId: args.requestRef,
    expectedRevision: args.revision,
    actionId: action.actionId,
    now: Date.now(),
  })
  if ((result.kind === 'stored' || result.kind === 'replayed') && result.preparation.kind === 'ready_for_routing') {
    return await runPreparationEgress(ctx, current.aggregate, result.preparation, {
      principalId: caller.principalId,
      commandKey: namespacedKey(caller.principalId, 'egress', args.requestRef, args.idempotencyKey),
      commandDigest: canonicalDigest({
        requestRef: args.requestRef, revision: args.revision,
        preparationRef: result.preparation.preparationRef, idempotencyKey: args.idempotencyKey,
      }),
    })
  }
  return preparationResultView(current.aggregate, result, args.requestRef, args.revision)
}

async function refreshCurrentRouteGeneration(
  ctx: ActionCtx,
  args: Readonly<{ requestRef: string; revision: number; idempotencyKey: string }>,
  caller: Readonly<{ principalId: string }>,
  current: Extract<StoredAggregateResult, { kind: 'current' }>,
  graph: RequestGraph,
  currentGeneration: StoredRouteGeneration,
): Promise<ActionResult> {
  const { commandKey, commandDigest } = routeRefreshCommand(args, caller.principalId)
  const replay: GenerationRefreshReplayResult = await ctx.runQuery(
    internal.customerRequestV2.getRoutePlanGenerationRefreshReplay,
    { commandKey, commandDigest, principalId: caller.principalId, requestId: args.requestRef },
  )
  if (replay.kind !== 'not_found') return await generationRefreshResultView(ctx, current.aggregate, replay)

  const interpreter = createConfiguredRequestInterpreter()
  if (interpreter === undefined) return await persistRetryableRouteRefresh(
    ctx, args, caller, current, currentGeneration, 'interpreter_unavailable',
  )
  const priorFacts = rebindStoredFacts(current.aggregate.snapshot.facts, graph.models)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let proposal: CustomerRequestSemanticProposal
    try {
      proposal = await interpreter.propose({
        customerJob: current.aggregate.snapshot.intent,
        capabilities: graph.descriptors,
      })
    } catch (error) {
      console.error('customer_request_route_refresh_interpretation_failed', interpreterFailureCode(error))
      return await persistRetryableRouteRefresh(
        ctx, args, caller, current, currentGeneration, 'interpreter_unavailable',
      )
    }
    const compiled = compileCustomerRequest({
      requestId: args.requestRef,
      expectedRevision: args.revision - 1,
      expectedRouteGeneration: currentGeneration.generation,
      principalId: caller.principalId,
      delegatedAgentId: current.aggregate.snapshot.delegatedAgentId,
      intent: current.aggregate.snapshot.intent,
      networkId: current.aggregate.snapshot.networkId,
      priorFacts,
      proposal,
      interpreterId: interpreter.interpreterId,
      bindings: graph.bindings,
      models: graph.models,
      now: Date.now(),
    })
    if (compiled.kind === 'refused') {
      if (compiled.reason === 'capability_graph_invalid') continue
      return await persistRetryableRouteRefresh(
        ctx, args, caller, current, currentGeneration, 'interpretation_unusable',
      )
    }
    const result: GenerationRefreshResult = await ctx.runMutation(
      internal.customerRequestV2.refreshRoutePlanGeneration,
      {
        commandKey, commandDigest, principalId: caller.principalId, requestId: args.requestRef,
        expectedRequestRevision: args.revision,
        expectedGeneration: currentGeneration.generation,
        expectedGenerationRef: currentGeneration.generationRef,
        ...(current.currentDecisionCommandKey === undefined
          ? {}
          : { expectedDecisionCommandKey: current.currentDecisionCommandKey }),
        candidateAggregate: writableCustomerRequestV2Aggregate(compiled.aggregate),
        ...(compiled.routeGeneration === undefined ? {} : {
          candidateRouteGeneration: writableCustomerRequestRoutePlanGeneration(compiled.routeGeneration),
        }),
      },
    )
    return result.kind === 'context_stale'
      ? await persistRetryableRouteRefresh(
          ctx, args, caller, current, currentGeneration, 'context_changed',
        )
      : await generationRefreshResultView(ctx, current.aggregate, result)
  }
  return await persistRetryableRouteRefresh(
    ctx, args, caller, current, currentGeneration, 'context_changed',
  )
}

function createConfiguredRequestInterpreter() {
  const apiKey = env.OPENROUTER_API_KEY?.trim()
  if (apiKey === undefined || apiKey.length === 0) return undefined
  const modelName = env.AE_CUSTOMER_REQUEST_MODEL?.trim() || 'openai/gpt-5-mini'
  return createJsonCustomerRequestSemanticInterpreter({
    interpreterId: `openrouter:${modelName}`,
    transport: createOpenRouterCustomerRequestSemanticTransport({
      apiKey, model: modelName,
      ...(env.AE_SITE_URL?.trim() ? { siteUrl: env.AE_SITE_URL.trim() } : {}),
    }),
    timeoutMs: 45_000,
    maximumPayloadBytes: MAX_INTERPRETER_DESCRIPTOR_BYTES,
    maximumResponseBytes: 64_000,
  })
}

function interpreterFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown'
  if (error.name === 'AbortError') return 'aborted'
  return error.message.startsWith('customer_request_') ? error.message : 'unknown'
}

type RouteRefreshRetryReason = Extract<GenerationRefreshResult, { kind: 'retryable' }>['reason']

function routeRefreshCommand(
  args: Readonly<{ requestRef: string; revision: number; idempotencyKey: string }>,
  principalId: string,
) {
  return {
    commandKey: namespacedKey(principalId, 'route-refresh', args.requestRef, args.idempotencyKey),
    commandDigest: canonicalDigest({
      requestRef: args.requestRef, revision: args.revision, idempotencyKey: args.idempotencyKey,
    }),
  }
}

async function persistRetryableRouteRefresh(
  ctx: ActionCtx,
  args: Readonly<{ requestRef: string; revision: number; idempotencyKey: string }>,
  caller: Readonly<{ principalId: string }>,
  current: Extract<StoredAggregateResult, { kind: 'current' }>,
  currentGeneration: StoredRouteGeneration,
  reason: RouteRefreshRetryReason,
): Promise<ActionResult> {
  const result: GenerationRefreshResult = await ctx.runMutation(
    internal.customerRequestV2.recordRoutePlanGenerationRetry,
    {
      ...routeRefreshCommand(args, caller.principalId),
      principalId: caller.principalId, requestId: args.requestRef,
      expectedRequestRevision: args.revision,
      expectedGeneration: currentGeneration.generation,
      expectedGenerationRef: currentGeneration.generationRef,
      ...(current.currentDecisionCommandKey === undefined
        ? {}
        : { expectedDecisionCommandKey: current.currentDecisionCommandKey }),
      reason, recordedAt: Date.now(),
    },
  )
  return await generationRefreshResultView(ctx, current.aggregate, result)
}

async function generationRefreshResultView(
  ctx: ActionCtx,
  current: StoredAggregate,
  result: Exclude<GenerationRefreshReplayResult, { kind: 'not_found' }>,
): Promise<ActionResult> {
  if (result.kind === 'command_conflict') return {
    kind: 'conflict', requestRef: current.snapshot.requestId, reason: 'idempotency_key_reused',
  }
  if (result.kind === 'request_conflict') return {
    kind: 'conflict', requestRef: current.snapshot.requestId, reason: 'revision_changed',
  }
  if (result.kind === 'route_generation_conflict') return {
    kind: 'conflict', requestRef: current.snapshot.requestId, reason: 'options_changed',
  }
  if (result.kind === 'identity_conflict') return {
    kind: 'conflict', requestRef: current.snapshot.requestId, reason: 'identity_changed',
  }
  if (result.kind === 'candidate_invalid' || result.kind === 'context_stale') {
    return writableView(projectNeedsAttention({
      requestRef: current.snapshot.requestId, revision: current.snapshot.revision,
      summary: 'AE could not refresh the available options. Try again.',
    }))
  }
  if (result.kind === 'retryable') return writableView(projectNeedsAttention({
    requestRef: current.snapshot.requestId, revision: current.snapshot.revision,
    summary: 'AE could not refresh the available options. Try again.',
  }))
  if (result.kind === 'needs_information' || result.kind === 'unsupported') {
    if (result.kind === 'needs_information') return projectStoredAggregate(result.aggregate, undefined)
    return writableView({
      kind: 'request', requestRef: result.aggregate.snapshot.requestId,
      revision: result.aggregate.snapshot.revision, state: 'unsupported',
      summary: 'No business on AE can support this request right now.',
      nextAction: 'revise_request', missingFields: [],
      criteria: projectCustomerCriteria(result.aggregate.evaluation.criteria),
      options: [],
    })
  }
  if (result.kind !== 'unchanged' && result.kind !== 'superseded') {
    return writableView(projectNeedsAttention({
      requestRef: current.snapshot.requestId, revision: current.snapshot.revision,
      summary: 'AE could not refresh the available options. Try again.',
    }))
  }
  return await projectCurrentRoutePlans(ctx, current)
}

async function runPreparationEgress(
  ctx: ActionCtx,
  aggregate: StoredAggregate,
  preparation: Extract<StoredPreparation, { kind: 'ready_for_routing' }>,
  command: Readonly<{ principalId: string; commandKey: string; commandDigest: string }>,
): Promise<ActionResult> {
  const result: {
    kind: 'completed' | 'conflict' | 'needs_attention'
    states?: Array<{ operationRef: string; state: 'released' | 'not_released' | 'uncertain' | 'in_flight' }>
  } = await ctx.runAction(
    internal.customerRequestV2PreparationEgress.run,
    {
      ...command, preparationRef: preparation.preparationRef, now: Date.now(),
    },
  )
  if (result.kind !== 'completed') return writableView(projectNeedsAttention({
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    summary: result.kind === 'conflict'
      ? 'This preparation command was already used for a different request.'
      : 'The registered options or permission changed. Review this request again.',
  }))
  if (result.states === undefined) return writableView(projectNeedsAttention({
    requestRef: aggregate.snapshot.requestId, revision: aggregate.snapshot.revision,
    summary: 'AE could not read the business response state. Review this request again.',
  }))
  if (result.states.some(({ state }) => state === 'uncertain' || state === 'in_flight')) {
    return projectEgressCustomerState(aggregate, preparation, result.states)
  }
  return await resolvePreparedAction(ctx, aggregate, preparation)
}

async function resolvePreparedAction(
  ctx: ActionCtx,
  aggregate: StoredAggregate,
  preparation: Extract<StoredPreparation, { kind: 'ready_for_routing' }>,
): Promise<ActionResult> {
  const preparationMaterialDigest: string = await ctx.runQuery(
    internal.customerRequestV2PreparedAction.preparationMaterialDigest,
    { preparationRef: preparation.preparationRef, principalId: aggregate.snapshot.principalId },
  )
  const commandMaterial = {
    requestRef: aggregate.snapshot.requestId,
    requestRevision: aggregate.snapshot.revision,
    preparationRef: preparation.preparationRef,
    preparationDigest: preparation.preparationDigest,
    preparationMaterialDigest,
  }
  const result: PreparedActionMutationResult = await ctx.runMutation(
    internal.customerRequestV2PreparedAction.prepare,
    {
      commandKey: namespacedKey(
        aggregate.snapshot.principalId, 'prepared-action', aggregate.snapshot.requestId,
        `${preparation.preparationRef}:${preparationMaterialDigest}`,
      ),
      commandDigest: canonicalDigest(commandMaterial),
      principalId: aggregate.snapshot.principalId,
      preparationRef: preparation.preparationRef,
      preparationMaterialDigest,
      now: Date.now(),
    },
  )
  if (result.kind === 'prepared') {
    return projectPreparedAction(aggregate, preparation, result.preparedAction)
  }
  const base = {
    kind: 'request' as const,
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    missingFields: [],
    criteria: [...projectCustomerCriteria(aggregate.evaluation.criteria)],
    preparationRef: preparation.preparationRef,
    options: [],
  }
  if (result.kind === 'conflict') return writableView({
    ...base,
    state: 'needs_attention', nextAction: 'revise_request',
    summary: 'A business option changed after it was prepared. Review the request before choosing.',
  })
  if (result.reason === 'options_pending' || result.reason === 'disclosure_uncertain') return writableView({
    ...base,
    state: 'preparing_options', nextAction: 'wait',
    summary: 'AE is still checking the businesses already contacted. It will not send the request again.',
  })
  if (result.reason === 'selection_required' || result.reason === 'comparison_unavailable'
    || result.reason === 'commercial_influence_blocks_selection') return writableView({
    ...base,
    state: 'needs_attention', nextAction: 'revise_request',
    summary: 'AE received options but cannot choose between them from the customer’s stated priorities.',
  })
  return writableView({
    ...base,
    state: 'needs_attention', nextAction: 'revise_request',
    summary: preparedActionFailureSummary(result.reason),
  })
}

function preparedActionFailureSummary(
  reason: Extract<PreparedActionMutationResult, { kind: 'not_prepared' }>['reason'],
): string {
  switch (reason) {
    case 'options_pending':
    case 'disclosure_uncertain':
      return 'AE is still checking the businesses already contacted. It will not send the request again.'
    case 'disclosure_not_released':
      return 'AE did not send the request to the business. Check the business connection before trying again.'
    case 'provider_response_invalid':
      return 'A business returned an incomplete response. Refresh the request before choosing.'
    case 'provider_echo_mismatch':
      return 'A business response did not match the option requested. Refresh before choosing.'
    case 'provider_assertion_expired':
      return 'The available business options expired. Refresh the request before choosing.'
    case 'provider_evidence_invalid':
      return 'A business response was missing the evidence needed to compare it safely.'
    case 'commercial_terms_unavailable':
      return 'A business option was missing the price or terms needed for a safe choice.'
    case 'selection_required':
    case 'comparison_unavailable':
    case 'commercial_influence_blocks_selection':
      return 'AE received options but cannot choose between them from the customer’s stated priorities.'
    case 'prepared_action_too_large':
      return 'The business responses were too large to compare safely. Narrow the request and try again.'
    case 'capability_authority_changed':
    case 'capability_graph_changed':
      return 'The available business options changed. Refresh the request before choosing.'
    default: {
      const exhaustive: never = reason
      return exhaustive
    }
  }
}

function projectPreparedAction(
  aggregate: StoredAggregate,
  preparation: Extract<StoredPreparation, { kind: 'ready_for_routing' }>,
  action: Infer<typeof preparedActionV2Value>,
): ActionResult {
  return {
    kind: 'request',
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    state: 'options_ready',
    summary: `${action.business.name} can provide ${action.offering.label}.`,
    nextAction: 'inspect_options',
    missingFields: [],
    criteria: [...projectCustomerCriteria(aggregate.evaluation.criteria)],
    preparationRef: preparation.preparationRef,
    options: [],
    preparedAction: {
      actionRef: action.preparedActionRef,
      businessName: action.business.name,
      offeringLabel: action.offering.label,
      summary: action.offering.summary,
      price: {
        currency: action.price.currency,
        minimumAmountMinor: action.price.minimumAmountMinor,
        maximumAmountMinor: action.price.maximumAmountMinor,
      },
      materialTerms: action.materialTerms.map(({ label, value }) => ({ label, value })),
      cancellation: { kind: action.cancellation.kind === 'adapter_managed' ? 'available' : 'unsupported' },
      validUntil: action.expiresAt,
      selection: {
        basis: action.comparison.kind,
        alternativeCount: action.alternatives.length,
        unavailableCount: action.fallbacks.length,
        commercialInfluence: action.comparison.kind === 'lowest_maximum_price'
          ? action.comparison.commercialInfluence
          : action.commercialRelationship.kind === 'none' ? 'none' : 'disclosed',
      },
      dataUse: {
        categories: preparation.disclosureReview.categories.map(({ label, classification }) => ({ label, classification })),
        purposes: [...preparation.disclosureReview.purposes],
      },
      effects: preparation.disclosureReview.effectRequirements.map(({ class: effectClass, reversibility }) => ({
        class: effectClass, reversibility,
      })),
      alternatives: action.alternatives.map((alternative) => ({
        businessName: alternative.business.name,
        price: {
          currency: alternative.price.currency,
          minimumAmountMinor: alternative.price.minimumAmountMinor,
          maximumAmountMinor: alternative.price.maximumAmountMinor,
        },
        validUntil: alternative.expiresAt,
      })),
    },
  }
}

async function recoverUnresolvedEgress(
  ctx: ActionCtx,
  aggregate: StoredAggregate,
): Promise<ActionResult | undefined> {
  const recovered: {
    kind: 'completed' | 'needs_attention'
    states?: Array<{
      operationRef: string
      requestRevision: number
      state: 'released' | 'not_released' | 'uncertain' | 'in_flight'
    }>
    operations?: Array<{ operationRef: string; requestRevision: number }>
  } = await ctx.runAction(internal.customerRequestV2PreparationEgress.resumeRequest, {
    requestId: aggregate.snapshot.requestId, principalId: aggregate.snapshot.principalId,
  })
  const base = {
    kind: 'request' as const, requestRef: aggregate.snapshot.requestId, revision: aggregate.snapshot.revision,
    state: 'needs_attention' as const, missingFields: [],
    criteria: projectCustomerCriteria(aggregate.evaluation.criteria),
    options: [],
  }
  if (recovered.kind === 'needs_attention') return writableView({
    ...base, nextAction: 'wait',
    summary: 'AE cannot safely continue while checking an earlier business contact.',
  })
  const states = recovered.states ?? []
  if (states.some(({ state }) => state === 'uncertain' || state === 'in_flight')) return writableView({
    ...base, nextAction: 'wait',
    summary: 'AE is still checking whether a business received this request. It will not send it again while checking.',
  })
  if (states.some(({ requestRevision }) => requestRevision !== aggregate.snapshot.revision)) return writableView({
    ...base, nextAction: 'revise_request',
    summary: 'AE recovered an earlier business contact. Review the current request before continuing.',
  })
  return undefined
}

function projectEgressCustomerState(
  aggregate: StoredAggregate,
  preparation: Extract<StoredPreparation, { kind: 'ready_for_routing' }>,
  states: readonly Readonly<{ state: 'released' | 'not_released' | 'uncertain' | 'in_flight' }>[],
): ActionResult {
  const base = {
    kind: 'request', requestRef: aggregate.snapshot.requestId, revision: aggregate.snapshot.revision,
    missingFields: [], criteria: projectCustomerCriteria(aggregate.evaluation.criteria),
    preparationRef: preparation.preparationRef, options: [],
  } as const
  if (states.some(({ state }) => state === 'uncertain')) return writableView({
    ...base, state: 'needs_attention', nextAction: 'wait',
    summary: 'AE cannot yet confirm whether every business received the request. It will not send it again while checking.',
  })
  if (states.some(({ state }) => state === 'in_flight')) return writableView({
    ...base, state: 'preparing_options', nextAction: 'wait',
    summary: 'AE is waiting for businesses that are already processing the request.',
  })
  if (states.length > 0 && states.every(({ state }) => state === 'not_released')) return writableView({
    ...base, state: 'needs_attention', nextAction: 'revise_request',
    summary: 'No business received the request. Review the available businesses before trying another route.',
  })
  return writableView({ ...base, state: 'preparing_options', summary: aggregate.snapshot.intent, nextAction: 'wait' })
}

function preparationResultView(
  aggregate: StoredAggregate,
  result: PreparationMutationResult,
  requestRef: string,
  revision: number,
): ActionResult {
  if (result.kind === 'conflict') return {
    kind: 'conflict', requestRef,
    reason: result.reason === 'revision_changed' ? 'revision_changed' : 'idempotency_key_reused',
  }
  if (result.kind === 'needs_attention') return writableView(projectNeedsAttention({
    requestRef,
    revision,
    summary: result.reason === 'historical_request_resubmit_required'
      ? 'This earlier request used a retired contract format. Start a new request to continue.'
      : result.reason === 'preparation_recipient_unsupported'
        ? 'AE cannot safely compare these options before you choose which business may receive your information.'
      : 'The registered options changed. Review this request again.',
  }))
  if (result.kind === 'refused') {
    if (result.reason === 'request_not_found') return { kind: 'refused', reason: 'request_not_found' }
    return writableView(projectNeedsAttention({
      requestRef,
      revision,
      summary: result.reason === 'authority_reference_invalid' || result.reason === 'authority_invalid'
        ? 'That permission no longer matches this request. Review the disclosure again.'
        : 'This request cannot be prepared from its current action.',
    }))
  }
  return projectStoredPreparation(aggregate, result.preparation)
}

function projectStoredPreparation(aggregate: StoredAggregate, preparation: StoredPreparation): ActionResult {
  const criteria = projectCustomerCriteria(aggregate.evaluation.criteria)
  const base = {
    kind: 'request' as const,
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    summary: aggregate.snapshot.intent,
    criteria,
    preparationRef: preparation.preparationRef,
    options: [],
  }
  if (preparation.kind === 'needs_information') return writableView({
    ...base,
    state: 'needs_information',
    nextAction: 'provide_information',
    missingFields: preparation.missing.map((item) => ({
      field: item.inputKey,
      label: item.label,
      explanation: 'This answer is needed before AE can prepare matching options.',
    })),
  })
  const disclosureReview = {
    purpose: customerPurposeLabel(preparation.disclosureReview.purposes[0] ?? 'prepare_options'),
    maximumRecipients: preparation.disclosureReview.limits.maximumRecipients,
    categories: preparation.disclosureReview.categories.map(({ label, classification }) => ({ label, classification })),
  }
  if (preparation.kind === 'needs_authority') return writableView({
    ...base,
    state: 'needs_authorization',
    nextAction: 'review_disclosure',
    missingFields: [],
    disclosureReview,
  })
  return writableView({
    ...base,
    state: 'ready_to_compare',
    nextAction: 'prepare_options',
    missingFields: [],
    disclosureReview,
  })
}

function customerPurposeLabel(value: string): string {
  const words = value.replace(/[_-]+/g, ' ').trim()
  return `${words.at(0)?.toUpperCase() ?? ''}${words.slice(1)}`
}

function bindRequirementAnswer(
  requirement: Extract<StoredAggregate['evaluation']['nextRequirement'], { kind: 'contract_fact' }>,
  value: unknown,
  models: readonly CapabilityDecisionModel[],
  requestRevision: number,
): readonly RequestFact[] | undefined {
  if (!isBoundedJsonValue(value)) return undefined
  const facts: RequestFact[] = []
  for (const target of requirement.targets) {
    const model = models.find((candidate) => sameCapabilityContractRef(candidate.contractRef, target.contractRef))
    const semantic = model?.inputs.find((candidate) => candidate.key === target.inputKey
      && candidate.inputPointer === target.inputPointer && candidate.schemaIdentity === target.schemaIdentity)
    if (model === undefined || semantic === undefined || model.selectionKey !== target.selectionKey) return undefined
    const assessment = model.assessInput({
      contractRef: model.contractRef, selectionKey: model.selectionKey, stage: 'option_selection',
      facts: [{ input: semantic.key, inputPointer: semantic.inputPointer, value }],
    })
    if (assessment.kind === 'incompatible') return undefined
    facts.push({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      inputKey: semantic.key,
      inputPointer: semantic.inputPointer,
      schemaIdentity: semantic.schemaIdentity,
      value,
      source: {
        kind: 'customer',
        assertionRef: `assertion:${canonicalDigest({
          requirementKey: requirement.requirementKey, requestRevision, contractRef: model.contractRef,
          inputKey: semantic.key, value,
        })}`,
      },
    })
  }
  return facts
}

function rebindStoredFacts(
  stored: StoredAggregate['snapshot']['facts'], models: readonly CapabilityDecisionModel[],
): readonly RequestFact[] {
  return stored.flatMap((fact) => {
    const model = models.find((candidate) => sameCapabilityContractRef(candidate.contractRef, fact.contractRef))
    const semantic = model?.inputs.find((input) => input.key === fact.inputKey
      && input.inputPointer === fact.inputPointer && input.schemaIdentity === fact.schemaIdentity)
    if (model === undefined || semantic === undefined || model.selectionKey !== fact.selectionKey || !isBoundedJsonValue(fact.value)) return []
    return [{
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      inputKey: semantic.key,
      inputPointer: semantic.inputPointer,
      schemaIdentity: semantic.schemaIdentity,
      value: fact.value,
      source: fact.source,
    }]
  })
}

function projectStoredAggregate(
  aggregate: StoredAggregate | CustomerRequestV2Aggregate,
  routeGenerationRef?: string,
): ActionResult {
  return writableView(projectRequestEvaluation({
    snapshot: aggregate.snapshot,
    evaluation: aggregate.evaluation,
    outcome: aggregate.outcome,
    actionCount: aggregate.plan.actions.length,
    ...(routeGenerationRef === undefined ? {} : { routeGenerationRef }),
  }))
}

function projectConfirmedRoute(
  aggregate: StoredAggregate | CustomerRequestV2Aggregate,
  route: CustomerRoutePlan,
  mandate: Readonly<{
    mandateRef: string
    route: Readonly<{ generationRef: string }>
    request: Readonly<{ requestRevision: number }>
    issuedAt: number
    expiresAt: number
  }>,
): ActionResult {
  return writableView(projectRouteConfirmed({
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    criteria: projectCustomerCriteria(aggregate.evaluation.criteria),
    confirmation: {
      confirmationRef: `confirmation:${canonicalDigest({ authorityRef: mandate.mandateRef })}`,
      generationRef: mandate.route.generationRef,
      requestRevision: mandate.request.requestRevision,
      confirmedAt: mandate.issuedAt,
      validUntil: mandate.expiresAt,
      route,
    },
  }))
}

function projectStoredRouteRun(
  aggregate: StoredAggregate | CustomerRequestV2Aggregate,
  run: Readonly<{
    requestId: string
    requestRevision: number
    generationRef: string
    state: 'queued' | 'running' | 'outcome_unknown' | 'completed' | 'failed' | 'cancelled'
    totalSteps: number
    completedSteps: number
    currentPosition: number
    currentState: 'queued' | 'leased' | 'dispatched' | 'accepted' | 'succeeded' | 'failed' | 'outcome_unknown' | 'cancelled'
    resultJson?: string
    updatedAt: number
  }>,
): ActionResult {
  const criteria = projectCustomerCriteria(aggregate.evaluation.criteria)
  const result = run.resultJson === undefined ? undefined : parseCustomerRouteResult(run.resultJson)
  if (run.state === 'completed' && result !== undefined) {
    return writableView(projectCustomerActionStatus({
      requestRef: run.requestId,
      revision: run.requestRevision,
      criteria,
      status: {
        kind: 'completed', resolution: 'provider_result', result,
        resolvedAt: run.updatedAt, automaticRetry: false,
      },
    }))
  }
  if (run.state === 'outcome_unknown') return writableView(projectCustomerActionStatus({
    requestRef: run.requestId,
    revision: run.requestRevision,
    criteria,
    routeProgress: {
      completed: run.completedSteps, total: run.totalSteps, currentStep: run.currentPosition,
    },
    status: {
      kind: 'unknown', reason: 'provider_outcome_unconfirmed',
      observedAt: run.updatedAt, automaticRetry: false,
    },
  }))
  if (run.state === 'cancelled') return writableView(projectRouteCancelled({
    requestRef: run.requestId,
    revision: run.requestRevision,
    criteria,
    updatedAt: run.updatedAt,
  }))
  if (run.state === 'failed' && result !== undefined) {
    const providerReportedFailure = isProviderReportedRouteFailure(result)
    return writableView(projectCustomerActionStatus({
      requestRef: run.requestId,
      revision: run.requestRevision,
      criteria,
      routeProgress: {
        completed: run.completedSteps, total: run.totalSteps, currentStep: run.currentPosition,
      },
      status: {
        kind: 'failed', resolution: providerReportedFailure ? 'reconciled' : 'not_sent',
        result: providerReportedFailure ? result : { reason: 'business_contact_not_started' },
        resolvedAt: run.updatedAt, automaticRetry: false,
      },
    }))
  }
  if (run.state === 'failed') return writableView(projectNeedsAttention({
    requestRef: run.requestId, revision: run.requestRevision, criteria,
    summary: 'This request needs attention before it can continue.',
  }))
  return writableView(projectRouteProgress({
    requestRef: run.requestId,
    revision: run.requestRevision,
    generationRef: run.generationRef,
    completed: run.completedSteps,
    total: run.totalSteps,
    current: { step: run.currentPosition, state: customerProgressState(run.currentState) },
    updatedAt: run.updatedAt,
    cancellationAvailable: run.currentState === 'queued' || run.currentState === 'leased',
    criteria,
  }))
}

function isProviderReportedRouteFailure(result: JsonValue): boolean {
  return typeof result === 'object' && result !== null && 'reason' in result
    && result.reason === 'business_reported_failure'
}

function writableView(view: CustomerRequestView): Infer<typeof customerView> {
  const { disclosureReview, optionSet, clarification, preparedAction, action, progress, activity, decision, confirmation } = view
  return {
    kind: view.kind, requestRef: view.requestRef, revision: view.revision,
    ...(view.routeGenerationRef === undefined ? {} : { routeGenerationRef: view.routeGenerationRef }),
    state: view.state, summary: view.summary, nextAction: view.nextAction,
    missingFields: view.missingFields.map((field) => ({ ...field })),
    criteria: (view.criteria ?? []).map((criterion) => ({ ...criterion })),
    ...(view.preparationRef === undefined ? {} : { preparationRef: view.preparationRef }),
    ...(disclosureReview === undefined ? {} : {
      disclosureReview: {
        ...disclosureReview,
        categories: disclosureReview.categories.map((category) => ({ ...category })),
      },
    }),
    ...(clarification === undefined ? {} : { clarification: { ...clarification } }),
    ...(preparedAction === undefined ? {} : { preparedAction: {
      ...preparedAction,
      price: { ...preparedAction.price },
      materialTerms: preparedAction.materialTerms.map((term) => ({ ...term })),
      cancellation: { ...preparedAction.cancellation },
      selection: { ...preparedAction.selection },
      dataUse: {
        categories: preparedAction.dataUse.categories.map((category) => ({ ...category })),
        purposes: [...preparedAction.dataUse.purposes],
      },
      effects: preparedAction.effects.map((effect) => ({ ...effect })),
      alternatives: preparedAction.alternatives.map((alternative) => ({
        ...alternative, price: { ...alternative.price },
      })),
    } }),
    ...(action === undefined ? {} : { action: {
      state: action.state, resolution: action.resolution, automaticRetry: action.automaticRetry,
      observedAt: action.observedAt,
      ...(action.result === undefined ? {} : { result: structuredClone(action.result) }),
    } }),
    ...(progress === undefined ? {} : { progress: {
      ...progress, current: { ...progress.current },
    } }),
    ...(activity === undefined ? {} : { activity: {
      actor: activity.actor, certainty: activity.certainty, updatedAt: activity.updatedAt,
      retry: activity.retry, cancellation: activity.cancellation, safeNextAction: activity.safeNextAction,
      ...(activity.nextCheckAt === undefined ? {} : { nextCheckAt: activity.nextCheckAt }),
    } }),
    ...(decision === undefined ? {} : {
      decision: writableClone(decision),
    }),
    ...(confirmation === undefined ? {} : {
      confirmation: writableClone(confirmation),
    }),
    options: view.options.map(writableOption),
    ...(optionSet === undefined ? {} : { optionSet: {
      ...optionSet,
      ordering: optionSet.ordering.kind === 'recommended'
        ? { ...optionSet.ordering, reasons: [...optionSet.ordering.reasons], tradeoffs: [...optionSet.ordering.tradeoffs] }
        : { ...optionSet.ordering },
      coverage: {
        ...optionSet.coverage,
        businesses: optionSet.coverage.businesses.map((business) => ({ ...business })),
      },
      options: optionSet.options.map(writableOption),
    } }),
  }
}

type DeepWritable<Value> = Value extends string | number | boolean | bigint | null | undefined
  ? Value
  : Value extends readonly (infer Item)[]
    ? DeepWritable<Item>[]
    : Value extends object
      ? { -readonly [Key in keyof Value]: DeepWritable<Exclude<Value[Key], undefined>> }
      : Value

function writableClone<Value>(value: Value): DeepWritable<Value> {
  return structuredClone(value) as DeepWritable<Value>
}

function writableOption(option: CustomerRequestView['options'][number]) {
  return {
    ...option, business: { ...option.business }, expectedCost: { ...option.expectedCost }, maximumCost: { ...option.maximumCost },
    priceComponents: option.priceComponents.map((component) => ({ ...component })),
    comparableOutputs: option.comparableOutputs.map((output) => ({ ...output })), materialTerms: [...option.materialTerms],
    cancellation: { ...option.cancellation },
    provenance: {
      kind: option.provenance.kind, validUntil: option.provenance.validUntil,
      ...(option.provenance.observedAt === undefined ? {} : { observedAt: option.provenance.observedAt }),
    },
    commercialInfluence: { ...option.commercialInfluence },
  }
}

type ServiceAssertion = Infer<typeof serviceAssertion>
type RequestCaller = Readonly<{
  principalId: string
  delegatedAgentId: string
}>

async function resolveRequestCaller(
  ctx: ActionCtx,
  operation: 'submit' | 'compare' | 'confirm' | 'run' | 'cancel' | 'report' | 'evidence' | 'authorize' | 'resume' | 'facts' | 'refine',
  command: Record<string, unknown>,
  assertion: ServiceAssertion | undefined,
  delegatedAgentId?: string,
): Promise<RequestCaller | undefined> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity !== null) {
    const requestRef = typeof command.requestRef === 'string' ? command.requestRef : undefined
    if (requestRef !== undefined) {
      const current = await loadCurrent(ctx, requestRef)
      if (current.kind === 'current' && current.aggregate.snapshot.principalId !== identity.tokenIdentifier) {
        const agentPrincipal = await ctx.runQuery(internal.customerRequestPrincipals.getAgentPrincipal, {
          principalId: current.aggregate.snapshot.principalId,
        })
        if (agentPrincipal?.ownerTokenIdentifier === identity.tokenIdentifier) {
          return {
            principalId: agentPrincipal.principalId,
            delegatedAgentId: agentPrincipal.principalId,
          }
        }
      }
    }
    return {
      principalId: identity.tokenIdentifier,
      delegatedAgentId: delegatedAgentId ?? identity.tokenIdentifier,
    }
  }
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (assertion === undefined || key === undefined || key.length < 32
    || !assertion.scopes.includes('customer_requests:create')) return undefined
  const verified = await verifyCustomerRequestServiceAssertion({ key, operation, command: command as never, assertion })
  if (!verified) return undefined
  const clerkIssuer = env.CLERK_JWT_ISSUER_DOMAIN?.trim()
  if (clerkIssuer === undefined || clerkIssuer.length === 0) return undefined
  const recorded = await ctx.runMutation(internal.customerRequestPrincipals.recordAgentPrincipal, {
    principalId: assertion.principalId, ownerId: assertion.ownerId, credentialId: assertion.credentialId,
    ownerTokenIdentifier: `${clerkIssuer}|${assertion.ownerId}`,
    scopes: [...assertion.scopes], seenAt: Date.now(),
  })
  if (recorded.kind !== 'recorded') return undefined
  const requestRef = typeof command.requestRef === 'string' ? command.requestRef : undefined
  if (requestRef !== undefined) {
    const current = await loadCurrent(ctx, requestRef)
    if (current.kind === 'current' && current.aggregate.snapshot.principalId !== assertion.principalId) {
      const requestPrincipal = await ctx.runQuery(internal.customerRequestPrincipals.getAgentPrincipal, {
        principalId: current.aggregate.snapshot.principalId,
      })
      if (requestPrincipal?.ownerId === assertion.ownerId
        && requestPrincipal.ownerTokenIdentifier === `${clerkIssuer}|${assertion.ownerId}`) {
        return {
          principalId: requestPrincipal.principalId,
          delegatedAgentId: assertion.principalId,
        }
      }
    }
  }
  return {
    principalId: assertion.principalId,
    delegatedAgentId: assertion.principalId,
  }
}

function customerProgressState(
  state: 'queued' | 'leased' | 'dispatched' | 'accepted' | 'succeeded' | 'failed' | 'outcome_unknown' | 'cancelled',
): 'queued' | 'contacting' | 'awaiting_result' | 'validating_result' | 'needs_attention' {
  if (state === 'queued') return 'queued'
  if (state === 'leased' || state === 'dispatched') return 'contacting'
  if (state === 'accepted') return 'awaiting_result'
  if (state === 'succeeded') return 'validating_result'
  return 'needs_attention'
}

function parseCustomerRouteResult(resultJson: string): JsonValue | undefined {
  try {
    const parsed: unknown = JSON.parse(resultJson)
    return isBoundedJsonValue(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function namespacedKey(principalId: string, operation: string, requestRef: string, callerKey: string): string {
  return `${operation}:${canonicalDigest({ principalId, requestRef, callerKey })}`
}

function exactRefKey(ref: CapabilityContractRef): string {
  return `${ref.capabilityId}\u0000${ref.version}\u0000${ref.contractDigest}`
}
