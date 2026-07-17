import { v, type Infer } from 'convex/values'

import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  customerRequestV2AggregateValue,
  durableActionPreparationV2Value,
  routePlanGenerationV2Value,
} from '@/modules/customer-request/runtime'
import {
  projectCustomerCriteria,
  projectNeedsAttention,
  type CustomerRequestView,
} from '@/modules/customer-request/customer-projection'
import {
  type CustomerRequestAmendment,
  type CustomerRequestSemanticProposal,
} from '@/modules/customer-request/semantic-interpreter'
import { verifyCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'
import {
  bindRequirementAnswer,
  compileCommit as compileCommitApplication,
  exportRouteEvidence as exportRouteEvidenceApplication,
  exportRouteProblemForSupport as exportRouteProblemForSupportApplication,
  interpretCompileCommit as interpretCompileCommitApplication,
  listRouteProblemsForSupport as listRouteProblemsForSupportApplication,
  loadRequestGraph as loadRequestGraphApplication,
  preparationResultView,
  allowStandingRoute,
  confirmCustomerRoute,
  inspectStandingRoute,
  listStandingRouteAssistants,
  prepareCompare,
  projectRoutePlansFromMaterial,
  projectStoredAggregate as projectStoredAggregateApplication,
  projectStoredRouteRun as projectStoredRouteRunApplication,
  readRouteProblemForBusiness as readRouteProblemForBusinessApplication,
  rebindStoredFacts,
  recordRouteProblemBusinessReport as recordRouteProblemBusinessReportApplication,
  recoverUnresolvedEgress as recoverUnresolvedEgressApplication,
  refineCustomerRequest,
  replyRouteProblem as replyRouteProblemApplication,
  replayCommittedCommand as replayCommittedCommandApplication,
  reportRouteProblem as reportRouteProblemApplication,
  resumeCustomerRequest,
  revokeStandingRoute,
  runPreparationEgress as runPreparationEgressApplication,
  applyStandingRoute,
  updateRouteProblemStatus as updateRouteProblemStatusApplication,
  type CommandReplayResult,
  type CompileCommitInput,
  type CustomerRequestActionResult,
  type EligibleSupplyResult,
  type ExactContractResult,
  type PreparationMutationResult,
  type RequestGraph,
  type RoutePlanProjectionMaterial,
} from '@/modules/customer-request/application/public'

import { internal } from './_generated/api'
import { action, env, type ActionCtx } from './_generated/server'
import { compareResumePorts, preparationEgressPorts } from './customerRequestCompareResumePorts'
import { confirmRoutePorts } from './customerRequestConfirmRoutePorts'
import { problemRoutePorts } from './customerRequestProblemRoutePorts'
import { refinePorts } from './customerRequestRefinePorts'
import { standingRoutePorts } from './customerRequestStandingRoutePorts'

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
  completeness: v.literal('complete'),
  hardConstraints: v.union(v.literal('satisfied'), v.literal('not_evaluated')),
  maximumCost: customerRouteMaximumCost,
  dataExposureCount: v.number(), irreversibleEffectCount: v.number(), uncertaintyCount: v.number(),
  duration: v.literal('not_declared'),
  recovery: v.union(v.literal('retry_safe'), v.literal('reconcile_required')),
  trust: v.literal('registered_current_option'), evidenceCount: v.number(),
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
  uncertainty: v.array(v.union(
    v.literal('price_needs_confirmation'), v.literal('customer_fact_needs_evidence'),
  )),
  comparison: customerRouteComparisonEvidence,
  steps: v.optional(v.array(v.object({
    step: v.number(), business: customerBusiness, after: v.array(v.number()),
  }))),
})
const customerRouteDecisionChange = v.union(
  v.object({
    kind: v.literal('request_criteria'),
    before: v.array(v.object({
      label: v.string(), value: v.any(),
      basis: v.union(v.literal('customer_provided'), v.literal('extracted_from_request')),
    })),
    after: v.array(v.object({
      label: v.string(), value: v.any(),
      basis: v.union(v.literal('customer_provided'), v.literal('extracted_from_request')),
    })),
  }),
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
      resultRef: v.string(), uncertainty: v.array(v.union(
        v.literal('price_needs_confirmation'), v.literal('customer_fact_needs_evidence'),
      )),
    })),
    after: v.array(v.object({
      resultRef: v.string(), uncertainty: v.array(v.union(
        v.literal('price_needs_confirmation'), v.literal('customer_fact_needs_evidence'),
      )),
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
        v.literal('ranking_evidence_invalid'),
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
    impact: v.union(
      v.literal('eligibility_and_comparison'), v.literal('uncertainty'), v.literal('authority_boundary'),
    ),
  })),
  disclosureReview: v.optional(v.object({
    purpose: v.string(), maximumRecipients: v.number(),
    categories: v.array(v.object({
      label: v.string(), classification: v.union(
        v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential'),
      ),
    })),
  })),
  dataHandling: v.optional(v.object({
    requestStorage: v.literal('saved_for_revision'),
    businessSharing: v.literal('not_shared'),
    explanation: v.string(),
  })),
  unsupportedRecovery: v.optional(v.object({
    reason: v.union(
      v.literal('requested_result_not_available'),
      v.literal('provider_data_sharing_prohibited'),
      v.literal('maximum_response_time_unproven'),
      v.literal('maximum_total_cost_exceeded'),
      v.literal('no_current_business'),
      v.literal('route_composition_unavailable'),
      v.literal('reported_option_unavailable'),
    ),
    preservedRequest: v.literal(true),
    authorityCreatedForThisRevision: v.literal(false),
    businessContactedForThisRevision: v.literal(false),
    nextStep: v.object({ kind: v.literal('change_request'), summary: v.string() }),
  })),
  preparationRef: v.optional(v.string()),
  clarification: v.optional(v.union(
    v.object({ kind: v.literal('intent_direction'), prompt: v.string(), answerKind: v.literal('natural_language') }),
    v.object({ kind: v.literal('contract_fact'), requirementKey: v.string(), prompt: v.string(), answerKind: v.literal('typed_value') }),
  )),
  options: v.array(customerOption),
  optionSet: v.optional(customerOptionSet),
  preparedAction: v.optional(customerPreparedAction),
  businesses: v.optional(v.array(customerBusiness)),
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
        v.literal('queued'), v.literal('ready_to_contact'), v.literal('contacting'), v.literal('awaiting_result'),
        v.literal('completed'), v.literal('needs_attention'), v.literal('cancelled'),
      ),
    }),
    dependencies: v.optional(v.object({
      completed: v.array(v.object({ step: v.number(), business: v.string() })),
      blocked: v.array(v.object({
        step: v.number(), business: v.string(),
        waitingForStep: v.number(), waitingForBusiness: v.string(),
      })),
    })),
  })),
  activity: v.optional(v.object({
    actor: v.union(
      v.literal('ae'), v.literal('business'), v.literal('customer'),
      v.literal('none'), v.literal('ae_for_customer'),
    ),
    certainty: v.union(
      v.literal('pending'), v.literal('unknown'), v.literal('confirmed'),
      v.literal('failed'), v.literal('cancelled'),
    ),
    updatedAt: v.number(),
    nextCheckAt: v.optional(v.number()),
    retry: v.union(v.literal('not_needed'), v.literal('blocked_until_reconciled'), v.literal('manual_after_failure')),
    cancellation: v.union(
      v.object({
        state: v.literal('available'),
        until: v.literal('before_next_step_release'),
        releaseMayStartAt: v.number(),
      }),
      v.object({
        state: v.literal('not_available'),
        reason: v.union(v.literal('business_step_released'), v.literal('request_finished')),
        changedAt: v.number(),
        requestedAt: v.optional(v.number()),
      }),
      v.object({
        state: v.literal('stopped'),
        stoppedAt: v.number(),
      }),
      v.object({
        state: v.literal('pending'),
        requestedAt: v.number(),
        nextCheckAt: v.number(),
      }),
      v.object({
        state: v.literal('unknown'),
        requestedAt: v.number(),
        observedAt: v.number(),
        nextCheckAt: v.number(),
      }),
      v.object({
        state: v.literal('rejected'),
        requestedAt: v.number(),
        observedAt: v.number(),
        reason: v.string(),
      }),
    ),
    safeNextAction: v.union(
      v.literal('check_progress'), v.literal('wait_for_evidence'), v.literal('review_result'),
      v.literal('revise_request'), v.literal('none'),
    ),
  })),
  recovery: v.optional(v.object({
    state: v.literal('restored'),
    reason: v.optional(v.union(v.literal('request_restored'), v.literal('choice_expired'))),
    restoredAt: v.number(),
    workRestarted: v.literal(false),
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
  v.literal('evidence_not_found'), v.literal('invalid_amendment'),
)
const actionResult = v.union(customerView, conflict, v.object({ kind: v.literal('refused'), reason: refusedReason }))
type ActionResult = Infer<typeof actionResult>
const repeatPermissionResult = v.union(
  v.object({
    kind: v.literal('repeat_permission'),
    status: v.union(v.literal('active'), v.literal('withdrawn')),
    permissionRef: v.string(),
    requestRef: v.string(),
    revision: v.number(),
    routeRef: v.string(),
    delegatedCredentialId: v.string(),
    limits: v.object({
      perUseSpend: v.object({ currency: v.string(), amountMinor: v.number() }),
      cumulativeSpend: v.object({ currency: v.string(), amountMinor: v.number() }),
      perUseDataAllocations: v.number(),
      cumulativeDataAllocations: v.number(),
      occurrences: v.number(),
    }),
    fallback: v.literal('ask_for_confirmation'),
    validFrom: v.number(),
    validUntil: v.number(),
    withdrawnAt: v.optional(v.number()),
  }),
  conflict,
  v.object({ kind: v.literal('refused'), reason: refusedReason }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('choice_not_current'),
      v.literal('credential_not_authorized'),
      v.literal('repeat_permission_not_available'),
    ),
    summary: v.string(),
  }),
)
type RepeatPermissionResult = Infer<typeof repeatPermissionResult>
const repeatPermissionAssistantsResult = v.union(
  v.object({
    kind: v.literal('connected_assistants'),
    requestRef: v.string(),
    assistants: v.array(v.object({
      assistantRef: v.string(),
      label: v.string(),
      lastUsedAt: v.number(),
    })),
    permissions: v.array(repeatPermissionResult.members[0]),
  }),
  v.object({ kind: v.literal('refused'), reason: refusedReason }),
)
type RepeatPermissionAssistantsResult = Infer<typeof repeatPermissionAssistantsResult>
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
    const commandKey = namespacedKey(caller.principalId, 'submit', args.requestId, args.compilationKey)
    const commandDigest = canonicalDigest(command)
    const committedReplay = await replayCommittedCommand(ctx, {
      commandKey,
      commandDigest,
      requestId: args.requestId,
      principalId: caller.principalId,
    })
    if (committedReplay !== undefined) return committedReplay
    const reservation = await ctx.runMutation(internal.customerRequestV2.reserveSubmission, {
      commandKey,
      commandDigest,
      requestId: args.requestId,
      principalId: caller.principalId,
      delegatedAgentId: caller.delegatedAgentId,
      intent: args.customerJob,
      networkId: args.routing.networkId,
      createdAt: Date.now(),
    })
    if (reservation.kind === 'identity_conflict') return {
      kind: 'conflict', requestRef: args.requestId, reason: 'identity_changed',
    }
    if (reservation.kind === 'command_conflict') return {
      kind: 'conflict', requestRef: args.requestId, reason: 'idempotency_key_reused',
    }
    return await interpretCompileCommit(ctx, {
      commandKey,
      commandDigest,
      requestId: args.requestId,
      expectedRevision: args.expectedRevision ?? 0,
      expectedRouteGeneration: 0,
      principalId: caller.principalId,
      delegatedAgentId: caller.delegatedAgentId,
      intent: args.customerJob,
      networkId: args.routing.networkId,
      priorFacts: [],
      durableShell: true,
      now: Date.now(),
    })
  },
})

