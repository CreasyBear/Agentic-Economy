import { v } from 'convex/values'
import { CURRENT_TOOL_CALL_VIA } from '@/modules/capability-supply/public'

const exactAmount = v.object({ currency: v.string(), units: v.string(), exponent: v.number() })
const publicPrice = v.union(
  v.object({ kind: v.literal('fixed'), amount: exactAmount }),
  v.object({ kind: v.literal('range'), minimum: exactAmount, maximum: exactAmount }),
  v.object({ kind: v.literal('on_request') }),
)
const publicPriceBreakdown = v.object({
  providerQuotedAmount: exactAmount,
  agenticEconomyFee: exactAmount,
  totalBuyerAuthorization: exactAmount,
  network: v.literal('eip155:8453'),
  asset: v.literal('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
})
export const publicAuthentication = v.union(
  v.object({ kind: v.literal('ae_api_key') }),
  v.object({ kind: v.literal('platform_credential'), scheme: v.literal('api_key'), in: v.union(v.literal('query'), v.literal('header')), name: v.string() }),
  v.object({ kind: v.literal('platform_credential'), scheme: v.literal('bearer') }),
  v.object({ kind: v.literal('x402') }),
  v.object({ kind: v.literal('unknown') }),
)
const publicPayment = v.object({
  protocol: v.literal('x402'),
  scheme: v.literal('exact'),
  network: v.string(),
  asset: v.string(),
  currency: v.string(),
})

const publicMaterialTerm = v.object({ label: v.string(), value: v.string() })
const publicRelationship = v.object({
  kind: v.union(v.literal('none'), v.literal('direct'), v.literal('affiliate'), v.literal('ownership')),
  summary: v.string(),
})
const publicDataUse = v.object({
  effectId: v.string(),
  inputPointer: v.string(),
  classification: v.union(v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
  phase: v.union(v.literal('preparation'), v.literal('execution')),
  recipient: v.union(v.literal('candidate_binding'), v.literal('selected_binding'), v.literal('named_recipient')),
  purposes: v.array(v.string()),
})
const publicEffect = v.object({
  effectId: v.string(),
  class: v.union(v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change')),
  authority: v.union(v.literal('none'), v.literal('explicit'), v.literal('mandate_or_explicit')),
  reversibility: v.union(v.literal('not_applicable'), v.literal('reversible'), v.literal('conditional'), v.literal('irreversible')),
})
const publicEvidence = v.object({
  evidenceId: v.string(),
  outputPointer: v.string(),
  purpose: v.union(v.literal('comparison'), v.literal('completion'), v.literal('recovery')),
})
const publicCancellation = v.object({ kind: v.union(v.literal('unsupported'), v.literal('adapter_managed')) })
const publicRecovery = v.object({
  idempotency: v.union(v.literal('not_applicable'), v.literal('required')),
  recovery: v.union(v.literal('retry_safe'), v.literal('reconcile_required')),
})
const publicAvailability = v.object({
  posture: v.union(v.literal('setup_required'), v.literal('routeable'), v.literal('unavailable')),
  observedAt: v.optional(v.number()),
  validUntil: v.optional(v.number()),
  lastHealthyAt: v.optional(v.number()),
  reason: v.optional(v.union(
    v.literal('setup_required'),
    v.literal('inspection_required'),
    v.literal('temporarily_unavailable'),
    v.literal('readiness_expired'),
    v.literal('publisher_withdrew'),
    v.literal('under_review'),
    v.literal('updated_terms_require_review'),
    v.literal('not_supported_by_ae'),
  )),
})
const publicTransport = v.object({
  method: v.union(v.literal('GET'), v.literal('POST')),
  pathTemplate: v.optional(v.string()),
  responseStatus: v.optional(v.number()),
  responseContentType: v.optional(v.string()),
  requestTimeoutMs: v.number(),
})
const publicPriceEvidence = v.object({
  priceDigest: v.string(),
  sourceRef: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
  observedAt: v.optional(v.number()),
  validUntil: v.optional(v.number()),
})
const publicNavigation = v.object({
  relation: v.union(
    v.literal('list'),
    v.literal('search'),
    v.literal('describe'),
    v.literal('compare'),
    v.literal('call'),
    v.literal('review_route'),
    v.literal('read_status'),
    v.literal('reconcile'),
    v.literal('cancel'),
  ),
  pathTemplate: v.optional(v.string()),
  method: v.union(v.literal('GET'), v.literal('POST')),
  actionId: v.string(),
  authentication: v.union(v.literal('none'), v.literal('required')),
  inputSchema: v.optional(v.any()), // runtime-validated JsonValue boundary
  surfaces: v.optional(v.array(v.union(
    v.literal('ui'),
    v.literal('http'),
    v.literal('agentJson'),
    v.literal('chat'),
    v.literal('cli'),
    v.literal('mcp'),
  ))),
  precondition: v.optional(v.string()),
})
const publicAnnotation = v.object({
  annotationId: v.string(),
  document: v.union(v.literal('input'), v.literal('output')),
  pointer: v.string(),
  label: v.string(),
  role: v.union(
    v.literal('request'),
    v.literal('constraint'),
    v.literal('comparison'),
    v.literal('commitment'),
    v.literal('result'),
    v.literal('completion_evidence'),
    v.literal('recovery'),
  ),
  semanticIdentity: v.optional(v.string()),
  inference: v.optional(v.union(v.literal('allowed'), v.literal('customer_required'))),
})
const publicInputExample = v.object({
  label: v.optional(v.string()),
  input: v.record(v.string(), v.any()), // runtime-validated JsonValue boundary
})
const publicDescriptor = v.object({
  toolRef: v.string(),
  callVia: v.literal(CURRENT_TOOL_CALL_VIA),
  paymentLane: v.literal('brokered'),
  toolId: v.string(),
  contract: v.object({
    capabilityId: v.string(),
    version: v.number(),
    inputJsonSchema: v.string(),
    outputJsonSchema: v.string(),
    customerAnnotations: v.array(publicAnnotation),
    inputExamples: v.optional(v.array(publicInputExample)),
  }),
  business: v.object({ businessId: v.string(), slug: v.string(), name: v.string() }),
  listing: v.object({ listingRef: v.string(), revision: v.number(), label: v.string(), summary: v.string() }),
  summary: v.string(),
  commercial: v.object({ displayPrice: v.optional(v.union(v.object({ kind: v.literal('indicative'), amount: exactAmount, rateObservedAt: v.number(), validUntil: v.number() }), v.object({ kind: v.literal('unavailable'), reason: v.union(v.literal('upstream_price_missing'), v.literal('fx_missing'), v.literal('fx_stale'), v.literal('unsupported_payment')) }))), price: publicPrice, priceEvidence: v.optional(publicPriceEvidence), priceBreakdown: v.optional(publicPriceBreakdown), materialTerms: v.array(publicMaterialTerm), relationship: publicRelationship }),
  dataUse: v.array(publicDataUse),
  effects: v.array(publicEffect),
  evidence: v.array(publicEvidence),
  cancellation: publicCancellation,
  recovery: publicRecovery,
  authentication: publicAuthentication,
  payment: v.optional(publicPayment),
  transport: publicTransport,
  provenance: v.object({
    publisher: v.union(
      v.literal('provider_owned'), v.literal('ae_curated_external'),
      v.literal('third_party_gateway'), v.literal('observed_external'),
    ),
    sourceKind: v.union(v.literal('ae_envelope'), v.literal('openapi_http'), v.literal('mcp'), v.literal('agent_plugin_mcp'), v.literal('x402')),
  }),
  availability: publicAvailability,
  navigation: v.array(publicNavigation),
  listingTier: v.union(v.literal('reviewed'), v.literal('listed')),
  canonical: v.optional(
    v.object({
      providerHost: v.string(),
      slug: v.string(),
      path: v.string(),
    }),
  ),
  parameters: v.optional(v.array(v.object({
    group: v.union(v.literal('body'), v.literal('path'), v.literal('query'), v.literal('header')),
    name: v.string(), type: v.string(),
    description: v.optional(v.string()), example: v.optional(v.any()), // runtime-validated JsonValue boundary
    enumValues: v.optional(v.array(v.string())), default: v.optional(v.any()), // runtime-validated JsonValue boundary
    required: v.boolean(),
    style: v.optional(v.union(v.literal('form'), v.literal('simple'))),
    explode: v.optional(v.boolean()),
  }))),
  catalogPrice: v.optional(v.object({
    scheme: v.union(v.literal('exact'), v.literal('upto')),
    amount: v.optional(v.string()), minAmount: v.optional(v.string()), maxAmount: v.optional(v.string()),
    currency: v.string(),
  })),
})
const publicComparisonValue = v.union(
  v.string(),
  publicPrice,
  v.array(publicEffect),
  v.array(publicDataUse),
  publicAvailability,
  v.object({
    publisher: v.union(
      v.literal('provider_owned'), v.literal('ae_curated_external'),
      v.literal('third_party_gateway'), v.literal('observed_external'),
    ),
    sourceKind: v.union(v.literal('ae_envelope'), v.literal('openapi_http'), v.literal('mcp'), v.literal('agent_plugin_mcp'), v.literal('x402')),
  }),
  publicRecovery,
)
const publicComparisonFact = v.object({
  field: v.union(v.literal('summary'), v.literal('price'), v.literal('effects'), v.literal('dataUse'), v.literal('availability'), v.literal('provenance'), v.literal('recovery')),
  values: v.array(v.object({
    toolRef: v.string(),
    value: publicComparisonValue,
    source: v.union(v.literal('publication'), v.literal('readiness'), v.literal('contract'), v.literal('catalog')),
    observedAt: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    lastHealthyAt: v.optional(v.number()),
  })),
})
const publicSearchFilters = v.object({
  networkId: v.optional(v.string()),
  location: v.optional(v.string()),
  effects: v.optional(v.array(v.union(v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change')))),
  dataUse: v.optional(v.array(v.union(v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential')))),
  availability: v.optional(v.array(v.union(v.literal('setup_required'), v.literal('routeable'), v.literal('unavailable')))),
  currency: v.optional(v.string()),
  maximumPrice: v.optional(exactAmount),
})
const publicSearchNavigation = v.array(publicNavigation)
const publicRanking = v.object({ toolRef: v.string(), rank: v.number(), score: v.number() })
export const publicSearchReturns = v.union(
  v.object({
    kind: v.literal('ok'),
    schemaVersion: v.literal('registry-tools:v3'),
    query: v.string(),
    items: v.array(publicDescriptor),
    matchedCount: v.optional(v.number()),
    partialResults: v.optional(v.boolean()),
    ranking: v.array(publicRanking),
    pagination: v.object({ limit: v.number(), nextCursor: v.optional(v.string()), hasMore: v.boolean() }),
    navigation: publicSearchNavigation,
  }),
  v.object({
    kind: v.literal('no_candidates'),
    schemaVersion: v.literal('registry-tools:v3'),
    query: v.string(),
    appliedFilters: publicSearchFilters,
    matchedCount: v.optional(v.number()),
    partialResults: v.optional(v.boolean()),
    ranking: v.array(publicRanking),
    navigation: publicSearchNavigation,
  }),
  v.object({
    kind: v.literal('unavailable'),
    schemaVersion: v.literal('registry-tools:v3'),
    reason: v.union(v.literal('query_invalid'), v.literal('source_unavailable'), v.literal('source_capacity_exceeded')),
    navigation: publicSearchNavigation,
  }),
)
export const publicDetailReturns = v.union(
  v.object({ kind: v.literal('found'), schemaVersion: v.literal('registry-tools:v3'), tool: publicDescriptor }),
  v.object({
    kind: v.literal('unavailable'),
    schemaVersion: v.literal('registry-tools:v3'),
    toolRef: v.string(),
    reason: v.union(
      v.literal('setup_required'),
    v.literal('inspection_required'),
      v.literal('temporarily_unavailable'),
      v.literal('readiness_expired'),
      v.literal('publisher_withdrew'),
      v.literal('under_review'),
      v.literal('updated_terms_require_review'),
      v.literal('not_supported_by_ae'),
    ),
    navigation: publicSearchNavigation,
  }),
  v.object({ kind: v.literal('not_found'), schemaVersion: v.literal('registry-tools:v3'), toolRef: v.string(), navigation: publicSearchNavigation }),
)
export const publicCompareReturns = v.union(
  v.object({
    kind: v.literal('ok'),
    schemaVersion: v.literal('registry-tools:v3'),
    tools: v.array(publicDescriptor),
    facts: v.array(publicComparisonFact),
    navigation: publicSearchNavigation,
  }),
  v.object({
    kind: v.literal('unavailable'),
    schemaVersion: v.literal('registry-tools:v3'),
    reason: v.union(v.literal('query_invalid'), v.literal('tool_not_found'), v.literal('tool_unavailable')),
    navigation: publicSearchNavigation,
  }),
)
export const searchArgs = {
  query: v.string(),
  source: v.optional(v.union(v.literal('current'), v.literal('coinbase'), v.literal('payai'))),
  limit: v.optional(v.number()),
  cursor: v.optional(v.string()),
  filters: v.optional(publicSearchFilters),
}
export const toolRefArgs = { toolRef: v.string() }
export const compareArgs = { toolRefs: v.array(v.string()) }

