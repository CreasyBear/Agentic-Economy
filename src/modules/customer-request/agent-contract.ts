import { z } from 'zod'

export const CUSTOMER_REQUEST_AGENT_SCOPE = 'customer_requests:create' as const

export const CUSTOMER_REQUEST_AGENT_ENTRYPOINT = Object.freeze({
  contract: 'Customer Request V2' as const,
  method: 'POST' as const,
  path: '/api/v1/requests' as const,
  authentication: 'clerk_api_key' as const,
  requiredScope: CUSTOMER_REQUEST_AGENT_SCOPE,
})

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum)
const safeNonnegativeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const safePositiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

export const customerRequestJsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string().max(8_000),
  z.array(customerRequestJsonValueSchema).max(256),
  z.record(z.string(), customerRequestJsonValueSchema),
]))

export const customerRequestSubmitInputSchema = z.object({
  idempotencyKey: boundedText(200), requestRef: boundedText(200),
  expectedRevision: safeNonnegativeInteger.optional(), agentRef: boundedText(200),
  request: boundedText(2_000),
  routing: z.object({
    network: boundedText(200).default('ae:public'),
    currency: z.string().regex(/^[A-Z]{3}$/u).optional(),
    maximumSpendMinor: safeNonnegativeInteger.optional(),
    optimizeFor: z.enum(['cost', 'latency']).optional(),
  }).strict().default({ network: 'ae:public' }),
}).strict()

export const customerRequestMessageInputSchema = z.object({
  idempotencyKey: boundedText(200), expectedRevision: safePositiveInteger,
  message: boundedText(2_000), mode: z.enum(['append', 'replace']).default('append'),
}).strict()

export const customerRequestFactInputSchema = z.object({
  idempotencyKey: boundedText(200), expectedRevision: safePositiveInteger,
  requirementKey: boundedText(300), value: customerRequestJsonValueSchema,
}).strict()

export const customerRequestOptionsInputSchema = z.object({
  revision: safePositiveInteger, idempotencyKey: boundedText(200),
}).strict()

export const customerRequestRouteConfirmationInputSchema = z.object({
  revision: safePositiveInteger, routeRef: boundedText(300), idempotencyKey: boundedText(200),
}).strict()

export const customerRequestRouteActionInputSchema = z.strictObject({
  idempotencyKey: boundedText(200),
})

export const customerRequestProblemInputSchema = z.strictObject({
  idempotencyKey: boundedText(200),
  category: z.enum(['incorrect_result', 'unexpected_cost', 'privacy_concern', 'could_not_stop', 'other']),
  summary: boundedText(1_000),
  affectedStep: safePositiveInteger.optional(),
  evidenceReceiptRefs: z.array(boundedText(300)).max(20).default([]),
  visibility: z.enum(['customer_and_ae_only', 'share_with_affected_business']).default('customer_and_ae_only'),
})

export const customerRequestProblemReplyInputSchema = z.strictObject({
  expectedVersion: safeNonnegativeInteger,
  idempotencyKey: boundedText(200),
  message: boundedText(1_000),
})

export const customerRequestProblemStatusChangeSchema = z.union([
  z.strictObject({
    kind: z.enum(['problem_status_updated', 'problem_reply_recorded']),
    reportRef: z.string(),
    version: safePositiveInteger,
    state: z.enum(['investigating', 'waiting_for_customer', 'closed']),
    nextAction: z.enum(['await_status_update', 'provide_information', 'none']),
    nextActor: z.enum(['ae', 'customer', 'none']),
    nextUpdateDueAt: safeNonnegativeInteger.optional(),
    decisionAuthority: z.literal('not_assigned'),
    recordedAt: safeNonnegativeInteger,
  }),
  z.strictObject({
    kind: z.literal('conflict'),
    reportRef: z.string(),
    reason: z.enum(['idempotency_key_reused', 'stale_version']),
  }),
  z.strictObject({
    kind: z.literal('refused'),
    reason: z.enum([
      'authentication_required',
      'authority_denied',
      'request_not_found',
      'report_not_found',
      'invalid_update',
    ]),
  }),
])