export const refine = action({
  args: {
    requestRef: v.string(), expectedRevision: v.number(), idempotencyKey: v.string(), message: v.string(),
    mode: v.optional(v.union(v.literal('append'), v.literal('replace'))),
    replacesPriorStatement: v.optional(v.string()),
    reportedRouteRef: v.optional(v.string()),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const command = {
      requestRef: args.requestRef, expectedRevision: args.expectedRevision,
      idempotencyKey: args.idempotencyKey, message: args.message,
      ...(args.mode === undefined ? {} : { mode: args.mode }),
      ...(args.replacesPriorStatement === undefined ? {} : {
        replacesPriorStatement: args.replacesPriorStatement,
      }),
      ...(args.reportedRouteRef === undefined ? {} : { reportedRouteRef: args.reportedRouteRef }),
    }
    const caller = await resolveRequestCaller(ctx, 'refine', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    return toActionResult(await refineCustomerRequest({
      ...command,
      commandKey: namespacedKey(caller.principalId, 'refine', args.requestRef, args.idempotencyKey),
      commandDigest: canonicalDigest(command),
      principalId: caller.principalId,
    }, refinePorts(ctx)))
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
    const command = {
      requestRef: args.requestRef, expectedRevision: args.expectedRevision,
      idempotencyKey: args.idempotencyKey, requirementKey: args.requirementKey, value: args.value,
    }
    const caller = await resolveRequestCaller(ctx, 'facts', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    const commandKey = namespacedKey(caller.principalId, 'facts', args.requestRef, args.idempotencyKey)
    const commandDigest = canonicalDigest(command)
    const replay = await replayCommittedCommand(ctx, {
      commandKey, commandDigest, requestId: args.requestRef, principalId: caller.principalId,
    })
    if (replay !== undefined) return replay
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
      commandKey,
      commandDigest,
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
      now: Date.now(),
    })
  },
})

