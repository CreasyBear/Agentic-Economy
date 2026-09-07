import { z } from 'zod'

import { jsonValueSchema } from '@/modules/capability-contract/public'
import type {
  ToolCompareResult,
  ToolDetailResult,
  ToolSearchResult,
  PublicToolDescriptor,
} from '@/modules/capability-supply/public'
import {
  publicToolAuthenticationSchema,
  publicToolParameterSchema,
  publicToolPaymentSchema,
} from '@/modules/capability-supply/tool-schemas'
import { exactAmountSchema, formatExactAmount } from '@/modules/money/public'
import {
  projectToolHealth,
  type ToolHealthStatus,
} from '@/modules/capability-supply/tool-health'

export type { ToolHealthStatus } from '@/modules/capability-supply/tool-health'

export const toolHealthStatusSchema = z.enum([
  'operational',
  'degraded',
  'unverified',
])

export const toolCatalogFiltersSchema = z.strictObject({
  networkId: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().min(1).max(200).optional(),
  effects: z.array(z.enum(['data_release', 'financial_exposure', 'external_state_change'])).max(3).optional(),
  dataUse: z.array(z.enum(['public', 'personal', 'sensitive', 'credential'])).max(4).optional(),
  healthStatus: z.array(toolHealthStatusSchema).min(1).max(3).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  maximumPrice: exactAmountSchema.optional(),
})

export const toolListInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().max(512).optional(),
  filters: toolCatalogFiltersSchema.optional(),
})
export const toolCatalogSearchInputSchema = z.strictObject({
  query: z.string().trim().min(1).max(256),
  limit: z.number().int().min(1).max(20).default(10),
  cursor: z.string().max(512).optional(),
  filters: toolCatalogFiltersSchema.optional(),
})
export const toolDescribeInputSchema = z.strictObject({
  toolRef: z.string().regex(/^operation:v1:[0-9a-f]{64}$/),
})
export const toolCatalogPaginationSchema = z.strictObject({
  limit: z.number().int().positive(),
  nextCursor: z.string().optional(),
  hasMore: z.boolean(),
})

export const compactToolCandidateSchema = z.strictObject({
  toolRef: z.string(),
  capabilityId: z.string(),
  title: z.string(),
  description: z.string(),
  provider: z.strictObject({ name: z.string(), slug: z.string() }),
  priceLabel: z.string(),
  healthStatus: toolHealthStatusSchema,
  lastCheckedAt: z.number().optional(),
  lastHealthyAt: z.number().optional(),
})
export const publicToolChoiceSchema = compactToolCandidateSchema
export type PublicToolChoice = z.infer<typeof publicToolChoiceSchema>

const catalogUnavailableSchema = z.strictObject({
  kind: z.literal('unavailable'),
  schemaVersion: z.literal('registry-tools:v3'),
  reason: z.enum(['query_invalid', 'source_unavailable', 'source_capacity_exceeded']),
})
export const toolChoiceListOutputSchema = z.union([
  z.strictObject({
    kind: z.literal('ok'),
    schemaVersion: z.literal('registry-tools:v3'),
    count: z.number().int().nonnegative(),
    items: z.array(compactToolCandidateSchema).max(100),
    pagination: toolCatalogPaginationSchema,
  }),
  catalogUnavailableSchema,
])
export const toolChoiceSearchOutputSchema = z.union([
  z.strictObject({
    kind: z.literal('ok'),
    schemaVersion: z.literal('registry-tools:v3'),
    query: z.string(),
    count: z.number().int().nonnegative(),
    items: z.array(compactToolCandidateSchema).max(20),
    pagination: toolCatalogPaginationSchema,
  }),
  z.strictObject({
    kind: z.literal('no_candidates'),
    schemaVersion: z.literal('registry-tools:v3'),
    query: z.string(),
    count: z.literal(0),
    items: z.tuple([]),
    note: z.string(),
    pagination: toolCatalogPaginationSchema,
  }),
  catalogUnavailableSchema,
])

