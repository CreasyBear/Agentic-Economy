import { z } from 'zod'

import { jsonValueSchema } from '@/modules/capability-contract/public'
import { exactAmountSchema } from '@/modules/money/public'
import { CURRENT_TOOL_CALL_VIA, REGISTRY_TOOLS_SCHEMA_VERSION } from './internal/tool-projection-types'

export { REGISTRY_TOOLS_SCHEMA_VERSION }
export { decodePublicSchema, projectPublicSchema } from './internal/tool-projection-wire-schema'

import type {
  ToolCompareInput,
  ToolCompareResult,
  ToolDetailInput,
  ToolDetailResult,
  ToolSearchInput,
  ToolSearchResult,
} from './tool-projection'

const toolRef = z.string().regex(/^operation:v1:[0-9a-f]{64}$/)
const publicSchema = z.record(z.string(), jsonValueSchema)
const inputExample = z.strictObject({
  label: z.string().trim().min(1).max(160).optional(),
  input: z.record(z.string(), jsonValueSchema),
})

export const publicToolNavigationSchema = z.strictObject({
  relation: z.enum(['list', 'search', 'describe', 'compare', 'call', 'review_route', 'read_status', 'reconcile', 'cancel']),
  pathTemplate: z.string().optional(),
  method: z.enum(['GET', 'POST']),
  actionId: z.string(),
  authentication: z.enum(['none', 'required']),
  inputSchema: publicSchema.optional(),
  surfaces: z.array(z.enum(['ui', 'http', 'agentJson', 'chat', 'cli', 'mcp'])).optional(),
  precondition: z.string().optional(),
})
export const publicToolPriceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('fixed'),
    amount: exactAmountSchema.describe('Exact executable price: currency, integer units, and decimal exponent'),
  }),
  z.strictObject({
    kind: z.literal('range'),
    minimum: exactAmountSchema.describe('Exact executable lower price: currency, integer units, and decimal exponent'),
    maximum: exactAmountSchema.describe('Exact executable upper price: currency, integer units, and decimal exponent'),
  }),
  z.strictObject({ kind: z.literal('on_request') }),
])
const priceBreakdown = z.strictObject({
  providerQuotedAmount: exactAmountSchema,
  agenticEconomyFee: exactAmountSchema,
  totalBuyerAuthorization: exactAmountSchema,
  network: z.literal('eip155:8453'),
  asset: z.literal('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
})
const materialTerm = z.strictObject({ label: z.string(), value: z.string() })
const relationship = z.strictObject({ kind: z.enum(['none', 'direct', 'affiliate', 'ownership']), summary: z.string() })
const dataUse = z.strictObject({
  effectId: z.string(), inputPointer: z.string(),
  classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
  phase: z.enum(['preparation', 'execution']),
  recipient: z.enum(['candidate_binding', 'selected_binding', 'named_recipient']),
  purposes: z.array(z.string()),
})
const effect = z.strictObject({
  effectId: z.string(), class: z.enum(['data_release', 'financial_exposure', 'external_state_change']),
  authority: z.enum(['none', 'explicit', 'mandate_or_explicit']),
  reversibility: z.enum(['not_applicable', 'reversible', 'conditional', 'irreversible']),
})
const evidence = z.strictObject({ evidenceId: z.string(), outputPointer: z.string(), purpose: z.enum(['comparison', 'completion', 'recovery']) })
const cancellation = z.strictObject({ kind: z.enum(['unsupported', 'adapter_managed']) })
const recovery = z.strictObject({ idempotency: z.enum(['not_applicable', 'required']), recovery: z.enum(['retry_safe', 'reconcile_required']) })
export const publicToolParameterSchema = z.strictObject({
  group: z.enum(['body', 'path', 'query', 'header']), name: z.string(), type: z.string(),
  description: z.string().optional(), example: jsonValueSchema.optional(),
  enumValues: z.array(z.string()).optional(), default: jsonValueSchema.optional(),
  required: z.boolean(), style: z.enum(['form', 'simple']).optional(), explode: z.boolean().optional(),
})
const catalogPrice = z.strictObject({
  scheme: z.enum(['exact', 'upto']).describe('Decimal catalog merchandising scheme'),
  amount: z.string().optional().describe('Decimal catalog merchandising amount'),
  minAmount: z.string().optional().describe('Decimal catalog merchandising minimum'),
  maxAmount: z.string().optional().describe('Decimal catalog merchandising maximum'),
  currency: z.string().describe('Currency code for the decimal catalog price'),
})
export const publicToolAvailabilitySchema = z.strictObject({
  posture: z.enum(['setup_required', 'routeable', 'unavailable']),
  observedAt: z.number().optional(), validUntil: z.number().optional(),
  lastHealthyAt: z.number().optional(),
  reason: z.enum(['setup_required', 'inspection_required', 'temporarily_unavailable', 'readiness_expired', 'publisher_withdrew', 'under_review', 'updated_terms_require_review', 'not_supported_by_ae']).optional(),
})
const provenance = z.strictObject({ publisher: z.enum(['provider_owned', 'ae_curated_external', 'third_party_gateway', 'observed_external']), sourceKind: z.enum(['ae_envelope', 'openapi_http', 'mcp', 'agent_plugin_mcp', 'x402']) })
export const publicToolAuthenticationSchema = z.union([
  z.strictObject({ kind: z.literal('ae_api_key') }),
  z.strictObject({ kind: z.literal('platform_credential'), scheme: z.literal('api_key'), in: z.enum(['query', 'header']), name: z.string() }),
  z.strictObject({ kind: z.literal('platform_credential'), scheme: z.literal('bearer') }),
  z.strictObject({ kind: z.literal('x402') }),
  z.strictObject({ kind: z.literal('unknown') }),
])
const transport = z.strictObject({
  method: z.enum(['GET', 'POST']),
  pathTemplate: z.string().optional(),
  responseStatus: z.number().int().min(200).max(299).optional(),
  responseContentType: z.string().optional(),
  requestTimeoutMs: z.number().int().min(1),
})
export const publicToolPaymentSchema = z.strictObject({
  protocol: z.literal('x402'),
  scheme: z.literal('exact'),
  network: z.string(),
  asset: z.string(),
  currency: z.string(),
})
const priceEvidence = z.strictObject({
  priceDigest: z.string(),
  sourceRef: z.string().optional(),
  evidenceRefs: z.array(z.string()),
  observedAt: z.number().optional(),
  validUntil: z.number().optional(),
})
export const publicToolDisplayPriceSchema = z.union([
  z.strictObject({ kind: z.literal('indicative'), amount: exactAmountSchema, rateObservedAt: z.number(), validUntil: z.number() }),
  z.strictObject({ kind: z.literal('unavailable'), reason: z.enum(['upstream_price_missing', 'fx_missing', 'fx_stale', 'unsupported_payment']) }),
])

const descriptor = z.strictObject({
  toolRef, toolId: z.string(),
  callVia: z.literal(CURRENT_TOOL_CALL_VIA),
  paymentLane: z.literal('brokered'),
  contract: z.strictObject({
    capabilityId: z.string(), version: z.number().int().positive(), inputJsonSchema: publicSchema, outputJsonSchema: publicSchema,
    customerAnnotations: z.array(z.strictObject({ annotationId: z.string(), document: z.enum(['input', 'output']), pointer: z.string(), label: z.string(), role: z.enum(['request', 'constraint', 'comparison', 'commitment', 'result', 'completion_evidence', 'recovery']), semanticIdentity: z.string().optional(), inference: z.enum(['allowed', 'customer_required']).optional() })),
    inputExamples: z.array(inputExample).max(32).optional(),
  }),
  business: z.strictObject({ businessId: z.string(), slug: z.string(), name: z.string() }),
  offering: z.strictObject({ offeringRef: z.string(), revision: z.number().int().positive(), label: z.string(), summary: z.string() }),
  summary: z.string(),
  commercial: z.strictObject({ displayPrice: publicToolDisplayPriceSchema.optional(), price: publicToolPriceSchema, priceEvidence: priceEvidence.optional(), priceBreakdown: priceBreakdown.optional(), materialTerms: z.array(materialTerm), relationship }),
  dataUse: z.array(dataUse), effects: z.array(effect), evidence: z.array(evidence),
  cancellation, recovery, authentication: publicToolAuthenticationSchema, payment: publicToolPaymentSchema.optional(), transport, provenance, listingTier: z.enum(['reviewed', 'listed']), availability: publicToolAvailabilitySchema, navigation: z.array(publicToolNavigationSchema),
  parameters: z.array(publicToolParameterSchema).optional(), catalogPrice: catalogPrice.optional(),
})
export const toolSearchFiltersSchema = z.strictObject({
  networkId: z.string().max(200).optional(), location: z.string().max(200).optional(),
  effects: z.array(z.enum(['data_release', 'financial_exposure', 'external_state_change'])).max(3).optional(),
  dataUse: z.array(z.enum(['public', 'personal', 'sensitive', 'credential'])).max(4).optional(),
  availability: z.array(z.enum(['setup_required', 'routeable', 'unavailable'])).max(3).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(), maximumPrice: exactAmountSchema.optional(),
})
const comparisonValue = z.union([z.string(), publicToolPriceSchema, z.array(effect), z.array(dataUse), publicToolAvailabilitySchema, provenance, recovery])
export const toolComparisonFactSchema = z.strictObject({
  field: z.enum(['summary', 'price', 'effects', 'dataUse', 'availability', 'provenance', 'recovery']),
  values: z.array(z.strictObject({
    toolRef, value: comparisonValue,
    source: z.enum(['publication', 'readiness', 'contract', 'catalog']),
    observedAt: z.number().optional(), validUntil: z.number().optional(), lastHealthyAt: z.number().optional(),
  })),
})
export const toolSearchRankingSchema = z.strictObject({ toolRef, rank: z.number().int().positive(), score: z.number().nonnegative() })
export const toolSearchPaginationSchema = z.strictObject({ limit: z.number().int(), nextCursor: z.string().optional(), hasMore: z.boolean() })

export const toolSearchInputSchema: z.ZodType<ToolSearchInput> = z.strictObject({
  source: z.enum(['current', 'coinbase', 'payai']).optional(),
  query: z.string().max(256), limit: z.number().int().min(1).max(100).optional(), cursor: z.string().max(8192).optional(),
  filters: toolSearchFiltersSchema.optional(),
}) as z.ZodType<ToolSearchInput>
export const toolSearchOutputSchema: z.ZodType<ToolSearchResult> = z.union([
  z.strictObject({ kind: z.literal('ok'), schemaVersion: z.literal(REGISTRY_TOOLS_SCHEMA_VERSION), query: z.string(), items: z.array(descriptor), matchedCount: z.number().int().nonnegative().optional(), partialResults: z.boolean().optional(), ranking: z.array(toolSearchRankingSchema), pagination: toolSearchPaginationSchema, navigation: z.array(publicToolNavigationSchema) }),
  z.strictObject({ kind: z.literal('no_candidates'), schemaVersion: z.literal(REGISTRY_TOOLS_SCHEMA_VERSION), query: z.string(), appliedFilters: toolSearchFiltersSchema, matchedCount: z.number().int().nonnegative().optional(), partialResults: z.boolean().optional(), ranking: z.array(toolSearchRankingSchema), navigation: z.array(publicToolNavigationSchema) }),
  z.strictObject({ kind: z.literal('unavailable'), schemaVersion: z.literal(REGISTRY_TOOLS_SCHEMA_VERSION), reason: z.enum(['query_invalid', 'source_unavailable', 'source_capacity_exceeded']), navigation: z.array(publicToolNavigationSchema) }),
]) as z.ZodType<ToolSearchResult>
export const toolDetailInputSchema: z.ZodType<ToolDetailInput> = z.strictObject({ toolRef }) as z.ZodType<ToolDetailInput>
export const toolDetailOutputSchema: z.ZodType<ToolDetailResult> = z.union([
  z.strictObject({ kind: z.literal('found'), schemaVersion: z.literal(REGISTRY_TOOLS_SCHEMA_VERSION), tool: descriptor }),
  z.strictObject({ kind: z.literal('unavailable'), schemaVersion: z.literal(REGISTRY_TOOLS_SCHEMA_VERSION), toolRef: z.string(), reason: z.enum(['setup_required', 'inspection_required', 'temporarily_unavailable', 'readiness_expired', 'publisher_withdrew', 'under_review', 'updated_terms_require_review', 'not_supported_by_ae']), navigation: z.array(publicToolNavigationSchema) }),
  z.strictObject({ kind: z.literal('not_found'), schemaVersion: z.literal(REGISTRY_TOOLS_SCHEMA_VERSION), toolRef: z.string(), navigation: z.array(publicToolNavigationSchema) }),
]) as z.ZodType<ToolDetailResult>
export const toolCompareInputSchema: z.ZodType<ToolCompareInput> = z.strictObject({ toolRefs: z.array(toolRef).min(1).max(4) }) as z.ZodType<ToolCompareInput>
export const toolCompareOutputSchema: z.ZodType<ToolCompareResult> = z.union([
  z.strictObject({ kind: z.literal('ok'), schemaVersion: z.literal(REGISTRY_TOOLS_SCHEMA_VERSION), tools: z.array(descriptor), facts: z.array(toolComparisonFactSchema), navigation: z.array(publicToolNavigationSchema) }),
  z.strictObject({ kind: z.literal('unavailable'), schemaVersion: z.literal(REGISTRY_TOOLS_SCHEMA_VERSION), reason: z.enum(['query_invalid', 'tool_not_found', 'tool_unavailable']), navigation: z.array(publicToolNavigationSchema) }),
]) as z.ZodType<ToolCompareResult>
