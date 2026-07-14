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

export const customerRequestSubmitInputSchema = z.strictObject({
  idempotencyKey: boundedText(200), requestRef: boundedText(200),
  expectedRevision: safeNonnegativeInteger.optional(), agentRef: boundedText(200),
  request: boundedText(2_000),
  routing: z.strictObject({
    network: boundedText(200).default('ae:public'),
    currency: z.string().regex(/^[A-Z]{3}$/u).optional(),
    maximumSpendMinor: safeNonnegativeInteger.optional(),
    optimizeFor: z.enum(['cost', 'latency']).optional(),
  }).default({ network: 'ae:public' }),
})

export const customerRequestMessageInputSchema = z.strictObject({
  idempotencyKey: boundedText(200), expectedRevision: safePositiveInteger,
  message: boundedText(2_000),
})

export const customerRequestFactInputSchema = z.strictObject({
  idempotencyKey: boundedText(200), expectedRevision: safePositiveInteger,
  requirementKey: boundedText(300), value: customerRequestJsonValueSchema,
})

export const customerRequestOptionsInputSchema = z.strictObject({
  revision: safePositiveInteger, idempotencyKey: boundedText(200),
})

export const customerRequestAuthorizationInputSchema = z.strictObject({
  revision: safePositiveInteger, preparationRef: boundedText(300), idempotencyKey: boundedText(200),
})

export const customerRequestApprovalInputSchema = z.strictObject({
  revision: safePositiveInteger, preparedActionRef: boundedText(300),
  maximumSpendMinor: safeNonnegativeInteger, expiresAt: safePositiveInteger,
  idempotencyKey: boundedText(200),
})

export const customerRequestActionAttemptInputSchema = z.strictObject({
  revision: safePositiveInteger,
  approvalGrantRef: boundedText(500).startsWith('approval-grant:v2:'),
  idempotencyKey: boundedText(200),
})

const moneySchema = z.strictObject({ currency: z.string(), amountMinor: safeNonnegativeInteger })
const customerOptionSchema = z.strictObject({
  optionRef: z.string(), business: z.strictObject({ name: z.string() }),
  expectedCost: moneySchema, maximumCost: moneySchema,
  expectedLatencyMs: safeNonnegativeInteger,
  priceComponents: z.array(z.strictObject({ label: z.string(), amountMinor: safeNonnegativeInteger })),
  comparableOutputs: z.array(z.strictObject({
    label: z.string(), value: z.union([z.string(), z.number(), z.boolean()]),
  })),
  materialTerms: z.array(z.string()),
  cancellation: z.strictObject({
    kind: z.enum(['supported', 'conditional', 'unsupported']), summary: z.string(),
  }),
  commercialInfluence: z.union([
    z.strictObject({ status: z.literal('unknown') }),
    z.strictObject({ status: z.literal('none'), summary: z.string() }),
    z.strictObject({
      status: z.literal('disclosed'), relationship: z.enum(['commission', 'sponsorship', 'rebate', 'ownership', 'other']),
      summary: z.string(), payerName: z.string(), beneficiaryName: z.string(), compensationBasis: z.string(),
      influencesEligibility: z.boolean(), influencesInclusion: z.boolean(), influencesOrder: z.boolean(),
    }),
  ]),
  expiresAt: safePositiveInteger,
  provenance: z.strictObject({
    kind: z.literal('provider_assertion'), observedAt: safeNonnegativeInteger.optional(), validUntil: safePositiveInteger,
  }),
})

const orderingSchema = z.union([
  z.strictObject({
    kind: z.literal('not_applicable'), commercialInfluence: z.enum(['none', 'disclosed', 'unknown']),
  }),
  z.strictObject({
    kind: z.literal('unranked'), commercialInfluence: z.enum(['none', 'disclosed', 'unknown']),
  }),
  z.strictObject({
    kind: z.literal('recommended'), commercialInfluence: z.enum(['none', 'disclosed']),
    objective: z.literal('lowest_maximum_price'), optionRef: z.string(), evidenceRef: z.string(),
    reasons: z.array(z.string()), tradeoffs: z.array(z.string()),
  }),
])