export const resume = action({
  args: { requestRef: v.string(), serviceAuth: v.optional(serviceAssertion) },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => (
    withRestoredRequest(await resumeRequest(ctx, args), Date.now())
  ),
})

async function resumeRequest(
  ctx: ActionCtx,
  args: Readonly<{ requestRef: string; serviceAuth?: Infer<typeof serviceAssertion> }>,
  authenticatedCaller?: RequestCaller,
): Promise<ActionResult> {
  const caller = authenticatedCaller
    ?? await resolveRequestCaller(ctx, 'resume', { requestRef: args.requestRef }, args.serviceAuth)
  if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
  return toActionResult(await resumeCustomerRequest(
    { requestRef: args.requestRef, principalId: caller.principalId },
    compareResumePorts(ctx),
  ))
}

export const compare = action({
  args: {
    requestRef: v.string(), revision: v.number(), idempotencyKey: v.string(),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const command = {
      requestRef: args.requestRef,
      revision: args.revision,
      idempotencyKey: args.idempotencyKey,
    }
    const caller = await resolveRequestCaller(ctx, 'compare', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    return toActionResult(await prepareCompare({
      requestRef: args.requestRef,
      revision: args.revision,
      idempotencyKey: args.idempotencyKey,
      principalId: caller.principalId,
      compareCommandKey: namespacedKey(caller.principalId, 'compare', args.requestRef, args.idempotencyKey),
      egressCommandKey: namespacedKey(caller.principalId, 'egress', args.requestRef, args.idempotencyKey),
      commandDigest: canonicalDigest(command),
    }, compareResumePorts(ctx)))
  },
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
    return toActionResult(await confirmCustomerRoute({
      ...command,
      principalId: caller.principalId,
      ...(args.serviceAuth === undefined ? {} : {
        serviceAuthorization: { command, assertion: args.serviceAuth },
      }),
    }, confirmRoutePorts(ctx)))
  },
})