const customerRequestProblemProjectionSchema = z.strictObject({
  category: z.enum(['incorrect_result', 'unexpected_cost', 'privacy_concern', 'could_not_stop', 'other']),
  claimSource: z.literal('customer'),
  causality: z.literal('unknown'),
  resolution: z.literal('not_adjudicated'),
  nextAction: z.enum(['await_status_update', 'check_status', 'provide_information', 'none']),
  nextActor: z.enum(['ae', 'customer', 'none']),
  nextUpdateDueAt: safeNonnegativeInteger.optional(),
  decisionAuthority: z.literal('not_assigned'),
  visibility: z.enum(['customer_and_ae_only', 'share_with_affected_business']),
  evidence: z.array(z.strictObject({ receiptRef: z.string(), label: z.string() })),
  affected: z.strictObject({
    step: safePositiveInteger,
    attemptRef: z.string().optional(),
    business: z.string().optional(),
  }),
})

export const customerRequestProblemReceiptSchema = z.strictObject({
  kind: z.literal('problem_reported'), requestRef: z.string(), reportRef: z.string(),
  state: z.literal('received'), reportedAt: safeNonnegativeInteger,
  problem: customerRequestProblemProjectionSchema.optional(),
})

export const customerRequestEvidenceExportSchema = z.strictObject({
  kind: z.literal('evidence'), requestRef: z.string(),
  state: z.enum(['queued', 'running', 'outcome_unknown', 'completed', 'failed', 'cancelled']),
  generatedAt: safeNonnegativeInteger,
  steps: z.array(z.strictObject({
    step: safePositiveInteger,
    state: z.enum(['queued', 'contacting', 'awaiting_result', 'completed', 'failed', 'outcome_unknown', 'cancelled']),
    observedAt: safeNonnegativeInteger,
    evidence: z.array(z.strictObject({ receiptRef: z.string(), label: z.string() })),
  })),
  problems: z.array(customerRequestProblemProjectionSchema.extend({
    reportRef: z.string(),
    version: safeNonnegativeInteger.default(0),
    state: z.enum(['received', 'update_due', 'investigating', 'waiting_for_customer', 'closed']),
    summary: boundedText(1_000),
    reportedAt: safeNonnegativeInteger,
    history: z.array(z.strictObject({
      version: safeNonnegativeInteger,
      state: z.enum(['received', 'investigating', 'waiting_for_customer', 'closed']),
      source: z.enum(['customer', 'ae_support']),
      message: boundedText(1_000),
      recordedAt: safeNonnegativeInteger,
    })).default([]),
  }).strict()).default([]),
  result: customerRequestJsonValueSchema.optional(),
})

export const customerRequestAuthorizationInputSchema = z.object({
  revision: safePositiveInteger, preparationRef: boundedText(300), idempotencyKey: boundedText(200),
}).strict()

const moneySchema = z.object({ currency: z.string(), amountMinor: safeNonnegativeInteger }).strict()
const customerOptionSchema = z.object({
  optionRef: z.string(), business: z.object({ name: z.string() }).strict(),
  expectedCost: moneySchema, maximumCost: moneySchema,
  expectedLatencyMs: safeNonnegativeInteger,
  priceComponents: z.array(z.object({ label: z.string(), amountMinor: safeNonnegativeInteger }).strict()),
  comparableOutputs: z.array(z.object({
    label: z.string(), value: z.union([z.string(), z.number(), z.boolean()]),
  }).strict()),
  materialTerms: z.array(z.string()),
  cancellation: z.object({
    kind: z.enum(['supported', 'conditional', 'unsupported']), summary: z.string(),
  }).strict(),
  commercialInfluence: z.union([
    z.object({ status: z.literal('unknown') }).strict(),
    z.object({ status: z.literal('none'), summary: z.string() }).strict(),
    z.object({
      status: z.literal('disclosed'), relationship: z.enum(['commission', 'sponsorship', 'rebate', 'ownership', 'other']),
      summary: z.string(), payerName: z.string(), beneficiaryName: z.string(), compensationBasis: z.string(),
      influencesEligibility: z.boolean(), influencesInclusion: z.boolean(), influencesOrder: z.boolean(),
    }).strict(),
  ]),
  expiresAt: safePositiveInteger,
  provenance: z.object({
    kind: z.literal('provider_assertion'), observedAt: safeNonnegativeInteger.optional(), validUntil: safePositiveInteger,
  }).strict(),
}).strict()

