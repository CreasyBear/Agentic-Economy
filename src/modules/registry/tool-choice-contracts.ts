import { z } from 'zod'

import { jsonValueSchema } from '@/modules/capability-contract/public'
import type {
  ToolDetailResult,
  ToolSearchResult,
  PublicToolDescriptor,
  PublicToolRef,
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
import { searchNextActions } from './next-action'

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
  detail: z.enum(['concise', 'full']).optional(),
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
export type RegistryNextAction =
  | Readonly<{ action: 'describe'; args: { toolRef: PublicToolRef }; authority: 'public' }>
  | Readonly<{ action: 'next-page'; args: { query: string; cursor: string }; authority: 'public' }>
  | Readonly<{ action: 'broaden'; args: { query: string }; authority: 'public' }>
export const registryNextActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('describe'), args: z.strictObject({ toolRef: z.string().regex(/^operation:v1:[0-9a-f]{64}$/).transform((ref) => ref as PublicToolRef) }), authority: z.literal('public') }),
  z.strictObject({ action: z.literal('next-page'), args: z.strictObject({ query: z.string(), cursor: z.string() }), authority: z.literal('public') }),
  z.strictObject({ action: z.literal('broaden'), args: z.strictObject({ query: z.string() }), authority: z.literal('public') }),
])

export type SearchResult = Readonly<{
  toolRef: PublicToolRef
  title: string
  summary: string
  matchReason: string
  readiness: 'ready' | 'unverified' | 'unavailable'
  entitlement: 'public' | 'requires_auth' | 'not_entitled'
  price: { kind: 'indicative'; label: string }
  details?: Readonly<{ capabilityId: string; provider: { name: string; slug: string }; description: string; listingTier: 'reviewed' | 'listed' }> | undefined
  next: readonly RegistryNextAction[]
}>
export type SearchMeta = Readonly<{
  schemaVersion: typeof PublicToolRegistrySchemaVersion
  partialResults: boolean
  freshness?: SupplyProjectionFreshness | undefined
  pagination: z.infer<typeof toolCatalogPaginationSchema>
  next: readonly RegistryNextAction[]
}>

export type SearchEnvelope =
  | (SearchMeta & Readonly<{ kind: 'matched'; query: string; results: readonly [SearchResult, ...SearchResult[]]; recommendation: { mode: 'fast' | 'deep'; engine: string; text: string; citations: readonly { toolRef: PublicToolRef; span: { start: number; end: number } }[] } }>)
  | (SearchMeta & Readonly<{ kind: 'degraded'; query: string; reason: string; results: readonly [SearchResult, ...SearchResult[]] }>)
  | (SearchMeta & Readonly<{ kind: 'noMatch'; query: string; scope: 'page' | 'exhausted'; results: readonly []; nearMisses: readonly SearchResult[]; reason: string; suggestions: readonly string[] }>)
  | (SearchMeta & Readonly<{ kind: 'unavailable'; reason: 'source_unavailable' | 'capacity_exceeded'; results: readonly [] }>)

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
const publicToolRefSchema = z.string().regex(/^operation:v1:[0-9a-f]{64}$/).transform((ref) => ref as PublicToolRef)
const searchResultSchema = z.strictObject({
  toolRef: publicToolRefSchema,
  title: z.string(),
  summary: z.string(),
  matchReason: z.string(),
  readiness: z.enum(['ready', 'unverified', 'unavailable']),
  entitlement: z.enum(['public', 'requires_auth', 'not_entitled']),
  price: z.strictObject({ kind: z.literal('indicative'), label: z.string() }),
  details: z.strictObject({ capabilityId: z.string(), provider: z.strictObject({ name: z.string(), slug: z.string() }), description: z.string(), listingTier: listingTierSchema }).optional(),
  next: z.array(registryNextActionSchema),
})
const searchMetaSchema = {
  schemaVersion: z.literal(PublicToolRegistrySchemaVersion),
  partialResults: z.boolean(),
  freshness: supplyProjectionFreshnessSchema.optional(),
  pagination: toolCatalogPaginationSchema,
  next: z.array(registryNextActionSchema),
}
export const toolChoiceSearchOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...searchMetaSchema, kind: z.literal('matched'), query: z.string(),
    results: z.tuple([searchResultSchema], searchResultSchema),
    recommendation: z.strictObject({
      mode: z.enum(['fast', 'deep']), engine: z.string(), text: z.string(),
      citations: z.array(z.strictObject({ toolRef: publicToolRefSchema, span: z.strictObject({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }) })),
    }),
  }),
  z.strictObject({ ...searchMetaSchema, kind: z.literal('degraded'), query: z.string(), reason: z.string(), results: z.array(searchResultSchema).min(1) }),
  z.strictObject({ ...searchMetaSchema, kind: z.literal('noMatch'), query: z.string(), scope: z.enum(['page', 'exhausted']), reason: z.string(), results: z.tuple([]), nearMisses: z.array(searchResultSchema).max(3), suggestions: z.array(z.string()) }),
  z.strictObject({ ...searchMetaSchema, kind: z.literal('unavailable'), reason: z.enum(['source_unavailable', 'capacity_exceeded']), results: z.tuple([]) }),
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

