import { z } from 'zod'

import {
  type InspectPlanInput,
  type InspectPlanResult,
  type OperationCompareInput,
  type OperationCompareResult,
  type OperationDetailInput,
  type OperationDetailResult,
  type OperationSearchInput,
  type OperationSearchResult,
} from '@/modules/capability-supply/public'
import {
  readCapabilityOperationCompare,
  readCapabilityOperationDetail,
  readCapabilityOperationInspectPlan,
  readCapabilityOperationSearch,
} from '@/modules/capability-supply/operation-source'
import { jsonValueSchema } from '@/modules/capability-contract/public'
import { exactAmountSchema } from '@/modules/money/public'
import { defineAction, type ActionParameter } from '@/modules/common/action'

const operationRef = z.string().regex(/^operation:v1:[0-9a-f]{64}$/)
const mappingRef = z.string().regex(/^mapping:v1:[0-9a-f]{64}$/)
const publicSchema = z.record(z.string(), jsonValueSchema)
const navigation = z.strictObject({
  relation: z.enum(['search', 'detail', 'compare', 'inspect_plan', 'authenticate', 'create_customer_request', 'review_route', 'read_status', 'reconcile', 'cancel']),
  method: z.enum(['GET', 'POST']), actionId: z.string(), authentication: z.enum(['none', 'required']),
  inputSchema: publicSchema.optional(), precondition: z.string().optional(),
})
const price = z.discriminatedUnion('kind', [
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
const parameter = z.strictObject({
  group: z.enum(['body', 'path', 'query']), name: z.string(), type: z.string(),
  description: z.string().optional(), example: jsonValueSchema.optional(),
  enumValues: z.array(z.string()).optional(), default: jsonValueSchema.optional(),
  required: z.boolean(),
})
const catalogPrice = z.strictObject({
  scheme: z.enum(['exact', 'upto']).describe('Decimal catalog merchandising scheme'),
  amount: z.string().optional().describe('Decimal catalog merchandising amount'),
  minAmount: z.string().optional().describe('Decimal catalog merchandising minimum'),
  maxAmount: z.string().optional().describe('Decimal catalog merchandising maximum'),
  currency: z.string().describe('Currency code for the decimal catalog price'),
})
const availability = z.strictObject({
  posture: z.enum(['integrated', 'routeable', 'unavailable']),
  observedAt: z.number().optional(), validUntil: z.number().optional(),
  reason: z.enum(['setup_required', 'temporarily_unavailable', 'readiness_expired', 'publisher_withdrew', 'under_review', 'updated_terms_require_review', 'not_supported_by_ae']).optional(),
})
const provenance = z.strictObject({ publisher: z.enum(['provider_owned', 'ae_curated_external', 'third_party_gateway', 'observed_external']), sourceKind: z.enum(['ae_envelope', 'openapi_http', 'mcp', 'agent_plugin_mcp', 'x402']) })
const descriptor = z.strictObject({
  operationRef, operationId: z.string(),
  contract: z.strictObject({
    capabilityId: z.string(), version: z.number().int().positive(), inputJsonSchema: publicSchema, outputJsonSchema: publicSchema,
    customerAnnotations: z.array(z.strictObject({ annotationId: z.string(), document: z.enum(['input', 'output']), pointer: z.string(), label: z.string(), role: z.enum(['request', 'constraint', 'comparison', 'commitment', 'result', 'completion_evidence', 'recovery']), semanticIdentity: z.string().optional(), inference: z.enum(['allowed', 'customer_required']).optional() })),
  }),
  business: z.strictObject({ businessId: z.string(), slug: z.string(), name: z.string() }),
  offering: z.strictObject({ offeringRef: z.string(), revision: z.number().int().positive(), label: z.string(), summary: z.string() }),
  summary: z.string(),
  commercial: z.strictObject({ price, materialTerms: z.array(materialTerm), relationship }),
  dataUse: z.array(dataUse), effects: z.array(effect), evidence: z.array(evidence),
  cancellation, recovery, provenance, availability, navigation: z.array(navigation),
  parameters: z.array(parameter).optional(), catalogPrice: catalogPrice.optional(),
})
const searchFilters = z.strictObject({
  networkId: z.string().max(200).optional(), location: z.string().max(200).optional(),
  effects: z.array(z.enum(['data_release', 'financial_exposure', 'external_state_change'])).max(3).optional(),
  dataUse: z.array(z.enum(['public', 'personal', 'sensitive', 'credential'])).max(4).optional(),
  availability: z.array(z.enum(['integrated', 'routeable', 'unavailable'])).max(3).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(), maximumPrice: exactAmountSchema.optional(),
})
const searchInput = z.strictObject({
  query: z.string().max(200), limit: z.number().int().min(1).max(20).optional(), cursor: z.string().max(512).optional(),
  filters: searchFilters.optional(),
}) as z.ZodType<OperationSearchInput>
const comparisonValue = z.union([z.string(), price, z.array(effect), z.array(dataUse), availability, provenance, recovery])
const comparisonFact = z.strictObject({
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
const searchOutput = z.union([
  z.strictObject({ kind: z.literal('ok'), schemaVersion: z.literal('registry-operations:v1'), query: z.string(), items: z.array(descriptor), pagination: z.strictObject({ limit: z.number().int(), nextCursor: z.string().optional(), hasMore: z.boolean() }), navigation: z.array(navigation) }),
  z.strictObject({ kind: z.literal('no_candidates'), schemaVersion: z.literal('registry-operations:v1'), query: z.string(), appliedFilters: searchFilters, navigation: z.array(navigation) }),
  z.strictObject({ kind: z.literal('unavailable'), schemaVersion: z.literal('registry-operations:v1'), reason: z.enum(['query_invalid', 'source_unavailable', 'source_capacity_exceeded']), navigation: z.array(navigation) }),
]) as z.ZodType<OperationSearchResult>
const detailInput = z.strictObject({ operationRef }) as z.ZodType<OperationDetailInput>
const detailOutput = z.union([
  z.strictObject({ kind: z.literal('found'), schemaVersion: z.literal('registry-operations:v1'), operation: descriptor }),
  z.strictObject({ kind: z.literal('unavailable'), schemaVersion: z.literal('registry-operations:v1'), operationRef: z.string(), reason: z.enum(['setup_required', 'temporarily_unavailable', 'readiness_expired', 'publisher_withdrew', 'under_review', 'updated_terms_require_review', 'not_supported_by_ae']), navigation: z.array(navigation) }),
  z.strictObject({ kind: z.literal('not_found'), schemaVersion: z.literal('registry-operations:v1'), operationRef: z.string(), navigation: z.array(navigation) }),
]) as z.ZodType<OperationDetailResult>
const compareInput = z.strictObject({ operationRefs: z.array(operationRef).min(1).max(4) }) as z.ZodType<OperationCompareInput>
const compareOutput = z.union([
  z.strictObject({ kind: z.literal('ok'), schemaVersion: z.literal('registry-operations:v1'), operations: z.array(descriptor), facts: z.array(comparisonFact), navigation: z.array(navigation) }),
  z.strictObject({ kind: z.literal('unavailable'), schemaVersion: z.literal('registry-operations:v1'), reason: z.enum(['query_invalid', 'operation_not_found', 'operation_unavailable']), navigation: z.array(navigation) }),
]) as z.ZodType<OperationCompareResult>
const inspectInput = z.strictObject({ operationRefs: z.array(operationRef).min(1).max(4), mappingRefs: z.array(mappingRef).max(32).optional(), expiresInMs: z.number().int().min(1_000).max(86_400_000).optional() }) as z.ZodType<InspectPlanInput>
const inspectOutput = z.union([
  z.strictObject({ kind: z.literal('ok'), schemaVersion: z.literal('registry-operations:v1'), inspectPlanRef: z.string(), operationRefs: z.array(operationRef), mappingRefs: z.array(mappingRef), summary: z.strictObject({ maximumCost, dataUse: z.array(dataUse), effects: z.array(effect), expiry: z.number() }), navigation: z.array(navigation) }),
  z.strictObject({ kind: z.literal('unavailable'), schemaVersion: z.literal('registry-operations:v1'), reason: z.enum(['query_invalid', 'operation_not_found', 'operation_unavailable', 'mapping_unavailable', 'mapping_incompatible', 'mapping_cycle']), navigation: z.array(navigation) }),
]) as z.ZodType<InspectPlanResult>

const readOnlyEffect = { class: 'observation' as const, reversible: true, recipientKind: 'none' as const, dataClasses: [], spendExposure: 'none' as const, approval: 'none' as const }
const boundaries = [
  'Read-only public discovery. Does not create a Customer Request, RoutePlan, mandate, grant, reservation, invocation, payment, disclosure, or external effect.',
  'Returns redacted current operation semantics, commercial terms, provenance, readiness, consequences, and navigation only.',
  'Opaque refs are current-revision-bound and never execution authority.',
]
const surfaces = ['http', 'agentJson', 'answerThread', 'mcp'] as const
const searchParameters: readonly ActionParameter[] = [
  { name: 'query', type: 'string', description: 'Bounded public operation query (max 200 characters).', required: true },
  { name: 'limit', type: 'number', description: 'Maximum 20 results.', required: false },
  { name: 'cursor', type: 'string', description: 'Opaque cursor from the previous page.', required: false },
  { name: 'filters', type: 'object', description: 'Allowlisted operation filters.', required: false },
]
const detailParameters: readonly ActionParameter[] = [{ name: 'operationRef', type: 'string', description: 'Opaque current operation reference.', required: true }]
const compareParameters: readonly ActionParameter[] = [{ name: 'operationRefs', type: 'object', description: 'One to four opaque current operation references.', required: true }]
const inspectParameters: readonly ActionParameter[] = [
  { name: 'operationRefs', type: 'object', description: 'One to four opaque current operation references.', required: true },
  { name: 'mappingRefs', type: 'object', description: 'Registered opaque mapping references.', required: false },
  { name: 'expiresInMs', type: 'number', description: 'Ephemeral inspection lifetime, bounded to 24 hours.', required: false },
]

export const registryOperationsSearchAction = defineAction({
  id: 'registry.operations.search', name: 'Search executable operations', summary: 'Search current publicly admitted executable operations through capability-supply.', boundaries, schema: searchInput, outputSchema: searchOutput, parameters: searchParameters, readOnly: true, effect: readOnlyEffect, surfaces,
  invocationContract: { version: 'registry.operations.search:v1', consequenceClass: 'read_only', materialInputPaths: ['query', 'limit', 'cursor', 'filters'], authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_operation_search_result'], safeContinuations: ['inspect_result'], invalidationConditions: ['action_contract_version_changed', 'query_changed', 'filters_changed', 'cursor_changed'] },
  run: async ({ data }) => readCapabilityOperationSearch(data),
})
export const registryOperationsDetailAction = defineAction({
  id: 'registry.operations.detail', name: 'Inspect an executable operation', summary: 'Read one exact current operation reference with redacted semantics and availability.', boundaries, schema: detailInput, outputSchema: detailOutput, parameters: detailParameters, readOnly: true, effect: readOnlyEffect, surfaces,
  invocationContract: { version: 'registry.operations.detail:v1', consequenceClass: 'read_only', materialInputPaths: ['operationRef'], authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_operation_detail_result'], safeContinuations: ['inspect_result'], invalidationConditions: ['action_contract_version_changed', 'operation_ref_changed'] },
  run: async ({ data }) => readCapabilityOperationDetail(data),
})
export const registryOperationsCompareAction = defineAction({
  id: 'registry.operations.compare', name: 'Compare executable operations', summary: 'Compare up to four exact current operation references without selecting or authorizing one.', boundaries, schema: compareInput, outputSchema: compareOutput, parameters: compareParameters, readOnly: true, effect: readOnlyEffect, surfaces,
  invocationContract: { version: 'registry.operations.compare:v1', consequenceClass: 'read_only', materialInputPaths: ['operationRefs'], authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_operation_comparison_result'], safeContinuations: ['inspect_result'], invalidationConditions: ['action_contract_version_changed', 'operation_refs_changed'] },
  run: async ({ data }) => readCapabilityOperationCompare(data),
})
export const registryOperationsInspectPlanAction = defineAction({
  id: 'registry.operations.inspectPlan', name: 'Inspect an operation plan', summary: 'Validate an ephemeral bounded operation composition without creating authority.', boundaries, schema: inspectInput, outputSchema: inspectOutput, parameters: inspectParameters, readOnly: true, effect: readOnlyEffect, surfaces,
  invocationContract: { version: 'registry.operations.inspectPlan:v1', consequenceClass: 'read_only', materialInputPaths: ['operationRefs', 'mappingRefs', 'expiresInMs'], authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_operation_inspect_plan_result'], safeContinuations: ['inspect_result'], invalidationConditions: ['action_contract_version_changed', 'operation_refs_changed', 'mapping_refs_changed', 'expiry_changed'] },
  run: async ({ data }) => readCapabilityOperationInspectPlan(data),
})