const orderingSchema = z.union([
  z.object({
    kind: z.literal('not_applicable'), commercialInfluence: z.enum(['none', 'disclosed', 'unknown']),
  }).strict(),
  z.object({
    kind: z.literal('unranked'), commercialInfluence: z.enum(['none', 'disclosed', 'unknown']),
  }).strict(),
  z.object({
    kind: z.literal('recommended'), commercialInfluence: z.enum(['none', 'disclosed']),
    objective: z.literal('lowest_maximum_price'), optionRef: z.string(), evidenceRef: z.string(),
    reasons: z.array(z.string()), tradeoffs: z.array(z.string()),
  }).strict(),
])

const customerOptionSetSchema = z.object({
  cardinality: z.enum(['none', 'single', 'multiple']), optionCount: safeNonnegativeInteger,
  ordering: orderingSchema,
  coverage: z.object({
    evaluated: safeNonnegativeInteger, optionsReceived: safeNonnegativeInteger,
    unavailable: safeNonnegativeInteger, pending: safeNonnegativeInteger, uncertain: safeNonnegativeInteger,
    businesses: z.array(z.object({
      name: z.string(),
      status: z.enum(['not_contacted', 'contact_pending', 'contacted', 'option_received', 'unavailable', 'uncertain']),
      explanation: z.string(),
    }).strict()),
  }).strict(),
  options: z.array(customerOptionSchema),
}).strict()

const customerBusinessSchema = z.object({ businessRef: z.string(), name: z.string() }).strict()
const customerRouteMaximumCostSchema = z.union([
  z.object({ kind: z.literal('known'), currency: z.string(), amountMinor: safeNonnegativeInteger }).strict(),
  z.object({ kind: z.literal('requires_preparation') }).strict(),
])
const customerRouteRecipientSchema = z.object({
  recipientRef: z.string(), name: z.string(), purposes: z.array(z.string()),
  fields: z.array(z.object({
    fieldRef: z.string(), label: z.string(),
    classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
  }).strict()),
}).strict()
const customerRouteEffectSchema = z.object({
  kind: z.enum(['information_shared', 'financial_commitment', 'external_change']),
  reversibility: z.enum(['not_applicable', 'reversible', 'conditional', 'irreversible']),
}).strict()
const customerRouteEvidenceSchema = z.object({
  label: z.string(), purpose: z.enum(['comparison', 'completion', 'recovery']),
}).strict()
const customerRouteRecoverySchema = z.object({
  step: safePositiveInteger, businessName: z.string(), posture: z.enum(['retry_safe', 'reconcile_required']),
}).strict()
const customerRouteFallbackSchema = z.object({
  available: z.boolean(),
  alternatives: z.array(z.object({
    routeRef: z.string(), when: z.literal('route_unavailable_before_confirmation'),
  }).strict()),
}).strict()
const customerRouteResultSchema = z.object({
  resultRef: z.string(), summary: z.string(), deliverables: z.array(z.string()),
}).strict()
const customerRouteResultChangeSchema = customerRouteResultSchema.extend({
  position: safePositiveInteger.optional(),
}).strict()

const customerRouteCommercialInfluenceSchema = z.union([
  z.object({ status: z.literal('unknown') }).strict(),
  z.object({ status: z.literal('none'), evidenceRefs: z.array(z.string()) }).strict(),
  z.object({
    status: z.literal('disclosed'), summaries: z.array(z.string()).min(1),
    evidenceRefs: z.array(z.string()).min(1), affectsDecision: z.boolean(),
  }).strict(),
])

