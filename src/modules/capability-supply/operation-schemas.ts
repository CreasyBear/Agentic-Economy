import { z } from 'zod'

import { jsonValueSchema } from '@/modules/capability-contract/public'
import { exactAmountSchema } from '@/modules/money/public'
import { CURRENT_OPERATION_CALL_VIA } from './internal/operation-projection-types'

import type {
  InspectPlanInput,
  InspectPlanResult,
  OperationCompareInput,
  OperationCompareResult,
  OperationDetailInput,
  OperationDetailResult,
  OperationSearchInput,
  OperationSearchResult,
} from './operation-projection'

const operationRef = z.string().regex(/^operation:v1:[0-9a-f]{64}$/)
const mappingRef = z.string().regex(/^mapping:v1:[0-9a-f]{64}$/)
const publicSchema = z.record(z.string(), jsonValueSchema)
const inputExample = z.strictObject({
  label: z.string().trim().min(1).max(160).optional(),
  input: z.record(z.string(), jsonValueSchema),
})

export const publicOperationNavigationSchema = z.strictObject({
  relation: z.enum(['search', 'detail', 'compare', 'inspect_plan', 'execute', 'invoke', 'authenticate', 'create_customer_request', 'review_route', 'read_status', 'reconcile', 'cancel']),
  pathTemplate: z.string().optional(),
  method: z.enum(['GET', 'POST']),
  actionId: z.string(),
  authentication: z.enum(['none', 'required']),
  inputSchema: publicSchema.optional(),
  surfaces: z.array(z.enum(['ui', 'http', 'agentJson', 'chat', 'cli', 'mcp'])).optional(),
  precondition: z.string().optional(),
})
export const publicOperationPriceSchema = z.discriminatedUnion('kind', [
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
export const publicOperationParameterSchema = z.strictObject({
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
export const publicOperationAvailabilitySchema = z.strictObject({
  posture: z.enum(['integrated', 'routeable', 'unavailable']),
  observedAt: z.number().optional(), validUntil: z.number().optional(),
  reason: z.enum(['setup_required', 'temporarily_unavailable', 'readiness_expired', 'publisher_withdrew', 'under_review', 'updated_terms_require_review', 'not_supported_by_ae']).optional(),
})
const provenance = z.strictObject({ publisher: z.enum(['provider_owned', 'ae_curated_external', 'third_party_gateway', 'observed_external']), sourceKind: z.enum(['ae_envelope', 'openapi_http', 'mcp', 'agent_plugin_mcp', 'x402']) })
export const publicOperationAuthenticationSchema = z.union([
  z.strictObject({ kind: z.literal('keyless') }),
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
const priceEvidence = z.strictObject({
  priceDigest: z.string(),
  sourceRef: z.string().optional(),
  evidenceRefs: z.array(z.string()),
  observedAt: z.number().optional(),
  validUntil: z.number().optional(),
})
const descriptor = z.strictObject({
  operationRef, operationId: z.string(),
  callVia: z.literal(CURRENT_OPERATION_CALL_VIA),
  paymentLane: z.literal('brokered'),
  contract: z.strictObject({
    capabilityId: z.string(), version: z.number().int().positive(), inputJsonSchema: publicSchema, outputJsonSchema: publicSchema,
    customerAnnotations: z.array(z.strictObject({ annotationId: z.string(), document: z.enum(['input', 'output']), pointer: z.string(), label: z.string(), role: z.enum(['request', 'constraint', 'comparison', 'commitment', 'result', 'completion_evidence', 'recovery']), semanticIdentity: z.string().optional(), inference: z.enum(['allowed', 'customer_required']).optional() })),
    inputExamples: z.array(inputExample).max(32).optional(),
  }),
  business: z.strictObject({ businessId: z.string(), slug: z.string(), name: z.string() }),
  offering: z.strictObject({ offeringRef: z.string(), revision: z.number().int().positive(), label: z.string(), summary: z.string() }),
  summary: z.string(),
  commercial: z.strictObject({ price: publicOperationPriceSchema, priceEvidence: priceEvidence.optional(), materialTerms: z.array(materialTerm), relationship }),
  dataUse: z.array(dataUse), effects: z.array(effect), evidence: z.array(evidence),
  cancellation, recovery, authentication: publicOperationAuthenticationSchema, transport, provenance, availability: publicOperationAvailabilitySchema, navigation: z.array(publicOperationNavigationSchema),
  parameters: z.array(publicOperationParameterSchema).optional(), catalogPrice: catalogPrice.optional(),
})
export const operationSearchFiltersSchema = z.strictObject({
  networkId: z.string().max(200).optional(), location: z.string().max(200).optional(),
  effects: z.array(z.enum(['data_release', 'financial_exposure', 'external_state_change'])).max(3).optional(),
  dataUse: z.array(z.enum(['public', 'personal', 'sensitive', 'credential'])).max(4).optional(),
  availability: z.array(z.enum(['integrated', 'routeable', 'unavailable'])).max(3).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(), maximumPrice: exactAmountSchema.optional(),
})
const comparisonValue = z.union([z.string(), publicOperationPriceSchema, z.array(effect), z.array(dataUse), publicOperationAvailabilitySchema, provenance, recovery])
export const operationComparisonFactSchema = z.strictObject({
  field: z.enum(['summary', 'price', 'effects', 'dataUse', 'availability', 'provenance', 'recovery']),
  values: z.array(z.strictObject({
    operationRef, value: comparisonValue,
    source: z.enum(['publication', 'readiness', 'contract', 'catalog']),
    observedAt: z.number().optional(), validUntil: z.number().optional(),
  })),
})
const maximumCost = z.union([
  z.strictObject({
    kind: z.literal('known'),
    amount: exactAmountSchema.describe('Exact maximum cost: currency, integer units, and decimal exponent'),
  }),
  z.strictObject({ kind: z.literal('requires_preparation') }),
])
export const operationSearchRankingSchema = z.strictObject({ operationRef, rank: z.number().int().positive(), score: z.number().nonnegative() })
export const operationSearchPaginationSchema = z.strictObject({ limit: z.number().int(), nextCursor: z.string().optional(), hasMore: z.boolean() })

export const operationSearchInputSchema: z.ZodType<OperationSearchInput> = z.strictObject({
  query: z.string().max(200), limit: z.number().int().min(1).max(20).optional(), cursor: z.string().max(512).optional(),
  filters: operationSearchFiltersSchema.optional(),
}) as z.ZodType<OperationSearchInput>
export const operationSearchOutputSchema: z.ZodType<OperationSearchResult> = z.union([
  z.strictObject({ kind: z.literal('ok'), schemaVersion: z.literal('registry-operations:v1'), query: z.string(), items: z.array(descriptor), matchedCount: z.number().int().nonnegative(), ranking: z.array(operationSearchRankingSchema), pagination: operationSearchPaginationSchema, navigation: z.array(publicOperationNavigationSchema) }),
  z.strictObject({ kind: z.literal('no_candidates'), schemaVersion: z.literal('registry-operations:v1'), query: z.string(), appliedFilters: operationSearchFiltersSchema, matchedCount: z.number().int().nonnegative(), ranking: z.array(operationSearchRankingSchema), navigation: z.array(publicOperationNavigationSchema) }),
  z.strictObject({ kind: z.literal('unavailable'), schemaVersion: z.literal('registry-operations:v1'), reason: z.enum(['query_invalid', 'source_unavailable', 'source_capacity_exceeded']), navigation: z.array(publicOperationNavigationSchema) }),
]) as z.ZodType<OperationSearchResult>
export const operationDetailInputSchema: z.ZodType<OperationDetailInput> = z.strictObject({ operationRef }) as z.ZodType<OperationDetailInput>
export const operationDetailOutputSchema: z.ZodType<OperationDetailResult> = z.union([
  z.strictObject({ kind: z.literal('found'), schemaVersion: z.literal('registry-operations:v1'), operation: descriptor }),
  z.strictObject({ kind: z.literal('unavailable'), schemaVersion: z.literal('registry-operations:v1'), operationRef: z.string(), reason: z.enum(['setup_required', 'temporarily_unavailable', 'readiness_expired', 'publisher_withdrew', 'under_review', 'updated_terms_require_review', 'not_supported_by_ae']), navigation: z.array(publicOperationNavigationSchema) }),
  z.strictObject({ kind: z.literal('not_found'), schemaVersion: z.literal('registry-operations:v1'), operationRef: z.string(), navigation: z.array(publicOperationNavigationSchema) }),
]) as z.ZodType<OperationDetailResult>
export const operationCompareInputSchema: z.ZodType<OperationCompareInput> = z.strictObject({ operationRefs: z.array(operationRef).min(1).max(4) }) as z.ZodType<OperationCompareInput>
export const operationCompareOutputSchema: z.ZodType<OperationCompareResult> = z.union([
  z.strictObject({ kind: z.literal('ok'), schemaVersion: z.literal('registry-operations:v1'), operations: z.array(descriptor), facts: z.array(operationComparisonFactSchema), navigation: z.array(publicOperationNavigationSchema) }),
  z.strictObject({ kind: z.literal('unavailable'), schemaVersion: z.literal('registry-operations:v1'), reason: z.enum(['query_invalid', 'operation_not_found', 'operation_unavailable']), navigation: z.array(publicOperationNavigationSchema) }),
]) as z.ZodType<OperationCompareResult>
export const operationInspectPlanInputSchema: z.ZodType<InspectPlanInput> = z.strictObject({ operationRefs: z.array(operationRef).min(1).max(4), mappingRefs: z.array(mappingRef).max(32).optional(), expiresInMs: z.number().int().min(1_000).max(86_400_000).optional() }) as z.ZodType<InspectPlanInput>
export const operationInspectPlanOutputSchema: z.ZodType<InspectPlanResult> = z.union([
  z.strictObject({ kind: z.literal('ok'), schemaVersion: z.literal('registry-operations:v1'), inspectPlanRef: z.string(), operationRefs: z.array(operationRef), mappingRefs: z.array(mappingRef), summary: z.strictObject({ maximumCost, dataUse: z.array(dataUse), effects: z.array(effect), expiry: z.number() }), navigation: z.array(publicOperationNavigationSchema) }),
  z.strictObject({ kind: z.literal('unavailable'), schemaVersion: z.literal('registry-operations:v1'), reason: z.enum(['query_invalid', 'operation_not_found', 'operation_unavailable', 'mapping_unavailable', 'mapping_incompatible', 'mapping_cycle']), operationRef: z.string().optional(), navigation: z.array(publicOperationNavigationSchema) }),
]) as z.ZodType<InspectPlanResult>