const toolDescriptionSchema = z.strictObject({
  toolRef: z.string(),
  capabilityId: z.string(),
  title: z.string(),
  description: z.string(),
  provider: z.strictObject({ name: z.string(), slug: z.string() }),
  priceLabel: z.string(),
  healthStatus: toolHealthStatusSchema,
  lastCheckedAt: z.number().optional(),
  lastHealthyAt: z.number().optional(),
  inputJsonSchema: z.record(z.string(), jsonValueSchema),
  outputJsonSchema: z.record(z.string(), jsonValueSchema),
  materialTerms: z.array(z.strictObject({ label: z.string(), value: z.string() })),
  dataUse: z.array(z.strictObject({
    effectId: z.string(),
    inputPointer: z.string(),
    classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
    phase: z.enum(['preparation', 'execution']),
    recipient: z.enum(['candidate_binding', 'selected_binding', 'named_recipient']),
    purposes: z.array(z.string()),
  })),
  effects: z.array(z.strictObject({
    effectId: z.string(),
    class: z.enum(['data_release', 'financial_exposure', 'external_state_change']),
    authority: z.enum(['none', 'explicit', 'mandate_or_explicit']),
    reversibility: z.enum(['not_applicable', 'reversible', 'conditional', 'irreversible']),
  })),
  evidence: z.array(z.strictObject({
    evidenceId: z.string(),
    outputPointer: z.string(),
    purpose: z.enum(['comparison', 'completion', 'recovery']),
  })),
  authentication: publicToolAuthenticationSchema,
  payment: publicToolPaymentSchema.optional(),
  parameters: z.array(publicToolParameterSchema).optional(),
})
export const toolChoiceDescribeOutputSchema = z.union([
  z.strictObject({
    kind: z.literal('found'),
    schemaVersion: z.literal('registry-tools:v2'),
    tool: toolDescriptionSchema,
  }),
  z.strictObject({
    kind: z.literal('not_found'),
    schemaVersion: z.literal('registry-tools:v2'),
    toolRef: z.string(),
  }),
  z.strictObject({
    kind: z.literal('unavailable'),
    schemaVersion: z.literal('registry-tools:v2'),
    toolRef: z.string(),
    reason: z.string(),
  }),
])
export const toolChoiceCompareOutputSchema = z.union([
  z.strictObject({
    kind: z.literal('ok'),
    schemaVersion: z.literal('registry-tools:v2'),
    tools: z.array(compactToolCandidateSchema).min(1).max(4),
  }),
  z.strictObject({
    kind: z.literal('unavailable'),
    schemaVersion: z.literal('registry-tools:v2'),
    reason: z.enum(['query_invalid', 'tool_not_found', 'tool_unavailable']),
  }),
])

function priceLabel(tool: PublicToolDescriptor): string {
  const price = tool.commercial.price
  if (price.kind === 'on_request') return 'Price confirmed at inspection'
  if (price.kind === 'fixed') {
    const amount = formatExactAmount(price.amount)
    return amount === undefined ? 'Price confirmed at inspection' : `${price.amount.currency} ${amount}`
  }
  const minimum = formatExactAmount(price.minimum)
  const maximum = formatExactAmount(price.maximum)
  return minimum === undefined || maximum === undefined || price.minimum.currency !== price.maximum.currency
    ? 'Price confirmed at inspection'
    : `${price.minimum.currency} ${minimum}\u2013${maximum}`
}

function projectCompactTool(tool: PublicToolDescriptor) {
  return compactToolCandidateSchema.parse({
    toolRef: tool.toolRef,
    capabilityId: tool.contract.capabilityId,
    title: tool.offering.label,
    description: tool.summary,
    provider: { name: tool.business.name, slug: tool.business.slug },
    priceLabel: priceLabel(tool),
    ...projectToolHealth(tool.availability, Date.now()),
  })
}