const customerRouteComparisonEvidenceSchema = z.object({
  outcomeRef: z.string(),
  outcomeFit: z.enum(['same_promised_result', 'different_promised_result']),
  completeness: z.literal('complete'), hardConstraints: z.literal('satisfied'),
  maximumCost: customerRouteMaximumCostSchema,
  dataExposureCount: safeNonnegativeInteger, irreversibleEffectCount: safeNonnegativeInteger,
  uncertaintyCount: safeNonnegativeInteger, duration: z.literal('not_declared'),
  recovery: z.enum(['retry_safe', 'reconcile_required']), trust: z.literal('registered_current_option'),
  evidenceCount: safeNonnegativeInteger,
  freshness: z.object({
    state: z.enum(['current', 'expired']), validUntil: safePositiveInteger,
  }).strict(),
  commercialInfluence: customerRouteCommercialInfluenceSchema,
}).strict()

const customerRoutePlanSchema = z.object({
  routeRef: z.string(),
  quoteDigest: z.string(),
  result: customerRouteResultSchema,
  availability: z.enum(['current', 'expired']),
  stepCount: safePositiveInteger,
  businesses: z.array(customerBusinessSchema).min(1),
  maximumTotalCost: customerRouteMaximumCostSchema,
  dataUse: z.object({
    recipientCount: safeNonnegativeInteger,
    recipients: z.array(customerRouteRecipientSchema),
    purposes: z.array(z.string()),
  }).strict(),
  effects: z.array(customerRouteEffectSchema),
  evidence: z.array(customerRouteEvidenceSchema),
  recovery: z.array(customerRouteRecoverySchema),
  cancellation: z.object({
    kind: z.enum(['available', 'partially_available', 'unavailable']), summary: z.string(),
  }).strict(),
  validUntil: safePositiveInteger,
  fallback: customerRouteFallbackSchema,
  uncertainty: z.array(z.literal('price_needs_confirmation')),
  comparison: customerRouteComparisonEvidenceSchema,
  steps: z.array(z.object({
    step: safePositiveInteger, business: customerBusinessSchema, after: z.array(safePositiveInteger),
  }).strict()).optional(),
}).strict()

export const customerRouteConfirmationSchema = z.object({
  confirmationRef: z.string(), generationRef: z.string(), requestRevision: safePositiveInteger,
  confirmedAt: safeNonnegativeInteger, validUntil: safePositiveInteger,
  route: customerRoutePlanSchema,
}).strict()

const customerRouteDecisionChangeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('route_result'),
    before: z.object({ routeCount: safeNonnegativeInteger, results: z.array(customerRouteResultChangeSchema) }).strict(),
    after: z.object({ routeCount: safeNonnegativeInteger, results: z.array(customerRouteResultChangeSchema) }).strict(),
  }).strict(),
  z.object({
    kind: z.literal('businesses'),
    before: z.array(z.object({
      resultRef: z.string(), businesses: z.array(customerBusinessSchema),
    }).strict()),
    after: z.array(z.object({
      resultRef: z.string(), businesses: z.array(customerBusinessSchema),
    }).strict()),
  }).strict(),
  z.object({
    kind: z.literal('step_shape'),
    before: z.array(z.object({
      resultRef: z.string(), steps: safePositiveInteger, dependencies: safeNonnegativeInteger,
    }).strict()),
    after: z.array(z.object({
      resultRef: z.string(), steps: safePositiveInteger, dependencies: safeNonnegativeInteger,
    }).strict()),
  }).strict(),
  z.object({
    kind: z.literal('maximum_cost'),
    before: z.array(z.object({ resultRef: z.string(), cost: customerRouteMaximumCostSchema }).strict()),
    after: z.array(z.object({ resultRef: z.string(), cost: customerRouteMaximumCostSchema }).strict()),
  }).strict(),
  z.object({
    kind: z.literal('data_use'),
    before: z.array(z.object({
      resultRef: z.string(), recipients: z.array(customerRouteRecipientSchema),
    }).strict()),
    after: z.array(z.object({
      resultRef: z.string(), recipients: z.array(customerRouteRecipientSchema),
    }).strict()),
  }).strict(),
  z.object({
    kind: z.literal('effects'),
    before: z.array(z.object({ resultRef: z.string(), effects: z.array(customerRouteEffectSchema) }).strict()),
    after: z.array(z.object({ resultRef: z.string(), effects: z.array(customerRouteEffectSchema) }).strict()),
  }).strict(),
  z.object({
    kind: z.literal('evidence'),
    before: z.array(z.object({ resultRef: z.string(), evidence: z.array(customerRouteEvidenceSchema) }).strict()),
    after: z.array(z.object({ resultRef: z.string(), evidence: z.array(customerRouteEvidenceSchema) }).strict()),
  }).strict(),
  z.object({
    kind: z.literal('uncertainty'),
    before: z.array(z.object({
      resultRef: z.string(), uncertainty: z.array(z.literal('price_needs_confirmation')),
    }).strict()),
    after: z.array(z.object({
      resultRef: z.string(), uncertainty: z.array(z.literal('price_needs_confirmation')),
    }).strict()),
  }).strict(),
  z.object({
    kind: z.literal('expiry'),
    before: z.array(z.object({ resultRef: z.string(), validUntil: safePositiveInteger }).strict()),
    after: z.array(z.object({ resultRef: z.string(), validUntil: safePositiveInteger }).strict()),
  }).strict(),
  z.object({
    kind: z.literal('fallback'),
    before: z.array(z.object({
      resultRef: z.string(), alternatives: z.array(customerRouteResultSchema),
    }).strict()),
    after: z.array(z.object({
      resultRef: z.string(), alternatives: z.array(customerRouteResultSchema),
    }).strict()),
  }).strict(),
  z.object({
    kind: z.literal('recovery'),
    before: z.array(z.object({
      resultRef: z.string(), steps: z.array(customerRouteRecoverySchema),
    }).strict()),
    after: z.array(z.object({
      resultRef: z.string(), steps: z.array(customerRouteRecoverySchema),
    }).strict()),
  }).strict(),
  z.object({
    kind: z.literal('cancellation'),
    before: z.array(z.object({
      resultRef: z.string(), cancellation: z.object({
        kind: z.enum(['available', 'partially_available', 'unavailable']), summary: z.string(),
      }).strict(),
    }).strict()),
    after: z.array(z.object({
      resultRef: z.string(), cancellation: z.object({
        kind: z.enum(['available', 'partially_available', 'unavailable']), summary: z.string(),
      }).strict(),
    }).strict()),
  }).strict(),
])

export const customerRoutePlanDecisionSchema = z.strictObject({
  generationRef: z.string(), requestRevision: safePositiveInteger,
  outcome: z.object({
    kind: z.enum(['routes_available', 'routes_expired']), routeCount: safePositiveInteger, summary: z.string(),
  }).strict(),
  routes: z.array(customerRoutePlanSchema).min(1),
  comparison: z.union([
    z.object({ kind: z.literal('single'), summary: z.string() }).strict(),
    z.object({
      kind: z.literal('recommended'), summary: z.string(), routeRef: z.string(),
      objective: z.literal('lowest_maximum_price'), evidenceRef: z.string(),
      commercialInfluence: z.enum(['none', 'disclosed']), reasons: z.array(z.string()).min(1),
      tradeoffs: z.array(z.string()).min(1),
    }).strict(),
    z.object({
      kind: z.literal('unranked'),
      reason: z.enum([
        'customer_preference_absent', 'tie', 'commercial_influence',
        'stale_evidence', 'comparison_evidence_missing', 'ranking_evidence_invalid',
      ]),
      summary: z.string(),
    }).strict(),
    z.object({
      kind: z.literal('incomparable'), summary: z.string(),
      groups: z.array(z.object({ outcomeRef: z.string(), routeRefs: z.array(z.string()).min(1) }).strict()).min(2),
    }).strict(),
  ]),
  actions: z.strictObject({
    review: z.strictObject({
      kind: z.literal('inspect_current_option'), createsAuthority: z.literal(false),
      startsWork: z.literal(false), summary: z.string(),
    }),
    confirm: z.strictObject({
      kind: z.literal('confirm_current_option'), createsAuthority: z.literal(true),
      startsWork: z.literal(false), summary: z.string(),
    }),
    start: z.strictObject({
      kind: z.literal('start_confirmed_option'), availableAfter: z.literal('confirmation'),
      startsWork: z.literal(true), summary: z.string(),
    }),
    change: z.strictObject({
      kind: z.literal('revise_request'), createsAuthority: z.literal(false), startsWork: z.literal(false),
      preservesRequest: z.literal(true), summary: z.string(),
    }),
    decline: z.strictObject({
      kind: z.literal('leave_unconfirmed'), createsAuthority: z.literal(false), startsWork: z.literal(false),
      preservesRequest: z.literal(true), summary: z.string(),
    }),
  }),
  changes: z.union([
    z.object({ kind: z.literal('initial') }).strict(),
    z.object({ kind: z.literal('unchanged'), previousGenerationRef: z.string() }).strict(),
    z.object({
      kind: z.literal('changed'), previousGenerationRef: z.string(),
      items: z.array(customerRouteDecisionChangeSchema).min(1),
    }).strict(),
  ]),
  nextBoundary: z.object({ kind: z.literal('confirmation'), authorityCreated: z.literal(false) }).strict(),
})

