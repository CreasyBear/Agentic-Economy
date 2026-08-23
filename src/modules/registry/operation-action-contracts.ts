import { convertSchemaToJsonSchema, type JSONSchema } from '@tanstack/ai'
import {
  operationCompareInputSchema,
  operationDetailInputSchema,
  operationDetailOutputSchema,
  operationInspectPlanInputSchema,
  operationInspectPlanOutputSchema,
  operationSearchInputSchema,
} from '@/modules/capability-supply/operation-schemas'
import {
  operationChoiceCompareOutputSchema,
  operationChoiceSearchOutputSchema,
} from './operation-choice-contracts'
import type { ActionParameter, ActionParameterType, ActionSurface } from '@/modules/common/action'
import type { z } from 'zod'
export {
  operationChoiceCompareOutputSchema,
  operationChoiceSearchOutputSchema,
  operationDetailOutputSchema,
  operationInspectPlanOutputSchema,
}

const operationMarketActionSurfaces = [
  'http',
  'agentJson',
  'answerThread',
  'cli',
  'mcp',
] as const satisfies readonly ActionSurface[]

const readOnlyEffect = {
  class: 'observation',
  reversible: true,
  recipientKind: 'none',
  dataClasses: [],
  spendExposure: 'none',
  approval: 'none',
} as const

const boundaries = [
  'Read-only public discovery. Does not create a RoutePlan, mandate, grant, reservation, invocation, payment, disclosure, or external effect.',
  'Returns redacted current operation semantics, commercial terms, provenance, readiness, consequences, and navigation only.',
  'Opaque refs are current-revision-bound and never execution authority.',
] as const

function parameterFromCanonicalSchema(
  schema: z.ZodType,
  name: string,
  description: string,
): ActionParameter {
  const document = convertSchemaToJsonSchema(schema)
  const property: JSONSchema | undefined = document?.properties?.[name]
  const rawType = property?.type
  const type = rawType === 'integer' ? 'number' : rawType
  const allowedTypes: readonly ActionParameterType[] = ['string', 'number', 'boolean', 'enum', 'object', 'array']
  if (typeof type !== 'string' || !allowedTypes.includes(type as ActionParameterType)) {
    throw new Error(`Operation parameter ${name} has unsupported schema type`)
  }
  return {
    name,
    type: type as ActionParameterType,
    description,
    required: document?.required?.includes(name) ?? false,
  }
}

const searchParameters: readonly ActionParameter[] = [
  parameterFromCanonicalSchema(operationSearchInputSchema, 'query', 'Bounded public operation query (max 200 characters).'),
  parameterFromCanonicalSchema(operationSearchInputSchema, 'limit', 'Maximum 20 results.'),
  parameterFromCanonicalSchema(operationSearchInputSchema, 'cursor', 'Opaque cursor from the previous page.'),
  parameterFromCanonicalSchema(operationSearchInputSchema, 'filters', 'Allowlisted operation filters.'),
]

const detailParameters: readonly ActionParameter[] = [
  parameterFromCanonicalSchema(operationDetailInputSchema, 'operationRef', 'Opaque current operation reference.'),
]

const compareParameters: readonly ActionParameter[] = [
  parameterFromCanonicalSchema(operationCompareInputSchema, 'operationRefs', 'One to four opaque current operation references.'),
]

const inspectParameters: readonly ActionParameter[] = [
  parameterFromCanonicalSchema(operationInspectPlanInputSchema, 'operationRefs', 'Required array of 1–4 opaque current operation references. Send { "operationRefs": ["operation:v1:…"] }, never a singular operationRef field.'),
  parameterFromCanonicalSchema(operationInspectPlanInputSchema, 'mappingRefs', 'Registered opaque mapping references.'),
  parameterFromCanonicalSchema(operationInspectPlanInputSchema, 'expiresInMs', 'Ephemeral inspection lifetime, bounded to 24 hours.'),
]

export const registryOperationsSearchContract = {
  id: 'registry.operations.search',
  schema: operationSearchInputSchema,
  surfaces: operationMarketActionSurfaces,
  name: 'Search Market Operations',
  summary: 'Search admitted Market Operations with a short capability phrase; omit concrete input values.',
  boundaries,
  outputSchema: operationChoiceSearchOutputSchema,
  parameters: searchParameters,
  readOnly: true,
  effect: readOnlyEffect,
  invocationContract: {
    version: 'registry.operations.search:v1',
    consequenceClass: 'read_only',
    materialInputPaths: ['query', 'limit', 'cursor', 'filters'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_operation_search_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: ['action_contract_version_changed', 'query_changed', 'filters_changed', 'cursor_changed'],
  },
} as const

export const registryOperationsDetailContract = {
  id: 'registry.operations.detail',
  schema: operationDetailInputSchema,
  surfaces: operationMarketActionSurfaces,
  name: 'Inspect an executable operation',
  summary: 'Read one exact current operation reference with redacted semantics and availability.',
  boundaries,
  outputSchema: operationDetailOutputSchema,
  parameters: detailParameters,
  readOnly: true,
  effect: readOnlyEffect,
  invocationContract: {
    version: 'registry.operations.detail:v1',
    consequenceClass: 'read_only',
    materialInputPaths: ['operationRef'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_operation_detail_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: ['action_contract_version_changed', 'operation_ref_changed'],
  },
} as const

export const registryOperationsCompareContract = {
  id: 'registry.operations.compare',
  schema: operationCompareInputSchema,
  surfaces: operationMarketActionSurfaces,
  name: 'Compare executable operations',
  summary: 'Compare up to four exact current operation references without selecting or authorizing one.',
  boundaries,
  outputSchema: operationChoiceCompareOutputSchema,
  parameters: compareParameters,
  readOnly: true,
  effect: readOnlyEffect,
  invocationContract: {
    version: 'registry.operations.compare:v1',
    consequenceClass: 'read_only',
    materialInputPaths: ['operationRefs'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_operation_comparison_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: ['action_contract_version_changed', 'operation_refs_changed'],
  },
} as const

export const registryOperationsInspectPlanContract = {
  id: 'registry.operations.inspectPlan',
  schema: operationInspectPlanInputSchema,
  surfaces: operationMarketActionSurfaces,
  name: 'Inspect an operation plan',
  summary: 'Validate an ephemeral bounded operation composition without creating authority. Required input is operationRefs (string array of 1–4 current operation references), not a singular operationRef.',
  boundaries,
  outputSchema: operationInspectPlanOutputSchema,
  parameters: inspectParameters,
  readOnly: true,
  effect: readOnlyEffect,
  invocationContract: {
    version: 'registry.operations.inspectPlan:v1',
    consequenceClass: 'read_only',
    materialInputPaths: ['operationRefs', 'mappingRefs', 'expiresInMs'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_operation_inspect_plan_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: ['action_contract_version_changed', 'operation_refs_changed', 'mapping_refs_changed', 'expiry_changed'],
  },
} as const