export const listRepeatPermissionAssistants = action({
  args: { requestRef: v.string(), serviceAuth: v.optional(serviceAssertion) },
  returns: repeatPermissionAssistantsResult,
  handler: async (ctx, args): Promise<RepeatPermissionAssistantsResult> => {
    const command = { requestRef: args.requestRef }
    const caller = await resolveRequestCaller(ctx, 'inspect_repeat', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    return await listStandingRouteAssistants({
      requestRef: args.requestRef,
      principalId: caller.principalId,
      ownerId: caller.ownerId,
    }, standingRoutePorts(ctx)) as RepeatPermissionAssistantsResult
  },
})

export const allowRepeatRoute = action({
  args: {
    requestRef: v.string(),
    revision: v.number(),
    routeRef: v.string(),
    delegatedCredentialId: v.string(),
    occurrences: v.number(),
    cumulativeSpend: v.object({ currency: v.string(), amountMinor: v.number() }),
    validUntil: v.number(),
    idempotencyKey: v.string(),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: repeatPermissionResult,
  handler: async (ctx, args): Promise<RepeatPermissionResult> => {
    const command = {
      requestRef: args.requestRef,
      revision: args.revision,
      routeRef: args.routeRef,
      delegatedCredentialId: args.delegatedCredentialId,
      occurrences: args.occurrences,
      cumulativeSpend: args.cumulativeSpend,
      validUntil: args.validUntil,
      idempotencyKey: args.idempotencyKey,
    }
    const caller = await resolveRequestCaller(ctx, 'allow_repeat', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    return await allowStandingRoute({
      ...command,
      principalId: caller.principalId,
      ...(args.serviceAuth === undefined ? {} : {
        serviceAuthorization: {
          operation: 'allow_repeat' as const,
          command,
          assertion: args.serviceAuth,
        },
      }),
    }, standingRoutePorts(ctx)) as RepeatPermissionResult
  },
})

export const useRepeatRoute = action({
  args: {
    requestRef: v.string(),
    revision: v.number(),
    routeRef: v.string(),
    permissionRef: v.string(),
    delegatedCredentialId: v.string(),
    idempotencyKey: v.string(),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const command = {
      requestRef: args.requestRef,
      revision: args.revision,
      routeRef: args.routeRef,
      permissionRef: args.permissionRef,
      delegatedCredentialId: args.delegatedCredentialId,
      idempotencyKey: args.idempotencyKey,
    }
    const caller = await resolveRequestCaller(ctx, 'use_repeat', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    return toActionResult(await applyStandingRoute({
      ...command,
      principalId: caller.principalId,
      ...(args.serviceAuth === undefined ? {} : {
        serviceAuthorization: {
          operation: 'use_repeat' as const,
          command,
          assertion: args.serviceAuth,
        },
      }),
    }, standingRoutePorts(ctx)))
  },
})

export const inspectRepeatRoute = action({
  args: {
    requestRef: v.string(),
    permissionRef: v.string(),
    routeRef: v.string(),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: repeatPermissionResult,
  handler: async (ctx, args): Promise<RepeatPermissionResult> => {
    const command = {
      requestRef: args.requestRef,
      permissionRef: args.permissionRef,
      routeRef: args.routeRef,
    }
    const caller = await resolveRequestCaller(ctx, 'inspect_repeat', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    return await inspectStandingRoute({
      ...command,
      principalId: caller.principalId,
    }, standingRoutePorts(ctx)) as RepeatPermissionResult
  },
})

export const revokeRepeatRoute = action({
  args: {
    requestRef: v.string(),
    permissionRef: v.string(),
    routeRef: v.string(),
    idempotencyKey: v.string(),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: repeatPermissionResult,
  handler: async (ctx, args): Promise<RepeatPermissionResult> => {
    const command = {
      requestRef: args.requestRef,
      permissionRef: args.permissionRef,
      routeRef: args.routeRef,
      idempotencyKey: args.idempotencyKey,
    }
    const caller = await resolveRequestCaller(ctx, 'revoke_repeat', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    return await revokeStandingRoute({
      ...command,
      principalId: caller.principalId,
      ...(args.serviceAuth === undefined ? {} : {
        serviceAuthorization: {
          operation: 'revoke_repeat' as const,
          command,
          assertion: args.serviceAuth,
        },
      }),
    }, standingRoutePorts(ctx)) as RepeatPermissionResult
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
    return toActionResult(projectStoredRouteRunApplication(current.aggregate, result.run))
  },
})

export const cancelRoute = action({
  args: {
    requestRef: v.string(), idempotencyKey: v.string(),
    mode: v.optional(v.union(v.literal('current_and_downstream'), v.literal('after_current_step'))),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const mode = args.mode ?? 'current_and_downstream'
    const command = { requestRef: args.requestRef, idempotencyKey: args.idempotencyKey, mode }
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
      mode,
    })
    if (result.kind === 'conflict') return {
      kind: 'conflict', requestRef: args.requestRef, reason: 'idempotency_key_reused',
    }
    if (result.kind === 'refused') return writableView(projectNeedsAttention({
      requestRef: args.requestRef,
      revision: current.aggregate.snapshot.revision,
      summary: 'There is no active request to stop.',
    }))
    return toActionResult(projectStoredRouteRunApplication(current.aggregate, result.run))
  },
})

const problemReceipt = v.object({
  kind: v.literal('problem_reported'), requestRef: v.string(), reportRef: v.string(),
  state: v.literal('received'), reportedAt: v.number(),
  problem: v.object({
    category: v.union(
      v.literal('incorrect_result'), v.literal('unexpected_cost'), v.literal('privacy_concern'),
      v.literal('duplicate_charge_or_effect'), v.literal('could_not_stop'), v.literal('other'),
    ),
    claimSource: v.literal('customer'), causality: v.literal('unknown'),
    resolution: v.literal('not_adjudicated'), nextAction: v.literal('await_status_update'),
    nextActor: v.literal('ae'), nextUpdateDueAt: v.number(),
    decisionAuthority: v.literal('not_assigned'),
    visibility: v.union(
      v.literal('customer_and_ae_only'), v.literal('share_with_affected_business'),
    ),
    evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    affected: v.object({
      step: v.number(), attemptRef: v.optional(v.string()), business: v.optional(v.string()),
    }),
  }),
})
const problemActionResult = v.union(problemReceipt, conflict, v.object({ kind: v.literal('refused'), reason: refusedReason }))
type ProblemActionResult = Infer<typeof problemActionResult>

const problemTrackedState = v.union(
  v.literal('investigating'),
  v.literal('waiting_for_customer'),
  v.literal('closed'),
)
const problemStatusChangeResult = v.union(
  v.object({
    kind: v.union(v.literal('problem_status_updated'), v.literal('problem_reply_recorded')),
    reportRef: v.string(),
    version: v.number(),
    state: problemTrackedState,
    nextAction: v.union(
      v.literal('await_status_update'),
      v.literal('provide_information'),
      v.literal('none'),
    ),
    nextActor: v.union(v.literal('ae'), v.literal('customer'), v.literal('none')),
    nextUpdateDueAt: v.optional(v.number()),
    decisionAuthority: v.literal('not_assigned'),
    recordedAt: v.number(),
  }),
  v.object({
    kind: v.literal('conflict'),
    reportRef: v.string(),
    reason: v.union(v.literal('idempotency_key_reused'), v.literal('stale_version')),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authentication_required'),
      v.literal('authority_denied'),
      v.literal('request_not_found'),
      v.literal('report_not_found'),
      v.literal('invalid_update'),
    ),
  }),
)
type ProblemStatusChangeResult = Infer<typeof problemStatusChangeResult>

export const reportRouteProblem = action({
  args: {
    requestRef: v.string(), idempotencyKey: v.string(),
    category: v.union(
      v.literal('incorrect_result'), v.literal('unexpected_cost'), v.literal('privacy_concern'),
      v.literal('duplicate_charge_or_effect'), v.literal('could_not_stop'), v.literal('other'),
    ),
    summary: v.string(), affectedStep: v.optional(v.number()),
    evidenceReceiptRefs: v.optional(v.array(v.string())),
    visibility: v.optional(v.union(
      v.literal('customer_and_ae_only'), v.literal('share_with_affected_business'),
    )),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: problemActionResult,
  handler: async (ctx, args): Promise<ProblemActionResult> => {
    const command = {
      requestRef: args.requestRef, idempotencyKey: args.idempotencyKey,
      category: args.category, summary: args.summary,
      ...(args.affectedStep === undefined ? {} : { affectedStep: args.affectedStep }),
      evidenceReceiptRefs: args.evidenceReceiptRefs ?? [],
      visibility: args.visibility ?? 'customer_and_ae_only',
    }
    const caller = await resolveRequestCaller(ctx, 'report', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused' as const, reason: 'authentication_required' as const }
    return await reportRouteProblemApplication({
      ...command,
      principalId: caller.principalId,
    }, problemRoutePorts(ctx)) as ProblemActionResult
  },
})

const businessProblemReportActionResult = v.union(
  v.object({
    kind: v.literal('business_report_recorded'),
    statementRef: v.string(),
    reportRef: v.string(),
    business: v.string(),
    claimSource: v.literal('business'),
    causalityPosition: v.union(
      v.literal('supports'),
      v.literal('disputes'),
      v.literal('uncertain'),
    ),
    causality: v.literal('unknown'),
    resolution: v.literal('not_adjudicated'),
    decisionAuthority: v.literal('not_assigned'),
    statement: v.string(),
    evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    recordedAt: v.number(),
  }),
  v.object({ kind: v.literal('conflict'), reason: v.literal('idempotency_key_reused') }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authentication_required'),
      v.literal('authority_denied'),
      v.literal('report_not_found'),
      v.literal('sharing_not_authorized'),
      v.literal('evidence_not_found'),
      v.literal('invalid_report'),
    ),
  }),
)
type BusinessProblemReportActionResult = Infer<typeof businessProblemReportActionResult>

const businessProblemViewActionResult = v.union(
  v.object({
    kind: v.literal('business_problem'),
    reportRef: v.string(),
    business: v.string(),
    category: v.union(
      v.literal('incorrect_result'),
      v.literal('unexpected_cost'),
      v.literal('duplicate_charge_or_effect'),
      v.literal('privacy_concern'),
      v.literal('could_not_stop'),
      v.literal('other'),
    ),
    customerStatement: v.string(),
    causality: v.literal('unknown'),
    resolution: v.literal('not_adjudicated'),
    decisionAuthority: v.literal('not_assigned'),
    evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    availableEvidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    businessClaims: v.array(v.object({
      statementRef: v.string(),
      causalityPosition: v.union(
        v.literal('supports'),
        v.literal('disputes'),
        v.literal('uncertain'),
      ),
      statement: v.string(),
      evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
      recordedAt: v.number(),
    })),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authentication_required'),
      v.literal('authority_denied'),
      v.literal('report_not_found'),
      v.literal('sharing_not_authorized'),
    ),
  }),
)
type BusinessProblemViewActionResult = Infer<typeof businessProblemViewActionResult>

export const readRouteProblemForBusiness = action({
  args: { reportRef: v.string() },
  returns: businessProblemViewActionResult,
  handler: async (ctx, args): Promise<BusinessProblemViewActionResult> => (
    await readRouteProblemForBusinessApplication(args, problemRoutePorts(ctx)) as BusinessProblemViewActionResult
  ),
})

export const recordRouteProblemBusinessReport = action({
  args: {
    reportRef: v.string(),
    idempotencyKey: v.string(),
    causalityPosition: v.union(
      v.literal('supports'),
      v.literal('disputes'),
      v.literal('uncertain'),
    ),
    statement: v.string(),
    evidenceReceiptRefs: v.optional(v.array(v.string())),
  },
  returns: businessProblemReportActionResult,
  handler: async (ctx, args): Promise<BusinessProblemReportActionResult> => (
    await recordRouteProblemBusinessReportApplication(args, problemRoutePorts(ctx)) as BusinessProblemReportActionResult
  ),
})

export const updateRouteProblemStatus = action({
  args: {
    reportRef: v.string(),
    expectedVersion: v.number(),
    idempotencyKey: v.string(),
    state: problemTrackedState,
    publicMessage: v.string(),
  },
  returns: problemStatusChangeResult,
  handler: async (ctx, args): Promise<ProblemStatusChangeResult> => (
    await updateRouteProblemStatusApplication(args, problemRoutePorts(ctx)) as ProblemStatusChangeResult
  ),
})

export const replyRouteProblem = action({
  args: {
    requestRef: v.string(),
    reportRef: v.string(),
    expectedVersion: v.number(),
    idempotencyKey: v.string(),
    message: v.string(),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: problemStatusChangeResult,
  handler: async (ctx, args): Promise<ProblemStatusChangeResult> => {
    const command = {
      requestRef: args.requestRef,
      reportRef: args.reportRef,
      expectedVersion: args.expectedVersion,
      idempotencyKey: args.idempotencyKey,
      message: args.message,
    }
    const caller = await resolveRequestCaller(ctx, 'report', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    return await replyRouteProblemApplication({
      ...command,
      principalId: caller.principalId,
    }, problemRoutePorts(ctx)) as ProblemStatusChangeResult
  },
})

const supportProblemListResult = v.union(
  v.object({
    kind: v.literal('allowed'),
    rows: v.array(v.object({
      reportRef: v.string(),
      requestRef: v.string(),
      version: v.number(),
      state: v.union(
        v.literal('received'),
        v.literal('update_due'),
        v.literal('investigating'),
        v.literal('waiting_for_customer'),
        v.literal('closed'),
      ),
      nextActor: v.union(v.literal('ae'), v.literal('customer'), v.literal('none')),
      category: v.union(
        v.literal('incorrect_result'),
        v.literal('unexpected_cost'),
        v.literal('duplicate_charge_or_effect'),
        v.literal('privacy_concern'),
        v.literal('could_not_stop'),
        v.literal('other'),
      ),
      summary: v.string(),
      business: v.optional(v.string()),
      reportedAt: v.number(),
      lastUpdatedAt: v.number(),
    })),
  }),
  v.object({
    kind: v.literal('denied'),
    reason: v.union(
      v.literal('missing_membership'),
      v.literal('inactive_membership'),
      v.literal('action_not_allowed'),
    ),
    rows: v.array(v.any()),
  }),
)
type SupportProblemListResult = Infer<typeof supportProblemListResult>

export const listRouteProblemsForSupport = action({
  args: { limit: v.optional(v.number()) },
  returns: supportProblemListResult,
  handler: async (ctx, args): Promise<SupportProblemListResult> => (
    await listRouteProblemsForSupportApplication({
      limit: args.limit ?? 50,
    }, problemRoutePorts(ctx)) as SupportProblemListResult
  ),
})

const supportProblemExportResult = v.union(
  v.object({
    kind: v.literal('problem_export'),
    reportRef: v.string(),
    requestRef: v.string(),
    version: v.number(),
    state: v.union(
      v.literal('received'),
      v.literal('update_due'),
      v.literal('investigating'),
      v.literal('waiting_for_customer'),
      v.literal('closed'),
    ),
    category: v.union(
      v.literal('incorrect_result'),
      v.literal('unexpected_cost'),
      v.literal('duplicate_charge_or_effect'),
      v.literal('privacy_concern'),
      v.literal('could_not_stop'),
      v.literal('other'),
    ),
    summary: v.string(),
    claimSource: v.literal('customer'),
    causality: v.literal('unknown'),
    resolution: v.literal('not_adjudicated'),
    nextAction: v.union(
      v.literal('await_status_update'),
      v.literal('check_status'),
      v.literal('provide_information'),
      v.literal('none'),
    ),
    nextActor: v.union(v.literal('ae'), v.literal('customer'), v.literal('none')),
    nextUpdateDueAt: v.optional(v.number()),
    decisionAuthority: v.literal('not_assigned'),
    visibility: v.union(
      v.literal('customer_and_ae_only'),
      v.literal('share_with_affected_business'),
    ),
    evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    reportedAt: v.number(),
    affected: v.object({ step: v.number(), business: v.optional(v.string()) }),
    claims: v.array(v.object({
      claimSource: v.union(v.literal('customer'), v.literal('business')),
      causalityPosition: v.union(
        v.literal('reported_problem'),
        v.literal('supports'),
        v.literal('disputes'),
        v.literal('uncertain'),
      ),
      statement: v.string(),
      business: v.optional(v.string()),
      evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
      recordedAt: v.number(),
    })),
    history: v.array(v.object({
      version: v.number(),
      state: v.union(
        v.literal('received'),
        v.literal('investigating'),
        v.literal('waiting_for_customer'),
        v.literal('closed'),
      ),
      source: v.union(v.literal('customer'), v.literal('ae_support')),
      message: v.string(),
      recordedAt: v.number(),
    })),
    reconstruction: v.optional(v.object({
      request: v.object({ revision: v.number(), ordinaryRequest: v.string() }),
      choice: v.object({
        businesses: v.array(v.string()),
        selectedBecause: v.array(v.string()),
        confirmedAt: v.number(),
        validUntil: v.number(),
      }),
      authority: v.object({
        state: v.union(v.literal('current'), v.literal('expired'), v.literal('revoked')),
        source: v.literal('customer_confirmation'),
        spend: v.object({
          limit: v.object({ currency: v.string(), amountMinor: v.number() }),
          admitted: v.object({ currency: v.string(), amountMinor: v.number() }),
        }),
        dataSharing: v.array(v.object({
          classification: v.union(
            v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential'),
          ),
          recipient: v.string(),
          purposes: v.array(v.string()),
          releaseState: v.union(v.literal('authorized'), v.literal('business_step_released')),
        })),
        effects: v.array(v.object({
          class: v.union(
            v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change'),
          ),
          reversibility: v.union(
            v.literal('not_applicable'), v.literal('reversible'),
            v.literal('conditional'), v.literal('irreversible'),
          ),
          releaseState: v.union(v.literal('authorized'), v.literal('business_step_released')),
        })),
      }),
      execution: v.object({
        state: v.union(
          v.literal('queued'), v.literal('running'), v.literal('outcome_unknown'),
          v.literal('completed'), v.literal('failed'), v.literal('cancelled'),
        ),
        completedSteps: v.number(),
        totalSteps: v.number(),
        duplicateRisk: v.union(
          v.literal('protected_by_required_idempotency'),
          v.literal('mixed_or_not_applicable'),
        ),
        steps: v.array(v.object({
          step: v.number(),
          business: v.string(),
          state: v.union(
            v.literal('blocked'), v.literal('queued'), v.literal('ready_to_contact'), v.literal('contacting'),
            v.literal('awaiting_result'), v.literal('completed'), v.literal('failed'),
            v.literal('outcome_unknown'), v.literal('cancelled'),
          ),
          evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
        })),
      }),
      recovery: v.object({
        nextActor: v.union(v.literal('ae'), v.literal('customer'), v.literal('none')),
        nextAction: v.union(
          v.literal('await_status_update'), v.literal('check_status'),
          v.literal('provide_information'), v.literal('none'),
        ),
        retry: v.union(
          v.literal('not_needed'), v.literal('safe'), v.literal('blocked_until_reconciled'),
        ),
      }),
    })),
  }),
  v.object({ kind: v.literal('not_found') }),
  v.object({
    kind: v.literal('denied'),
    reason: v.union(
      v.literal('missing_membership'),
      v.literal('inactive_membership'),
      v.literal('action_not_allowed'),
    ),
  }),
)
type SupportProblemExportResult = Infer<typeof supportProblemExportResult>

export const exportRouteProblemForSupport = action({
  args: { reportRef: v.string() },
  returns: supportProblemExportResult,
  handler: async (ctx, args): Promise<SupportProblemExportResult> => (
    await exportRouteProblemForSupportApplication(args, problemRoutePorts(ctx)) as SupportProblemExportResult
  ),
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
      v.literal('queued'), v.literal('ready_to_contact'), v.literal('contacting'), v.literal('awaiting_result'), v.literal('completed'),
      v.literal('failed'), v.literal('outcome_unknown'), v.literal('cancelled'),
    ),
    observedAt: v.number(),
    business: v.string(),
    providerOrigin: v.string(),
    outputDigest: v.optional(v.string()),
    evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
  })),
  problems: v.array(v.object({
    reportRef: v.string(),
    version: v.number(),
    state: v.union(
      v.literal('received'),
      v.literal('update_due'),
      v.literal('investigating'),
      v.literal('waiting_for_customer'),
      v.literal('closed'),
    ),
    category: v.union(
      v.literal('incorrect_result'), v.literal('unexpected_cost'), v.literal('privacy_concern'),
      v.literal('duplicate_charge_or_effect'), v.literal('could_not_stop'), v.literal('other'),
    ),
    summary: v.string(), claimSource: v.literal('customer'), causality: v.literal('unknown'),
    resolution: v.literal('not_adjudicated'),
    nextAction: v.union(
      v.literal('await_status_update'),
      v.literal('check_status'),
      v.literal('provide_information'),
      v.literal('none'),
    ),
    nextActor: v.union(v.literal('ae'), v.literal('customer'), v.literal('none')),
    nextUpdateDueAt: v.optional(v.number()),
    decisionAuthority: v.literal('not_assigned'),
    visibility: v.union(
      v.literal('customer_and_ae_only'), v.literal('share_with_affected_business'),
    ),
    evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    reportedAt: v.number(),
    affected: v.object({
      step: v.number(), attemptRef: v.optional(v.string()), business: v.optional(v.string()),
    }),
    claims: v.array(v.object({
      claimSource: v.union(v.literal('customer'), v.literal('business')),
      causalityPosition: v.union(
        v.literal('reported_problem'),
        v.literal('supports'),
        v.literal('disputes'),
        v.literal('uncertain'),
      ),
      statement: v.string(),
      business: v.optional(v.string()),
      evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
      recordedAt: v.number(),
    })),
    history: v.array(v.object({
      version: v.number(),
      state: v.union(
        v.literal('received'),
        v.literal('investigating'),
        v.literal('waiting_for_customer'),
        v.literal('closed'),
      ),
      source: v.union(v.literal('customer'), v.literal('ae_support')),
      message: v.string(),
      recordedAt: v.number(),
    })),
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
    return await exportRouteEvidenceApplication({
      requestRef: args.requestRef,
      principalId: caller.principalId,
    }, problemRoutePorts(ctx)) as EvidenceActionResult
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
    return toActionResult(preparationResultView(current.aggregate, result, args.requestRef, args.revision))
  },
})

function toActionResult(result: CustomerRequestActionResult): ActionResult {
  if (result.kind === 'request') return writableView(result)
  return result
}

async function interpretCompileCommit(ctx: ActionCtx, input: Readonly<{
  commandKey: string
  commandDigest: string
  requestId: string
  expectedRevision: number
  expectedRouteGeneration: number
  principalId: string
  delegatedAgentId: string
  intent: string
  amendment?: CustomerRequestAmendment
  networkId: string
  priorFacts: StoredAggregate['snapshot']['facts']
  routeExclusions?: StoredAggregate['snapshot']['routeExclusions']
  replaceCustomerRequestLiteral?: boolean
  durableShell?: boolean
  now: number
}>): Promise<ActionResult> {
  const {
    amendment,
    routeExclusions,
    replaceCustomerRequestLiteral,
    durableShell,
    ...required
  } = input
  return toActionResult(await interpretCompileCommitApplication({
    ...required,
    ...(amendment === undefined ? {} : { amendment }),
    ...(routeExclusions === undefined ? {} : { routeExclusions }),
    ...(replaceCustomerRequestLiteral === undefined ? {} : { replaceCustomerRequestLiteral }),
    ...(durableShell === undefined ? {} : { durableShell }),
  }, {
    replayCommittedCommand: (replayInput) => replayCommittedCommand(ctx, replayInput),
    loadRequestGraph: (networkId) => loadRequestGraph(ctx, networkId),
    commitAggregate: async (commitInput) => await ctx.runMutation(
      internal.customerRequestV2.commitAggregate,
      commitInput,
    ),
    logInterpretationFailure: (code) => {
      console.error('customer_request_semantic_interpretation_failed', code)
    },
  }, {
    maximumDescriptorBytes: MAX_INTERPRETER_DESCRIPTOR_BYTES,
    ...(env.OPENROUTER_API_KEY === undefined ? {} : { openRouterApiKey: env.OPENROUTER_API_KEY }),
    ...(env.AE_CUSTOMER_REQUEST_MODEL === undefined ? {} : { modelName: env.AE_CUSTOMER_REQUEST_MODEL }),
    ...(env.AE_SITE_URL === undefined ? {} : { siteUrl: env.AE_SITE_URL }),
  }))
}

async function compileCommit(ctx: ActionCtx, input: CompileCommitInput): Promise<ActionResult> {
  return toActionResult(await compileCommitApplication(input, {
    replayCommittedCommand: (replayInput) => replayCommittedCommand(ctx, replayInput),
    commitAggregate: async (commitInput) => await ctx.runMutation(
      internal.customerRequestV2.commitAggregate,
      commitInput,
    ),
  }))
}

async function replayCommittedCommand(ctx: ActionCtx, input: Readonly<{
  commandKey: string
  commandDigest: string
  requestId: string
  principalId: string
  noEffectReplay?: () => Promise<ActionResult>
}>): Promise<ActionResult | undefined> {
  const result = await replayCommittedCommandApplication(input, {
    getCommandReplay: async (replayInput) => await ctx.runQuery(
      internal.customerRequestV2.getCommandReplay,
      replayInput,
    ) as CommandReplayResult,
  })
  return result === undefined ? undefined : toActionResult(result)
}

async function loadRequestGraph(ctx: ActionCtx, networkId: string): Promise<RequestGraph | Readonly<{ kind: 'unavailable' }>> {
  return await loadRequestGraphApplication(networkId, {
    listEligible: async (id) => await ctx.runQuery(
      internal.capabilitySupply.listEligible, { networkId: id, limit: 64 },
    ) as EligibleSupplyResult,
    getActiveExact: async (contractRef) => await ctx.runQuery(
      internal.capabilityContractDocuments.getActiveExactInternal, contractRef,
    ) as ExactContractResult,
  }, {
    maximumDescriptorBytes: MAX_INTERPRETER_DESCRIPTOR_BYTES,
    maximumContractProjectedInputSchemaBytes: MAX_CONTRACT_PROJECTED_INPUT_SCHEMA_BYTES,
  })
}

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
type StoredPreparation = Infer<typeof durableActionPreparationV2Value>

async function projectCurrentRoutePlans(
  ctx: ActionCtx,
  aggregate: StoredAggregate,
): Promise<CustomerRequestActionResult> {
  let material: RoutePlanProjectionMaterial
  try {
    material = await ctx.runQuery(internal.customerRequestV2.getCurrentRoutePlanProjectionMaterial, {
      requestId: aggregate.snapshot.requestId,
    }) as RoutePlanProjectionMaterial
  } catch (error) {
    console.error('customer_request_route_plan_projection_failed', error)
    return projectNeedsAttention({
      requestRef: aggregate.snapshot.requestId,
      revision: aggregate.snapshot.revision,
      summary: 'AE could not verify the current ways forward. Try this request again.',
    })
  }
  return projectRoutePlansFromMaterial(
    aggregate,
    material,
    Date.now(),
    (error) => {
      console.error('customer_request_route_plan_projection_invalid', error)
    },
  )
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

async function runPreparationEgress(
  ctx: ActionCtx,
  aggregate: StoredAggregate,
  preparation: Extract<StoredPreparation, { kind: 'ready_for_routing' }>,
  command: Readonly<{ principalId: string; commandKey: string; commandDigest: string }>,
): Promise<ActionResult> {
  return toActionResult(await runPreparationEgressApplication(
    aggregate, preparation, command, preparationEgressPorts(ctx),
  ))
}

async function recoverUnresolvedEgress(
  ctx: ActionCtx,
  aggregate: StoredAggregate,
): Promise<ActionResult | undefined> {
  const result = await recoverUnresolvedEgressApplication(
    aggregate, preparationEgressPorts(ctx),
  )
  return result === undefined ? undefined : toActionResult(result)
}

function writableView(view: CustomerRequestView): Infer<typeof customerView> {
  const {
    disclosureReview, dataHandling, unsupportedRecovery, optionSet, clarification, preparedAction,
    businesses, action, progress, activity, recovery, decision, confirmation,
  } = view
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
    ...(dataHandling === undefined ? {} : { dataHandling: { ...dataHandling } }),
    ...(unsupportedRecovery === undefined ? {} : {
      unsupportedRecovery: {
        ...unsupportedRecovery,
        nextStep: { ...unsupportedRecovery.nextStep },
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
    ...(businesses === undefined ? {} : {
      businesses: businesses.map((business) => ({ ...business })),
    }),
    ...(action === undefined ? {} : { action: {
      state: action.state, resolution: action.resolution, automaticRetry: action.automaticRetry,
      observedAt: action.observedAt,
      ...(action.result === undefined ? {} : { result: structuredClone(action.result) }),
    } }),
    ...(progress === undefined ? {} : { progress: {
      completed: progress.completed, total: progress.total, current: { ...progress.current },
      ...(progress.dependencies === undefined ? {} : {
        dependencies: {
          completed: progress.dependencies.completed.map((step) => ({ ...step })),
          blocked: progress.dependencies.blocked.map((step) => ({ ...step })),
        },
      }),
    } }),
    ...(activity === undefined ? {} : { activity: {
      actor: activity.actor, certainty: activity.certainty, updatedAt: activity.updatedAt,
      retry: activity.retry,
      cancellation: writableActivityCancellation(activity.cancellation, activity.updatedAt),
      safeNextAction: activity.safeNextAction,
      ...(activity.nextCheckAt === undefined ? {} : { nextCheckAt: activity.nextCheckAt }),
    } }),
    ...(recovery === undefined ? {} : { recovery: {
      state: recovery.state,
      restoredAt: recovery.restoredAt,
      workRestarted: recovery.workRestarted,
      ...(recovery.reason === undefined ? {} : { reason: recovery.reason }),
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

function withRestoredRequest(result: ActionResult, restoredAt: number): ActionResult {
  if (result.kind !== 'request') return result
  return {
    ...result,
    recovery: {
      state: 'restored',
      reason: result.decision?.outcome.kind === 'routes_expired'
        ? 'choice_expired'
        : 'request_restored',
      restoredAt,
      workRestarted: false,
    },
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

function writableActivityCancellation(
  cancellation: NonNullable<CustomerRequestView['activity']>['cancellation'],
  updatedAt: number,
) {
  if (typeof cancellation !== 'string') {
    if (cancellation.state !== 'not_available') return { ...cancellation }
    return {
      state: cancellation.state,
      reason: cancellation.reason,
      changedAt: cancellation.changedAt,
      ...(cancellation.requestedAt === undefined ? {} : { requestedAt: cancellation.requestedAt }),
    }
  }
  if (cancellation === 'available_before_next_step') {
    return {
      state: 'available' as const,
      until: 'before_next_step_release' as const,
      releaseMayStartAt: updatedAt,
    }
  }
  return {
    state: 'not_available' as const,
    reason: cancellation === 'complete' ? 'request_finished' as const : 'business_step_released' as const,
    changedAt: updatedAt,
  }
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
  ownerId: string
}>

async function resolveRequestCaller(
  ctx: ActionCtx,
  operation: 'submit' | 'compare' | 'confirm' | 'allow_repeat' | 'use_repeat' | 'inspect_repeat' | 'revoke_repeat' | 'run' | 'cancel' | 'report' | 'reply' | 'evidence' | 'authorize' | 'resume' | 'facts' | 'refine',
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
            ownerId: agentPrincipal.ownerId,
          }
        }
      }
    }
    return {
      principalId: identity.tokenIdentifier,
      delegatedAgentId: delegatedAgentId ?? identity.tokenIdentifier,
      ownerId: identity.subject,
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
          ownerId: assertion.ownerId,
        }
      }
    }
  }
  return {
    principalId: assertion.principalId,
    delegatedAgentId: assertion.principalId,
    ownerId: assertion.ownerId,
  }
}

function namespacedKey(principalId: string, operation: string, requestRef: string, callerKey: string): string {
  return `${operation}:${canonicalDigest({ principalId, requestRef, callerKey })}`
}