export const customerPreparedActionSchema = z.object({
  actionRef: z.string(), businessName: z.string(), offeringLabel: z.string(), summary: z.string(),
  price: z.object({
    currency: z.string(), minimumAmountMinor: safeNonnegativeInteger, maximumAmountMinor: safeNonnegativeInteger,
  }).strict(),
  materialTerms: z.array(z.object({ label: z.string(), value: z.string() }).strict()),
  cancellation: z.object({ kind: z.enum(['available', 'unsupported']) }).strict(),
  validUntil: safePositiveInteger,
  selection: z.object({
    basis: z.enum(['single_option', 'lowest_maximum_price']),
    alternativeCount: safeNonnegativeInteger, unavailableCount: safeNonnegativeInteger,
    commercialInfluence: z.enum(['none', 'disclosed']),
  }).strict(),
  dataUse: z.object({
    categories: z.array(z.object({
      label: z.string(), classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
    }).strict()),
    purposes: z.array(z.string()),
  }).strict(),
  effects: z.array(z.object({
    class: z.enum(['data_release', 'financial_exposure', 'external_state_change']),
    reversibility: z.enum(['not_applicable', 'reversible', 'conditional', 'irreversible']),
  }).strict()),
  alternatives: z.array(z.object({
    businessName: z.string(),
    price: z.object({
      currency: z.string(), minimumAmountMinor: safeNonnegativeInteger, maximumAmountMinor: safeNonnegativeInteger,
    }).strict(),
    validUntil: safePositiveInteger,
  }).strict()),
}).strict()

const customerRequestAgentNavigationInputValueSchema = z.union([
  z.string(), z.number(), z.boolean(), z.null(), z.array(z.string()),
])

export const customerRequestAgentNavigationSchema = z.strictObject({
  current: z.string(),
  actions: z.array(z.strictObject({
    relation: z.enum([
      'answer_clarification', 'prepare_options', 'change_request', 'confirm_option', 'start_confirmed_option',
      'inspect_progress', 'inspect_evidence', 'cancel', 'report_problem',
    ]),
    method: z.enum(['GET', 'POST']),
    href: z.string(),
    summary: z.string(),
    input: z.record(z.string(), customerRequestAgentNavigationInputValueSchema).optional(),
  })),
})

