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
  message: boundedText(2_000),
}).strict()

export const customerRequestFactInputSchema = z.object({
  idempotencyKey: boundedText(200), expectedRevision: safePositiveInteger,
  requirementKey: boundedText(300), value: customerRequestJsonValueSchema,
}).strict()

export const customerRequestOptionsInputSchema = z.object({
  revision: safePositiveInteger, idempotencyKey: boundedText(200),
}).strict()

export const customerRequestAuthorizationInputSchema = z.object({
  revision: safePositiveInteger, preparationRef: boundedText(300), idempotencyKey: boundedText(200),
}).strict()

export const customerRequestApprovalInputSchema = z.object({
  revision: safePositiveInteger, preparedActionRef: boundedText(300),
  maximumSpendMinor: safeNonnegativeInteger, expiresAt: safePositiveInteger,
  idempotencyKey: boundedText(200),
}).strict()

export const customerRequestActionAttemptInputSchema = z.object({
  revision: safePositiveInteger,
  approvalGrantRef: boundedText(500).startsWith('approval-grant:v2:'),
  idempotencyKey: boundedText(200),
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

const customerRoutePlanSchema = z.object({
  routeRef: z.string(),
  stepCount: safePositiveInteger,
  providers: z.array(z.object({ businessRef: z.string() }).strict()).min(1),
  maximumTotalCost: z.union([
    z.object({ kind: z.literal('known'), currency: z.string(), amountMinor: safeNonnegativeInteger }).strict(),
    z.object({ kind: z.literal('requires_preparation') }).strict(),
  ]),
  dataUse: z.object({ recipientCount: safeNonnegativeInteger, purposes: z.array(z.string()) }).strict(),
  effects: z.object({ totalCount: safeNonnegativeInteger, irreversibleCount: safeNonnegativeInteger }).strict(),
  evidence: z.object({ requirementCount: safeNonnegativeInteger }).strict(),
  validUntil: safePositiveInteger,
  fallbacks: z.array(z.object({
    alternativeRouteRef: z.string(), when: z.literal('route_unavailable_before_approval'),
  }).strict()),
  uncertainty: z.array(z.literal('cost_requires_preparation')),
  comparison: z.object({
    fit: z.literal('all_steps_viable'), completeness: z.literal('complete'),
    trust: z.literal('registered_live_supply'),
    ordering: z.union([
      z.object({ kind: z.literal('unranked') }).strict(),
      z.object({
        kind: z.literal('ranked'), objective: z.literal('lowest_maximum_price'), position: safePositiveInteger,
      }).strict(),
    ]),
  }).strict(),
  authority: z.literal('proposal_only'),
}).strict()

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
  approval: z.union([
    z.object({ state: z.literal('required') }).strict(),
    z.object({
      state: z.literal('recorded'), currency: z.string(), maximumSpendMinor: safeNonnegativeInteger,
      expiresAt: safePositiveInteger, recordedAt: safeNonnegativeInteger,
    }).strict(),
  ]),
}).strict()

export const customerRequestViewSchema = z.object({
  kind: z.literal('request'), requestRef: z.string(), revision: safeNonnegativeInteger,
  state: z.enum([
    'needs_information', 'ready_to_compare', 'routes_ready', 'preparing_options', 'options_ready', 'no_options',
    'needs_authorization', 'unsupported', 'needs_attention', 'outcome_unknown', 'completed', 'failed',
  ]),
  summary: z.string(),
  nextAction: z.enum([
    'provide_information', 'prepare_options', 'inspect_routes', 'wait', 'inspect_options', 'revise_request',
    'review_disclosure', 'retry', 'none',
  ]),
  missingFields: z.array(z.object({ field: z.string(), label: z.string(), explanation: z.string() }).strict()),
  criteria: z.array(z.object({
    label: z.string(), value: customerRequestJsonValueSchema,
    basis: z.enum(['customer_provided', 'extracted_from_request']),
  }).strict()).optional(),
  disclosureReview: z.object({
    purpose: z.string(), maximumRecipients: safeNonnegativeInteger,
    categories: z.array(z.object({
      label: z.string(), classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
    }).strict()),
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
  routes: z.array(customerRoutePlanSchema).optional(),
  preparedAction: customerPreparedActionSchema.optional(),
  action: z.object({
    state: z.enum(['unknown', 'completed', 'failed']),
    resolution: z.enum(['awaiting_evidence', 'provider_result', 'reconciled']),
    automaticRetry: z.literal(false), result: customerRequestJsonValueSchema.optional(), observedAt: safeNonnegativeInteger,
  }).strict().optional(),
}).strict()

export const customerRequestConflictSchema = z.object({
  kind: z.literal('conflict'), requestRef: z.string(),
  reason: z.enum(['revision_changed', 'identity_changed', 'idempotency_key_reused']),
}).strict()

export const customerRequestRefusalSchema = z.object({
  kind: z.literal('refused'),
  reason: z.enum([
    'authentication_required', 'request_not_found', 'interpreter_unavailable', 'capabilities_unavailable',
  ]),
}).strict()

export const customerRequestAgentResultSchema = z.union([
  customerRequestViewSchema, customerRequestConflictSchema, customerRequestRefusalSchema,
])

export const customerRequestInspectResultSchema = z.union([
  customerRequestViewSchema,
  z.object({
    kind: z.literal('refused'), reason: z.enum(['authentication_required', 'request_not_found']),
  }).strict(),
])

export const customerRequestApprovalResultSchema = z.union([
  z.object({
    kind: z.literal('approved'), requestRef: z.string(), revision: safePositiveInteger,
    approvalRef: z.string(), preparedActionRef: z.string(),
    spend: z.object({ currency: z.string(), maximumAmountMinor: safeNonnegativeInteger }).strict(),
    expiresAt: safePositiveInteger,
    recovery: z.object({ unknownOutcome: z.literal('reconcile_only'), automaticRetry: z.literal(false) }).strict(),
  }).strict(),
  z.object({
    kind: z.literal('conflict'), requestRef: z.string(),
    reason: z.enum(['revision_changed', 'idempotency_key_reused', 'approval_changed']),
  }).strict(),
  z.object({
    kind: z.literal('refused'), reason: z.enum(['authentication_required', 'request_not_found', 'approval_invalid']),
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
export type CustomerPreparedAction = DeepReadonly<z.infer<typeof customerPreparedActionSchema>>
export type CustomerRequestView = DeepReadonly<z.infer<typeof customerRequestViewSchema>>
export type CustomerRequestApprovalResult = DeepReadonly<z.infer<typeof customerRequestApprovalResultSchema>>