const customerOptionSetSchema = z.strictObject({
  cardinality: z.enum(['none', 'single', 'multiple']), optionCount: safeNonnegativeInteger,
  ordering: orderingSchema,
  coverage: z.strictObject({
    evaluated: safeNonnegativeInteger, optionsReceived: safeNonnegativeInteger,
    unavailable: safeNonnegativeInteger, pending: safeNonnegativeInteger, uncertain: safeNonnegativeInteger,
    businesses: z.array(z.strictObject({
      name: z.string(),
      status: z.enum(['not_contacted', 'contact_pending', 'contacted', 'option_received', 'unavailable', 'uncertain']),
      explanation: z.string(),
    })),
  }),
  options: z.array(customerOptionSchema),
})

const customerRoutePlanSchema = z.strictObject({
  routeRef: z.string(),
  stepCount: safePositiveInteger,
  providers: z.array(z.strictObject({ businessRef: z.string() })).min(1),
  maximumTotalCost: z.union([
    z.strictObject({ kind: z.literal('known'), currency: z.string(), amountMinor: safeNonnegativeInteger }),
    z.strictObject({ kind: z.literal('requires_preparation') }),
  ]),
  dataUse: z.strictObject({
    recipientCount: safeNonnegativeInteger,
    recipients: z.array(z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('business'), businessRef: z.string(), purposes: z.array(z.string()) }),
      z.strictObject({ kind: z.literal('named'), recipientRef: z.string(), purposes: z.array(z.string()) }),
    ])),
    purposes: z.array(z.string()),
  }),
  effects: z.strictObject({ totalCount: safeNonnegativeInteger, irreversibleCount: safeNonnegativeInteger }),
  evidence: z.strictObject({ requirementCount: safeNonnegativeInteger }),
  recovery: z.strictObject({ steps: z.array(z.strictObject({
    stepRef: z.string(), businessRef: z.string(), posture: z.enum(['retry_safe', 'reconcile_required']),
  })) }),
  validUntil: safePositiveInteger,
  fallbacks: z.strictObject({
    ordering: z.literal('unranked'),
    alternatives: z.array(z.strictObject({
      alternativeRouteRef: z.string(), when: z.literal('route_unavailable_before_approval'),
    })),
  }),
  uncertainty: z.array(z.literal('cost_requires_preparation')),
  comparison: z.strictObject({
    fit: z.literal('all_steps_viable'), completeness: z.literal('complete'),
    trust: z.literal('registered_live_supply'),
    ordering: z.union([
      z.strictObject({ kind: z.literal('unranked') }),
      z.strictObject({
        kind: z.literal('ranked'), objective: z.literal('lowest_maximum_price'), position: safePositiveInteger,
      }),
    ]),
  }),
  authority: z.literal('proposal_only'),
})

export const customerPreparedActionSchema = z.strictObject({
  actionRef: z.string(), businessName: z.string(), offeringLabel: z.string(), summary: z.string(),
  price: z.strictObject({
    currency: z.string(), minimumAmountMinor: safeNonnegativeInteger, maximumAmountMinor: safeNonnegativeInteger,
  }),
  materialTerms: z.array(z.strictObject({ label: z.string(), value: z.string() })),
  cancellation: z.strictObject({ kind: z.enum(['available', 'unsupported']) }),
  validUntil: safePositiveInteger,
  selection: z.strictObject({
    basis: z.enum(['single_option', 'lowest_maximum_price']),
    alternativeCount: safeNonnegativeInteger, unavailableCount: safeNonnegativeInteger,
    commercialInfluence: z.enum(['none', 'disclosed']),
  }),
  dataUse: z.strictObject({
    categories: z.array(z.strictObject({
      label: z.string(), classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
    })),
    purposes: z.array(z.string()),
  }),
  effects: z.array(z.strictObject({
    class: z.enum(['data_release', 'financial_exposure', 'external_state_change']),
    reversibility: z.enum(['not_applicable', 'reversible', 'conditional', 'irreversible']),
  })),
  alternatives: z.array(z.strictObject({
    businessName: z.string(),
    price: z.strictObject({
      currency: z.string(), minimumAmountMinor: safeNonnegativeInteger, maximumAmountMinor: safeNonnegativeInteger,
    }),
    validUntil: safePositiveInteger,
  })),
  approval: z.union([
    z.strictObject({ state: z.literal('required') }),
    z.strictObject({
      state: z.literal('recorded'), currency: z.string(), maximumSpendMinor: safeNonnegativeInteger,
      expiresAt: safePositiveInteger, recordedAt: safeNonnegativeInteger,
    }),
  ]),
})