export const customerRequestViewSchema = z.strictObject({
  kind: z.literal('request'), requestRef: z.string(), revision: safeNonnegativeInteger,
  routeGenerationRef: z.string().optional(),
  state: z.enum([
    'needs_information', 'ready_to_compare', 'routes_ready', 'route_confirmed', 'in_progress', 'preparing_options', 'options_ready', 'no_options',
    'needs_authorization', 'unsupported', 'needs_attention', 'outcome_unknown', 'completed', 'failed', 'cancelled',
  ]),
  summary: z.string(),
  nextAction: z.enum([
    'provide_information', 'prepare_options', 'inspect_routes', 'inspect_confirmation', 'wait', 'inspect_options', 'revise_request',
    'review_disclosure', 'retry', 'none',
  ]),
  missingFields: z.array(z.object({ field: z.string(), label: z.string(), explanation: z.string() }).strict()),
  criteria: z.array(z.object({
    label: z.string(), value: customerRequestJsonValueSchema,
    basis: z.enum(['customer_provided', 'extracted_from_request']),
    impact: z.literal('eligibility_and_comparison'),
  }).strict()).optional(),
  disclosureReview: z.object({
    purpose: z.string(), maximumRecipients: safeNonnegativeInteger,
    categories: z.array(z.object({
      label: z.string(), classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
    }).strict()),
  }).strict().optional(),
  dataHandling: z.object({
    requestStorage: z.literal('saved_for_revision'),
    businessSharing: z.literal('not_shared'),
    explanation: z.string(),
  }).strict().optional(),
  preparationRef: z.string().optional(),
  clarification: z.union([
    z.object({
      kind: z.literal('intent_direction'), prompt: z.string(), answerKind: z.literal('natural_language'),
    }).strict(),
    z.object({
      kind: z.literal('contract_fact'), requirementKey: z.string(), prompt: z.string(),
      answerKind: z.literal('typed_value'),
    }).strict(),
  ]).optional(),
  options: z.array(customerOptionSchema), optionSet: customerOptionSetSchema.optional(),
  preparedAction: customerPreparedActionSchema.optional(),
  businesses: z.array(customerBusinessSchema).min(1).optional(),
  action: z.strictObject({
    state: z.enum(['unknown', 'completed', 'failed']),
    resolution: z.enum(['awaiting_evidence', 'provider_result', 'reconciled', 'not_sent']),
    automaticRetry: z.literal(false), result: customerRequestJsonValueSchema.optional(), observedAt: safeNonnegativeInteger,
  }).optional(),
  progress: z.object({
    completed: safeNonnegativeInteger,
    total: safePositiveInteger,
    current: z.object({
      step: safePositiveInteger,
      state: z.enum(['queued', 'contacting', 'awaiting_result', 'validating_result', 'needs_attention']),
    }).strict(),
  }).strict().optional(),
  activity: z.strictObject({
    actor: z.literal('ae_for_customer'),
    certainty: z.enum(['pending', 'unknown', 'confirmed', 'failed', 'cancelled']),
    updatedAt: safeNonnegativeInteger,
    nextCheckAt: safeNonnegativeInteger.optional(),
    retry: z.enum(['not_needed', 'blocked_until_reconciled', 'manual_after_failure']),
    cancellation: z.enum(['available_before_next_step', 'too_late_or_unsupported', 'complete']),
    safeNextAction: z.enum(['check_progress', 'wait_for_evidence', 'review_result', 'revise_request', 'none']),
  }).optional(),
  navigation: customerRequestAgentNavigationSchema.optional(),
  decision: customerRoutePlanDecisionSchema.optional(),
  confirmation: customerRouteConfirmationSchema.optional(),
}).superRefine((view, context) => {
  if (view.state === 'routes_ready' && view.decision === undefined) {
    context.addIssue({
      code: 'custom', path: ['decision'], message: 'route_decision_required',
    })
    return
  }
  if (view.decision !== undefined && ((view.decision.outcome.kind === 'routes_available' && view.state !== 'routes_ready')
    || (view.decision.outcome.kind === 'routes_expired' && view.state !== 'needs_attention')
    || view.routeGenerationRef !== view.decision.generationRef
    || view.revision !== view.decision.requestRevision)) {
    context.addIssue({
      code: 'custom', path: ['decision'], message: 'route_decision_lineage_invalid',
    })
  }
  if (view.state === 'route_confirmed' && view.confirmation === undefined) {
    context.addIssue({ code: 'custom', path: ['confirmation'], message: 'route_confirmation_required' })
  }
  if (view.state === 'in_progress' && view.progress === undefined) {
    context.addIssue({ code: 'custom', path: ['progress'], message: 'route_progress_required' })
  }
  if (view.confirmation !== undefined && (view.state !== 'route_confirmed'
    || view.routeGenerationRef !== view.confirmation.generationRef
    || view.revision !== view.confirmation.requestRevision
    || view.confirmation.route.routeRef.trim().length === 0)) {
    context.addIssue({ code: 'custom', path: ['confirmation'], message: 'route_confirmation_lineage_invalid' })
  }
})

