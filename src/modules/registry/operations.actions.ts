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
import {
  operationCompareInputSchema,
  operationCompareOutputSchema,
  operationDetailInputSchema,
  operationDetailOutputSchema,
  operationInspectPlanInputSchema,
  operationInspectPlanOutputSchema,
  operationSearchInputSchema,
  operationSearchOutputSchema,
} from '@/modules/capability-supply/operation-schemas'
import { defineAction, type ActionParameter } from '@/modules/common/action'



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
  id: 'registry.operations.search', name: 'Search executable operations', summary: 'Search current publicly admitted executable operations through capability-supply.', boundaries, schema: operationSearchInputSchema, outputSchema: operationSearchOutputSchema, parameters: searchParameters, readOnly: true, effect: readOnlyEffect, surfaces,
  invocationContract: { version: 'registry.operations.search:v1', consequenceClass: 'read_only', materialInputPaths: ['query', 'limit', 'cursor', 'filters'], authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_operation_search_result'], safeContinuations: ['inspect_result'], invalidationConditions: ['action_contract_version_changed', 'query_changed', 'filters_changed', 'cursor_changed'] },
  run: async ({ data }) => readCapabilityOperationSearch(data),
})
export const registryOperationsDetailAction = defineAction({
  id: 'registry.operations.detail', name: 'Inspect an executable operation', summary: 'Read one exact current operation reference with redacted semantics and availability.', boundaries, schema: operationDetailInputSchema, outputSchema: operationDetailOutputSchema, parameters: detailParameters, readOnly: true, effect: readOnlyEffect, surfaces,
  invocationContract: { version: 'registry.operations.detail:v1', consequenceClass: 'read_only', materialInputPaths: ['operationRef'], authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_operation_detail_result'], safeContinuations: ['inspect_result'], invalidationConditions: ['action_contract_version_changed', 'operation_ref_changed'] },
  run: async ({ data }) => readCapabilityOperationDetail(data),
})
export const registryOperationsCompareAction = defineAction({
  id: 'registry.operations.compare', name: 'Compare executable operations', summary: 'Compare up to four exact current operation references without selecting or authorizing one.', boundaries, schema: operationCompareInputSchema, outputSchema: operationCompareOutputSchema, parameters: compareParameters, readOnly: true, effect: readOnlyEffect, surfaces,
  invocationContract: { version: 'registry.operations.compare:v1', consequenceClass: 'read_only', materialInputPaths: ['operationRefs'], authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_operation_comparison_result'], safeContinuations: ['inspect_result'], invalidationConditions: ['action_contract_version_changed', 'operation_refs_changed'] },
  run: async ({ data }) => readCapabilityOperationCompare(data),
})
export const registryOperationsInspectPlanAction = defineAction({
  id: 'registry.operations.inspectPlan', name: 'Inspect an operation plan', summary: 'Validate an ephemeral bounded operation composition without creating authority.', boundaries, schema: operationInspectPlanInputSchema, outputSchema: operationInspectPlanOutputSchema, parameters: inspectParameters, readOnly: true, effect: readOnlyEffect, surfaces,
  invocationContract: { version: 'registry.operations.inspectPlan:v1', consequenceClass: 'read_only', materialInputPaths: ['operationRefs', 'mappingRefs', 'expiresInMs'], authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_operation_inspect_plan_result'], safeContinuations: ['inspect_result'], invalidationConditions: ['action_contract_version_changed', 'operation_refs_changed', 'mapping_refs_changed', 'expiry_changed'] },
  run: async ({ data }) => readCapabilityOperationInspectPlan(data),
})