export const customerRequestViewSchema = z.strictObject({
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
  missingFields: z.array(z.strictObject({ field: z.string(), label: z.string(), explanation: z.string() })),
  criteria: z.array(z.strictObject({
    label: z.string(), value: customerRequestJsonValueSchema,
    basis: z.enum(['customer_provided', 'extracted_from_request']),
  })).optional(),
  disclosureReview: z.strictObject({
    purpose: z.string(), maximumRecipients: safeNonnegativeInteger,
    categories: z.array(z.strictObject({
      label: z.string(), classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
    })),
  }).optional(),
  preparationRef: z.string().optional(),
  clarification: z.union([
    z.strictObject({
      kind: z.literal('intent_direction'), prompt: z.string(), answerKind: z.literal('natural_language'),
    }),
    z.strictObject({
      kind: z.literal('contract_fact'), requirementKey: z.string(), prompt: z.string(),
      answerKind: z.literal('typed_value'),
    }),
  ]).optional(),
  options: z.array(customerOptionSchema), optionSet: customerOptionSetSchema.optional(),
  routes: z.array(customerRoutePlanSchema).optional(),
  preparedAction: customerPreparedActionSchema.optional(),
  action: z.strictObject({
    state: z.enum(['unknown', 'completed', 'failed']),
    resolution: z.enum(['awaiting_evidence', 'provider_result', 'reconciled']),
    automaticRetry: z.literal(false), result: customerRequestJsonValueSchema.optional(), observedAt: safeNonnegativeInteger,
  }).optional(),
})

export const customerRequestConflictSchema = z.strictObject({
  kind: z.literal('conflict'), requestRef: z.string(),
  reason: z.enum(['revision_changed', 'identity_changed', 'idempotency_key_reused']),
})

export const customerRequestRefusalSchema = z.strictObject({
  kind: z.literal('refused'),
  reason: z.enum([
    'authentication_required', 'request_not_found', 'interpreter_unavailable', 'capabilities_unavailable',
  ]),
})

export const customerRequestAgentResultSchema = z.union([
  customerRequestViewSchema, customerRequestConflictSchema, customerRequestRefusalSchema,
])

export const customerRequestInspectResultSchema = z.union([
  customerRequestViewSchema,
  z.strictObject({
    kind: z.literal('refused'), reason: z.enum(['authentication_required', 'request_not_found']),
  }),
])

export const customerRequestApprovalResultSchema = z.union([
  z.strictObject({
    kind: z.literal('approved'), requestRef: z.string(), revision: safePositiveInteger,
    approvalRef: z.string(), preparedActionRef: z.string(),
    spend: z.strictObject({ currency: z.string(), maximumAmountMinor: safeNonnegativeInteger }),
    expiresAt: safePositiveInteger,
    recovery: z.strictObject({ unknownOutcome: z.literal('reconcile_only'), automaticRetry: z.literal(false) }),
  }),
  z.strictObject({
    kind: z.literal('conflict'), requestRef: z.string(),
    reason: z.enum(['revision_changed', 'idempotency_key_reused', 'approval_changed']),
  }),
  z.strictObject({
    kind: z.literal('refused'), reason: z.enum(['authentication_required', 'request_not_found', 'approval_invalid']),
  }),
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