function admittedHealth(filters: unknown): Set<ToolHealthStatus> {
  const parsed = toolCatalogFiltersSchema.safeParse(filters)
  return new Set(parsed.success && parsed.data.healthStatus !== undefined
    ? parsed.data.healthStatus
    : ['operational'])
}

function visibleTools(tools: readonly PublicToolDescriptor[], filters: unknown) {
  const admitted = admittedHealth(filters)
  return tools.map(projectCompactTool).filter((tool) => admitted.has(tool.healthStatus))
}

export function projectToolListChoices(result: ToolSearchResult, filters?: unknown) {
  if (result.kind === 'unavailable') {
    return toolChoiceListOutputSchema.parse({
      kind: 'unavailable', schemaVersion: 'registry-tools:v3', reason: result.reason,
    })
  }
  const items = result.kind === 'ok' ? visibleTools(result.items, filters) : []
  return toolChoiceListOutputSchema.parse({
    kind: 'ok',
    schemaVersion: 'registry-tools:v3',
    count: items.length,
    items,
    pagination: result.kind === 'ok' ? result.pagination : { limit: 50, hasMore: false },
  })
}

export function projectToolSearchChoices(result: ToolSearchResult, filters?: unknown) {
  if (result.kind === 'unavailable') {
    return toolChoiceSearchOutputSchema.parse({
      kind: 'unavailable', schemaVersion: 'registry-tools:v3', reason: result.reason,
    })
  }
  const items = result.kind === 'ok' ? visibleTools(result.items, filters) : []
  if (result.kind === 'no_candidates' || items.length === 0) {
    return toolChoiceSearchOutputSchema.parse({
      kind: 'no_candidates',
      schemaVersion: 'registry-tools:v3',
      query: result.query,
      count: 0,
      items: [],
      note: 'No operational Tools matched this search.',
      pagination: result.kind === 'ok' ? result.pagination : { limit: 10, hasMore: false },
    })
  }
  return toolChoiceSearchOutputSchema.parse({
    kind: 'ok',
    schemaVersion: 'registry-tools:v3',
    query: result.query,
    count: items.length,
    items,
    pagination: result.pagination,
  })
}

export function projectToolDescription(result: ToolDetailResult) {
  if (result.kind !== 'found') {
    return toolChoiceDescribeOutputSchema.parse({
      kind: result.kind,
      schemaVersion: 'registry-tools:v2',
      toolRef: result.toolRef,
      ...(result.kind === 'unavailable' ? { reason: result.reason } : {}),
    })
  }
  const tool = result.tool
  return toolChoiceDescribeOutputSchema.parse({
    kind: 'found',
    schemaVersion: 'registry-tools:v2',
    tool: {
      toolRef: tool.toolRef,
      capabilityId: tool.contract.capabilityId,
      title: tool.offering.label,
      description: tool.summary,
      provider: { name: tool.business.name, slug: tool.business.slug },
      priceLabel: priceLabel(tool),
      ...projectToolHealth(tool.availability, Date.now()),
      inputJsonSchema: tool.contract.inputJsonSchema,
      outputJsonSchema: tool.contract.outputJsonSchema,
      materialTerms: tool.commercial.materialTerms,
      dataUse: tool.dataUse,
      effects: tool.effects,
      evidence: tool.evidence,
      authentication: tool.authentication,
      ...(tool.payment === undefined ? {} : { payment: tool.payment }),
      ...(tool.parameters === undefined ? {} : { parameters: tool.parameters }),
    },
  })
}

export function projectToolCompareChoices(result: ToolCompareResult) {
  return toolChoiceCompareOutputSchema.parse(result.kind === 'ok'
    ? {
        kind: 'ok',
        schemaVersion: 'registry-tools:v2',
        tools: result.tools.map(projectCompactTool),
      }
    : { kind: 'unavailable', schemaVersion: 'registry-tools:v2', reason: result.reason })
}
