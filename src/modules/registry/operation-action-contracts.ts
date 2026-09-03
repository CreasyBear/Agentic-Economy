import { convertSchemaToJsonSchema, type JSONSchema } from '@tanstack/ai'
import { z } from 'zod'

import { operationCompareInputSchema } from '@/modules/capability-supply/operation-schemas'
import type { ActionParameter, ActionParameterType, ActionSurface } from '@/modules/common/action'
import {
  operationCatalogSearchInputSchema,
  operationChoiceCompareOutputSchema,
  operationChoiceDescribeOutputSchema,
  operationChoiceListOutputSchema,
  operationChoiceSearchOutputSchema,
  operationDescribeInputSchema,
  operationListInputSchema,
} from './operation-choice-contracts'

export {
  operationCatalogSearchInputSchema,
  operationChoiceCompareOutputSchema,
  operationChoiceDescribeOutputSchema,
  operationChoiceListOutputSchema,
  operationChoiceSearchOutputSchema,
  operationDescribeInputSchema,
  operationListInputSchema,
}

function operationMarketActionSurfaces() {
  return ['http', 'agentJson', 'chat', 'cli', 'mcp'] as const satisfies readonly ActionSurface[]
}
const readOnlyEffect = {
  class: 'observation', reversible: true, recipientKind: 'none', dataClasses: [], spendExposure: 'none', approval: 'none',
} as const
const boundaries = [
  'Read-only public discovery. Does not create authority, a Commitment, an Invocation, payment, disclosure, or external effect.',
  'Returns compact current Operation facts and public health only; caller authority and balance are decided by operation.inspect.',
  'Opaque Operation references are current-revision-bound and are never execution authority.',
] as const

function parameter(schema: z.ZodType, name: string, description: string): ActionParameter {
  const document = convertSchemaToJsonSchema(schema)
  const property: JSONSchema | undefined = document?.properties?.[name]
  const rawType = property?.type
  const type = rawType === 'integer' ? 'number' : rawType
  const allowed: readonly ActionParameterType[] = ['string', 'number', 'boolean', 'enum', 'object', 'array']
  if (typeof type !== 'string' || !allowed.includes(type as ActionParameterType)) {
    throw new Error(`Operation parameter ${name} has unsupported schema type`)
  }
  return { name, type: type as ActionParameterType, description, required: document?.required?.includes(name) ?? false }
}

const listParameters = [
  parameter(operationListInputSchema, 'limit', 'Maximum 100 compact Operations; defaults to 50.'),
  parameter(operationListInputSchema, 'cursor', 'Opaque cursor from the previous page.'),
  parameter(operationListInputSchema, 'filters', 'Allowlisted Operation filters; Operational supply is the default.'),
] as const
const searchParameters = [
  parameter(operationCatalogSearchInputSchema, 'query', 'Capability phrase from 1 to 256 characters.'),
  parameter(operationCatalogSearchInputSchema, 'limit', 'Maximum 20 compact Operations; defaults to 10.'),
  parameter(operationCatalogSearchInputSchema, 'cursor', 'Opaque cursor from the previous page.'),
  parameter(operationCatalogSearchInputSchema, 'filters', 'Allowlisted Operation filters; Operational supply is the default.'),
] as const
const describeParameters = [
  parameter(operationDescribeInputSchema, 'operationRef', 'Opaque current Operation reference.'),
] as const
const compareParameters = [
  parameter(operationCompareInputSchema, 'operationRefs', 'One to four opaque current Operation references.'),
] as const

export const registryOperationsListContract = {
  id: 'registry.operations.list', schema: operationListInputSchema, surfaces: operationMarketActionSurfaces(),
  name: 'List Operations', summary: 'Browse compact current Operational supply without a search phrase.',
  boundaries, outputSchema: operationChoiceListOutputSchema, parameters: listParameters, readOnly: true, effect: readOnlyEffect,
  invocationContract: {
    version: 'registry.operations.list:v1', consequenceClass: 'read_only', materialInputPaths: ['limit', 'cursor', 'filters'],
    authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_operation_list_result'],
    safeContinuations: ['registry.operations.describe'],
    invalidationConditions: ['action_contract_version_changed', 'filters_changed', 'cursor_changed'],
  },
} as const

export const registryOperationsSearchContract = {
  id: 'registry.operations.search', schema: operationCatalogSearchInputSchema, surfaces: operationMarketActionSurfaces(),
  name: 'Search Operations', summary: 'Search compact current Operational supply with a capability phrase.',
  boundaries, outputSchema: operationChoiceSearchOutputSchema, parameters: searchParameters, readOnly: true, effect: readOnlyEffect,
  invocationContract: {
    version: 'registry.operations.search:v3', consequenceClass: 'read_only', materialInputPaths: ['query', 'limit', 'cursor', 'filters'],
    authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_operation_search_result'],
    safeContinuations: ['registry.operations.describe'],
    invalidationConditions: ['action_contract_version_changed', 'query_changed', 'filters_changed', 'cursor_changed'],
  },
} as const

export const registryOperationsDescribeContract = {
  id: 'registry.operations.describe', schema: operationDescribeInputSchema, surfaces: operationMarketActionSurfaces(),
  name: 'Describe Operation', summary: 'Read one exact current Operation contract and its public health.',
  boundaries, outputSchema: operationChoiceDescribeOutputSchema, parameters: describeParameters, readOnly: true, effect: readOnlyEffect,
  invocationContract: {
    version: 'registry.operations.describe:v1', consequenceClass: 'read_only', materialInputPaths: ['operationRef'],
    authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_operation_description_result'],
    safeContinuations: ['operation.inspect'],
    invalidationConditions: ['action_contract_version_changed', 'operation_ref_changed'],
  },
} as const

export const registryOperationsCompareContract = {
  id: 'registry.operations.compare', schema: operationCompareInputSchema, surfaces: operationMarketActionSurfaces(),
  name: 'Compare Operations', summary: 'Compare up to four exact current Operation references using compact price and health facts.',
  boundaries, outputSchema: operationChoiceCompareOutputSchema, parameters: compareParameters, readOnly: true, effect: readOnlyEffect,
  invocationContract: {
    version: 'registry.operations.compare:v2', consequenceClass: 'read_only', materialInputPaths: ['operationRefs'],
    authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_operation_comparison_result'],
    safeContinuations: ['operation.inspect'],
    invalidationConditions: ['action_contract_version_changed', 'operation_refs_changed'],
  },
} as const