export function projectToolSearchChoices(
  result: ToolSearchResult,
  filters?: unknown,
  assessment?: Readonly<{ verdict: 'matched' | 'degraded' | 'noMatch'; reason?: string; nearMisses: readonly PublicToolDescriptor[] }>,
  freshness?: SupplyProjectionFreshness,
  detail: 'concise' | 'full' = 'concise',
): z.output<typeof toolChoiceSearchOutputSchema> {
  const pagination = result.kind === 'ok' ? result.pagination : { limit: 10, hasMore: false }
  const meta = {
    schemaVersion: PublicToolRegistrySchemaVersion,
    partialResults: result.kind === 'ok' ? result.partialResults === true : false,
    ...(freshness === undefined ? {} : { freshness }),
    pagination,
    next: result.kind === 'unavailable' ? [] : searchNextActions(result.query, pagination),
  }
  if (result.kind === 'unavailable') {
    return toolChoiceSearchOutputSchema.parse({
      ...meta, kind: 'unavailable',
      reason: result.reason === 'source_capacity_exceeded' ? 'capacity_exceeded' : 'source_unavailable',
      results: [],
    })
  }
  const project = (tool: PublicToolDescriptor): SearchResult => ({
    toolRef: tool.toolRef,
    title: detail === 'full' ? tool.listing.label : tool.listing.label.slice(0, 64),
    summary: tool.summary.slice(0, detail === 'full' ? undefined : 40),
    matchReason: 'Text overlap',
    readiness: tool.availability.posture === 'routeable' ? 'ready' : tool.availability.posture === 'setup_required' ? 'unverified' : 'unavailable',
    entitlement: tool.authentication.kind === 'unknown' ? 'not_entitled' : tool.authentication.kind === 'x402' ? 'public' : 'requires_auth',
    price: { kind: 'indicative', label: priceLabel(tool) },
    next: [{ action: 'describe', args: { toolRef: tool.toolRef }, authority: 'public' }],
    ...(detail === 'full' ? { details: {
      capabilityId: tool.contract.capabilityId,
      provider: { name: tool.business.name, slug: tool.business.slug },
      description: tool.summary,
      listingTier: tool.listingTier,
    } } : {}),
  })
  const admitted = admittedHealth(filters)
  const parsedFilters = toolCatalogFiltersSchema.safeParse(filters)
  const explicitHealthFilter = parsedFilters.success && parsedFilters.data.healthStatus !== undefined
  const visible = (tool: PublicToolDescriptor) => admitted.has(projectToolHealth(tool.availability, Date.now()).healthStatus)
    || (!explicitHealthFilter && tool.availability.reason === 'inspection_required')
  const results = result.kind === 'ok' ? result.items.filter(visible).map(project) : []
  const nearMisses = (assessment?.nearMisses ?? []).filter(visible).slice(0, 3).map(project)
  if (results.length === 0 || assessment?.verdict === 'noMatch') {
    return toolChoiceSearchOutputSchema.parse({
      ...meta, kind: 'noMatch', query: result.query, scope: pagination.hasMore ? 'page' : 'exhausted',
      results: [], nearMisses, reason: meta.partialResults
        ? 'No suitable Tool on this incomplete supply page.'
        : 'No suitable Tool found in the searched supply.',
      suggestions: ['Broaden the capability request or try the next page.'],
    })
  }
  if (assessment?.verdict !== 'matched') {
    return toolChoiceSearchOutputSchema.parse({
      ...meta, kind: 'degraded', query: result.query,
      reason: assessment?.reason ?? 'Suitability ranking is temporarily unavailable.',
      results,
    })
  }
  const lead = results[0]
  if (lead === undefined) throw new Error('matched_search_without_result')
  const text = `Inspect ${lead.title} before use.`
  return toolChoiceSearchOutputSchema.parse({
    ...meta, kind: 'matched', query: result.query, results,
    recommendation: { mode: 'fast', engine: 'jev_system_one', text,
      citations: [{ toolRef: lead.toolRef, span: { start: 8, end: 8 + lead.title.length } }] },
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