export const customerRequestConflictSchema = z.object({
  kind: z.literal('conflict'), requestRef: z.string(),
  reason: z.enum(['revision_changed', 'options_changed', 'identity_changed', 'idempotency_key_reused']),
}).strict()

export const customerRequestRefusalSchema = z.object({
  kind: z.literal('refused'),
  reason: z.enum([
    'authentication_required', 'request_not_found', 'interpreter_unavailable', 'capabilities_unavailable',
    'evidence_not_found',
  ]),
}).strict()

export const customerRequestAgentResultSchema = z.union([
  customerRequestViewSchema, customerRequestConflictSchema, customerRequestRefusalSchema,
])

export const customerRequestProblemResultSchema = z.union([
  customerRequestProblemReceiptSchema, customerRequestConflictSchema, customerRequestRefusalSchema,
])

export const customerRequestEvidenceResultSchema = z.union([
  customerRequestEvidenceExportSchema, customerRequestRefusalSchema,
])

export const customerRequestInspectResultSchema = z.union([
  customerRequestViewSchema,
  z.object({
    kind: z.literal('refused'), reason: z.enum(['authentication_required', 'request_not_found']),
  }).strict(),
])

type DeepReadonly<Value> = Value extends (...args: never[]) => unknown
  ? Value
  : Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value

export type CustomerOption = DeepReadonly<z.infer<typeof customerOptionSchema>>
export type CustomerOptionSet = DeepReadonly<z.infer<typeof customerOptionSetSchema>>
export type CustomerRoutePlan = DeepReadonly<z.infer<typeof customerRoutePlanSchema>>
export type CustomerRoutePlanDecision = DeepReadonly<z.infer<typeof customerRoutePlanDecisionSchema>>
export type CustomerRouteConfirmation = DeepReadonly<z.infer<typeof customerRouteConfirmationSchema>>
export type CustomerRequestRouteConfirmationInput = DeepReadonly<z.infer<typeof customerRequestRouteConfirmationInputSchema>>
export type CustomerRequestRouteActionInput = DeepReadonly<z.infer<typeof customerRequestRouteActionInputSchema>>
export type CustomerRequestProblemInput = DeepReadonly<z.infer<typeof customerRequestProblemInputSchema>>
export type CustomerRequestProblemReplyInput = DeepReadonly<z.infer<typeof customerRequestProblemReplyInputSchema>>
export type CustomerRequestProblemStatusChange = DeepReadonly<z.infer<typeof customerRequestProblemStatusChangeSchema>>
export type CustomerRequestProblemReceipt = DeepReadonly<z.infer<typeof customerRequestProblemReceiptSchema>>
export type CustomerRequestEvidenceExport = DeepReadonly<z.infer<typeof customerRequestEvidenceExportSchema>>
export type CustomerRequestProblemResult = DeepReadonly<z.infer<typeof customerRequestProblemResultSchema>>
export type CustomerRequestEvidenceResult = DeepReadonly<z.infer<typeof customerRequestEvidenceResultSchema>>
export type CustomerRequestAgentResult = DeepReadonly<z.infer<typeof customerRequestAgentResultSchema>>
export type CustomerRequestAgentNavigation = DeepReadonly<z.infer<typeof customerRequestAgentNavigationSchema>>
export type CustomerPreparedAction = DeepReadonly<z.infer<typeof customerPreparedActionSchema>>
export type CustomerRequestView = DeepReadonly<z.infer<typeof customerRequestViewSchema>>
