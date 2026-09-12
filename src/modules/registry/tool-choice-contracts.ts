import { z } from 'zod'

import { jsonValueSchema } from '@/modules/capability-contract/public'
import type {
  ToolDetailResult,
  ToolSearchResult,
  PublicToolDescriptor,
} from '@/modules/capability-supply/public'
import {
  PublicToolRegistrySchemaVersion,
  publicToolAuthenticationSchema,
  publicToolParameterSchema,
  publicToolPaymentSchema,
  publicToolDisplayPriceSchema,
} from '@/modules/capability-supply/tool-schemas'
import { exactAmountSchema, formatExactAmount, formatDisplayPrice } from '@/modules/money/public'
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
  source: z.enum(['current', 'coinbase', 'payai']).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().max(8192).optional(),
  filters: toolCatalogFiltersSchema.optional(),
})
export const toolCatalogSearchInputSchema = z.strictObject({
  source: z.enum(['current', 'coinbase', 'payai']).optional(),
  query: z.string().trim().min(1).max(256),
  limit: z.number().int().min(1).max(20).default(10),
  cursor: z.string().max(8192).optional(),
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

// Additive freshness readback (review issue 4A / C16): `market-tools/list` and
// `market-tools/search` read `registrySearchDocuments`, kept current by the
// hourly "reconcile business supply projections" workload cron. Same shape as
// `/api/v1/registry`'s `x402_directory` freshness, different source.
export const supplyProjectionFreshnessSchema = z.strictObject({
  source: z.literal('supply_projection'),
  state: z.enum(['absent', 'failed', 'stale', 'fresh']),
  completedAt: z.number().optional(),
  staleAfterMs: z.number(),
})
export type SupplyProjectionFreshness = z.infer<typeof supplyProjectionFreshnessSchema>

export const listingTierSchema = z.enum(['reviewed', 'listed'])

export const compactToolCandidateSchema = z.strictObject({
  toolRef: z.string(),
  capabilityId: z.string(),
  title: z.string(),
  description: z.string(),
  provider: z.strictObject({ name: z.string(), slug: z.string() }),
  priceLabel: z.string(),
  displayPrice: publicToolDisplayPriceSchema.optional(),
  healthStatus: toolHealthStatusSchema,
  lastCheckedAt: z.number().optional(),
  lastHealthyAt: z.number().optional(),
  listingTier: listingTierSchema,
  // The human-legible canonical page (`/tools/<providerHost>/<slug>`), so an
  // agent can hand a human a clean link. Relative: this action layer has no
  // configured site base URL (see `describeActionForAgent` /
  // `readCapabilityToolDetail`, neither of which know one); callers with a
  // base URL (e.g. the `ae` CLI) join it on themselves. Absent when the Tool
  // never joined a directory row - today that includes every Provider-owned
  // Tool, which needs a slug source of its own as a follow-up.
  canonicalUrl: z.string().optional(),
})
export const publicToolChoiceSchema = compactToolCandidateSchema
export type PublicToolChoice = z.infer<typeof publicToolChoiceSchema>

const catalogUnavailableSchema = z.strictObject({
  kind: z.literal('unavailable'),
  schemaVersion: z.literal(PublicToolRegistrySchemaVersion),
  reason: z.enum(['query_invalid', 'source_unavailable', 'source_capacity_exceeded']),
})
export const toolChoiceListOutputSchema = z.union([
  z.strictObject({
    kind: z.literal('ok'),
    schemaVersion: z.literal(PublicToolRegistrySchemaVersion),
    count: z.number().int().nonnegative(),
    partialResults: z.boolean().optional(),
    items: z.array(compactToolCandidateSchema).max(100),
    pagination: toolCatalogPaginationSchema,
    freshness: supplyProjectionFreshnessSchema.optional(),
  }),
  catalogUnavailableSchema,
])
export const toolChoiceSearchOutputSchema = z.union([
  z.strictObject({
    kind: z.literal('ok'),
    schemaVersion: z.literal(PublicToolRegistrySchemaVersion),
    query: z.string(),
    count: z.number().int().nonnegative(),
    partialResults: z.boolean().optional(),
    items: z.array(compactToolCandidateSchema).max(20),
    pagination: toolCatalogPaginationSchema,
    freshness: supplyProjectionFreshnessSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('no_candidates'),
    schemaVersion: z.literal(PublicToolRegistrySchemaVersion),
    query: z.string(),
    count: z.literal(0),
    items: z.tuple([]),
    note: z.string(),
    pagination: toolCatalogPaginationSchema,
    freshness: supplyProjectionFreshnessSchema.optional(),
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
  displayPrice: publicToolDisplayPriceSchema.optional(),
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
  listingTier: listingTierSchema,
  canonicalUrl: z.string().optional(),
})
export const toolChoiceDescribeOutputSchema = z.union([
  z.strictObject({
    kind: z.literal('found'),
    schemaVersion: z.literal(PublicToolRegistrySchemaVersion),
    tool: toolDescriptionSchema,
  }),
  z.strictObject({
    kind: z.literal('not_found'),
    schemaVersion: z.literal(PublicToolRegistrySchemaVersion),
    toolRef: z.string(),
  }),
  z.strictObject({
    kind: z.literal('unavailable'),
    schemaVersion: z.literal(PublicToolRegistrySchemaVersion),
    toolRef: z.string(),
    reason: z.string(),
  }),
])
export const toolChoiceCompareOutputSchema = z.union([
  z.strictObject({
    kind: z.literal('ok'),
    schemaVersion: z.literal(PublicToolRegistrySchemaVersion),
    tools: z.array(compactToolCandidateSchema).min(1).max(4),
    // Present only when at least one requested ref did not resolve to a
    // current, available Tool; the call still succeeds for the refs that did.
    missing: z.array(z.string()).min(1).max(4).optional(),
  }),
  z.strictObject({
    kind: z.literal('unavailable'),
    schemaVersion: z.literal(PublicToolRegistrySchemaVersion),
    reason: z.enum(['query_invalid', 'tool_not_found', 'tool_unavailable']),
  }),
])

function priceLabel(tool: PublicToolDescriptor): string {
  const display = formatDisplayPrice(tool.commercial.displayPrice)
  if (display !== undefined) return display
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
    title: tool.listing.label,
    description: tool.summary,
    provider: { name: tool.business.name, slug: tool.business.slug },
    priceLabel: priceLabel(tool),
    ...(tool.commercial.displayPrice === undefined ? {} : { displayPrice: tool.commercial.displayPrice }),
    ...projectToolHealth(tool.availability, Date.now()),
    listingTier: tool.listingTier,
    ...(tool.canonical === undefined ? {} : { canonicalUrl: tool.canonical.path }),
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
  const parsed = toolCatalogFiltersSchema.safeParse(filters)
  const explicitHealthFilter = parsed.success && parsed.data.healthStatus !== undefined
  return tools.flatMap((tool) => {
    const compact = projectCompactTool(tool)
    return admitted.has(compact.healthStatus) || (!explicitHealthFilter && tool.availability.reason === 'inspection_required') ? [compact] : []
  })
}

export function projectToolListChoices(result: ToolSearchResult, filters?: unknown) {
  if (result.kind === 'unavailable') {
    return toolChoiceListOutputSchema.parse({
      kind: 'unavailable', schemaVersion: PublicToolRegistrySchemaVersion, reason: result.reason,
    })
  }
  const items = result.kind === 'ok' ? visibleTools(result.items, filters) : []
  return toolChoiceListOutputSchema.parse({
    kind: 'ok',
    schemaVersion: PublicToolRegistrySchemaVersion,
    count: items.length,
    ...(result.partialResults === undefined ? {} : { partialResults: result.partialResults }),
    items,
    pagination: result.kind === 'ok' ? result.pagination : { limit: 50, hasMore: false },
  })
}

export function projectToolSearchChoices(result: ToolSearchResult, filters?: unknown) {
  if (result.kind === 'unavailable') {
    return toolChoiceSearchOutputSchema.parse({
      kind: 'unavailable', schemaVersion: PublicToolRegistrySchemaVersion, reason: result.reason,
    })
  }
  const items = result.kind === 'ok' ? visibleTools(result.items, filters) : []
  if (result.kind === 'no_candidates' || items.length === 0) {
    const hasMore = result.kind === 'ok' && result.pagination.hasMore
    return toolChoiceSearchOutputSchema.parse({
      kind: 'no_candidates',
      schemaVersion: PublicToolRegistrySchemaVersion,
      query: result.query,
      count: 0,
      items: [],
      note: hasMore
        ? 'No Tools match this search on this page.'
        : 'No Tools match this search.',
      pagination: result.kind === 'ok' ? result.pagination : { limit: 10, hasMore: false },
    })
  }
  return toolChoiceSearchOutputSchema.parse({
    kind: 'ok',
    schemaVersion: PublicToolRegistrySchemaVersion,
    query: result.query,
    count: items.length,
    ...(result.partialResults === undefined ? {} : { partialResults: result.partialResults }),
    items,
    pagination: result.pagination,
  })
}

export function projectToolDescription(result: ToolDetailResult) {
  if (result.kind !== 'found') {
    return toolChoiceDescribeOutputSchema.parse({
      kind: result.kind,
      schemaVersion: PublicToolRegistrySchemaVersion,
      toolRef: result.toolRef,
      ...(result.kind === 'unavailable' ? { reason: result.reason } : {}),
    })
  }
  const tool = result.tool
  return toolChoiceDescribeOutputSchema.parse({
    kind: 'found',
    schemaVersion: PublicToolRegistrySchemaVersion,
    tool: {
      toolRef: tool.toolRef,
      capabilityId: tool.contract.capabilityId,
      title: tool.listing.label,
      description: tool.summary,
      provider: { name: tool.business.name, slug: tool.business.slug },
      priceLabel: priceLabel(tool),
    ...(tool.commercial.displayPrice === undefined ? {} : { displayPrice: tool.commercial.displayPrice }),
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
      listingTier: tool.listingTier,
      ...(tool.canonical === undefined ? {} : { canonicalUrl: tool.canonical.path }),
    },
  })
}

/**
 * Per-ref compare resolution (review issue: `ae compare` / `registry.tools.compare`
 * aborted the whole call when one ref was unknown). Resolved refs project as
 * `tools`; unresolved refs (not found, or unavailable) are named in `missing`.
 * The call only refuses outright when zero refs resolve.
 */
export type ToolCompareResolution =
  | Readonly<{ kind: 'ok'; tools: readonly PublicToolDescriptor[]; missing?: readonly string[] }>
  | Readonly<{ kind: 'unavailable'; reason: 'query_invalid' | 'tool_not_found' | 'tool_unavailable' }>

export function projectToolCompareChoices(result: ToolCompareResolution) {
  return toolChoiceCompareOutputSchema.parse(result.kind === 'ok'
    ? {
        kind: 'ok',
        schemaVersion: PublicToolRegistrySchemaVersion,
        tools: result.tools.map(projectCompactTool),
        ...(result.missing === undefined ? {} : { missing: result.missing }),
      }
    : { kind: 'unavailable', schemaVersion: PublicToolRegistrySchemaVersion, reason: result.reason })
}
