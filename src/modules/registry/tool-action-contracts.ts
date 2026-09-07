import { convertSchemaToJsonSchema, type JSONSchema } from '@tanstack/ai'
import { z } from 'zod'

import { toolCompareInputSchema } from '@/modules/capability-supply/tool-schemas'
import type { ActionParameter, ActionParameterType, ActionSurface } from '@/modules/common/action'
import {
  toolCatalogSearchInputSchema,
  toolChoiceCompareOutputSchema,
  toolChoiceDescribeOutputSchema,
  toolChoiceListOutputSchema,
  toolChoiceSearchOutputSchema,
  toolDescribeInputSchema,
  toolListInputSchema,
} from './tool-choice-contracts'

export {
  toolCatalogSearchInputSchema,
  toolChoiceCompareOutputSchema,
  toolChoiceDescribeOutputSchema,
  toolChoiceListOutputSchema,
  toolChoiceSearchOutputSchema,
  toolDescribeInputSchema,
  toolListInputSchema,
}

function toolMarketActionSurfaces() {
  return ['http', 'agentJson', 'chat', 'cli', 'mcp'] as const satisfies readonly ActionSurface[]
}
const readOnlyEffect = {
  class: 'observation', reversible: true, recipientKind: 'none', dataClasses: [], spendExposure: 'none', approval: 'none',
} as const
const boundaries = [
  'Read-only public discovery. Does not create authority, a Quote, a Call, payment, disclosure, or external effect.',
  'Returns compact current Tool facts and public health only; caller authority and balance are decided by tool.quote.',
  'Opaque Tool references are current-version-bound and are never execution authority.',
] as const

function parameter(schema: z.ZodType, name: string, description: string): ActionParameter {
  const document = convertSchemaToJsonSchema(schema)
  const property: JSONSchema | undefined = document?.properties?.[name]
  const rawType = property?.type
  const type = rawType === 'integer' ? 'number' : rawType
  const allowed: readonly ActionParameterType[] = ['string', 'number', 'boolean', 'enum', 'object', 'array']
  if (typeof type !== 'string' || !allowed.includes(type as ActionParameterType)) {
    throw new Error(`Tool parameter ${name} has unsupported schema type`)
  }
  return { name, type: type as ActionParameterType, description, required: document?.required?.includes(name) ?? false }
}

const listParameters = [
  parameter(toolListInputSchema, 'limit', 'Maximum 100 compact Tools; defaults to 50.'),
  parameter(toolListInputSchema, 'cursor', 'Opaque cursor from the previous page.'),
  parameter(toolListInputSchema, 'filters', 'Allowlisted Tool filters; Operational supply is the default.'),
] as const
const searchParameters = [
  parameter(toolCatalogSearchInputSchema, 'query', 'Capability phrase from 1 to 256 characters.'),
  parameter(toolCatalogSearchInputSchema, 'limit', 'Maximum 20 compact Tools; defaults to 10.'),
  parameter(toolCatalogSearchInputSchema, 'cursor', 'Opaque cursor from the previous page.'),
  parameter(toolCatalogSearchInputSchema, 'filters', 'Allowlisted Tool filters; Operational supply is the default.'),
] as const
const describeParameters = [
  parameter(toolDescribeInputSchema, 'toolRef', 'Opaque current Tool reference.'),
] as const
const compareParameters = [
  parameter(toolCompareInputSchema, 'toolRefs', 'One to four opaque current Tool references.'),
] as const

export const registryToolsListContract = {
  id: 'registry.tools.list', schema: toolListInputSchema, surfaces: toolMarketActionSurfaces(),
  name: 'List Tools', summary: 'Browse compact current Tool supply without a search phrase.',
  boundaries, outputSchema: toolChoiceListOutputSchema, parameters: listParameters, readOnly: true, effect: readOnlyEffect,
  invocationContract: {
    version: 'registry.tools.list:v1', consequenceClass: 'read_only', materialInputPaths: ['limit', 'cursor', 'filters'],
    authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_tool_list_result'],
    safeContinuations: ['registry.tools.describe'],
    invalidationConditions: ['action_contract_version_changed', 'filters_changed', 'cursor_changed'],
  },
} as const

export const registryToolsSearchContract = {
  id: 'registry.tools.search', schema: toolCatalogSearchInputSchema, surfaces: toolMarketActionSurfaces(),
  name: 'Search Tools', summary: 'Search compact current Tool supply with a capability phrase.',
  boundaries, outputSchema: toolChoiceSearchOutputSchema, parameters: searchParameters, readOnly: true, effect: readOnlyEffect,
  invocationContract: {
    version: 'registry.tools.search:v3', consequenceClass: 'read_only', materialInputPaths: ['query', 'limit', 'cursor', 'filters'],
    authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_tool_search_result'],
    safeContinuations: ['registry.tools.describe'],
    invalidationConditions: ['action_contract_version_changed', 'query_changed', 'filters_changed', 'cursor_changed'],
  },
} as const

export const registryToolsDescribeContract = {
  id: 'registry.tools.describe', schema: toolDescribeInputSchema, surfaces: toolMarketActionSurfaces(),
  name: 'Describe Tool', summary: 'Read one exact current Tool contract and its public health.',
  boundaries, outputSchema: toolChoiceDescribeOutputSchema, parameters: describeParameters, readOnly: true, effect: readOnlyEffect,
  invocationContract: {
    version: 'registry.tools.describe:v1', consequenceClass: 'read_only', materialInputPaths: ['toolRef'],
    authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_tool_description_result'],
    safeContinuations: ['tool.quote'],
    invalidationConditions: ['action_contract_version_changed', 'tool_ref_changed'],
  },
} as const

export const registryToolsCompareContract = {
  id: 'registry.tools.compare', schema: toolCompareInputSchema, surfaces: toolMarketActionSurfaces(),
  name: 'Compare Tools', summary: 'Compare up to four exact current Tool references using compact price and health facts.',
  boundaries, outputSchema: toolChoiceCompareOutputSchema, parameters: compareParameters, readOnly: true, effect: readOnlyEffect,
  invocationContract: {
    version: 'registry.tools.compare:v2', consequenceClass: 'read_only', materialInputPaths: ['toolRefs'],
    authorityRequirement: 'none', retryClass: 'replayable', expectedEvidence: ['public_tool_comparison_result'],
    safeContinuations: ['tool.quote'],
    invalidationConditions: ['action_contract_version_changed', 'tool_refs_changed'],
  },
} as const
