import { z } from 'zod'

import { jsonValueSchema } from '@/modules/capability-contract/public'
import { matchesToolFilters } from '@/modules/capability-supply/public'
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
  publicToolPriceSchema,
} from '@/modules/capability-supply/tool-schemas'
import { formatDisplayAmount, formatDisplayPrice } from '@/modules/money/public'
import { projectToolHealth } from '@/modules/capability-supply/tool-health'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'
import { truncateText } from '@/modules/common/truncate-text'
import { isPublicToolRef, parseCallableRef } from '@/modules/common/tool-ref'

import { projectToolChoiceEvidence } from './tool-choice-evidence'
import { searchVerdict } from './search-verdict'
import { searchNextActions } from './next-action'
import { toolCatalogFiltersSchema, toolCatalogSearchInputSchema, toolHealthStatusSchema } from './tool-search-input'
import { toolLatencyEvidenceSchema } from './tool-latency'

export { toolCatalogFiltersSchema, toolCatalogSearchInputSchema, toolHealthStatusSchema } from './tool-search-input'
export type { ToolHealthStatus } from '@/modules/capability-supply/tool-health'

const choiceEvidenceSchema = { verification: z.enum(['verified', 'not_verified']), network: z.enum(['mainnet', 'testnet', 'unknown']), claimSource: z.enum(['provider', 'listing']) }

export const toolListInputSchema = z.strictObject({
  source: z.enum(['current', 'coinbase', 'payai']).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().max(8192).optional(),
  filters: toolCatalogFiltersSchema.optional(),
})
const publishedToolRefSchema = z.string().regex(/^operation:v1:[0-9a-f]{64}$/u)
const directoryToolRefSchema = z.string().regex(/^registry:[0-9a-f]{64}$/u)
export const toolInspectionRefSchema = z.string().regex(/^(?:operation:v1|registry):[0-9a-f]{64}$/u)
export const toolDescribeInputSchema = z.strictObject({
  toolRef: toolInspectionRefSchema,
  includeLatency: z.boolean().optional().describe('Include observed time to result, sample count and 30-day query window. Omitted by default for legacy clients.'),
})
export const toolCatalogCompareInputSchema = z.strictObject({
  toolRefs: z.array(publishedToolRefSchema).min(1).max(4),
  includeLatency: toolDescribeInputSchema.shape.includeLatency,
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
export type SearchResult = z.output<typeof searchResultSchema>
export type SupplyProjectionFreshness = z.infer<typeof supplyProjectionFreshnessSchema>
export { isRegistryPageNext } from './next-action'
export type { RegistryNextAction, RegistryPageNext } from './next-action'
const registrySearchArgsSchema = toolCatalogSearchInputSchema.omit({ cursor: true }).extend({
  limit: toolCatalogSearchInputSchema.shape.limit.removeDefault().optional(),
})
export const registryNextActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('registry.tools.describe'), args: z.strictObject({ toolRef: toolInspectionRefSchema }), authority: z.literal('public') }),
  z.strictObject({ action: z.literal('registry.tools.search'), args: registrySearchArgsSchema.extend({ cursor: toolCatalogSearchInputSchema.shape.cursor }), authority: z.literal('public') }),
])
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
  latency: toolLatencyEvidenceSchema.optional(),
  ...choiceEvidenceSchema,
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
/** Evidence every search row shows; successRate is the observed completed/calls over Provider-side outcomes (no prior). */
export const searchSignalsSchema = z.strictObject({
  calls: z.number().nonnegative(),
  successRate: z.number().min(0).max(1).optional(),
  latencyP50Ms: z.number().nonnegative().optional(),
  lastVerifiedAt: z.number().nonnegative().optional(),
  payers30d: z.number().nonnegative().optional(),
})
export type SearchSignals = z.infer<typeof searchSignalsSchema>
const searchResultSchema = z.strictObject({
  id: z.string(),
  source: z.enum(['current', 'coinbase']),
  access: z.enum(['ae_callable', 'setup_required', 'unavailable']),
  // A Tool's operation ref, or a directory row's `registry:<hex>` listing ref that Quote resolves.
  toolRef: z.string().refine(value => { const kind = parseCallableRef(value)?.kind; return kind === 'operation' || kind === 'listing' }).optional(),
  // Why an unavailable row cannot be quoted; a key of `REASON_COPY`.
  reason: z.string().max(80).optional(),
  sourceRouteRef: z.string().max(8192).optional(),
  sourcePrice: z.string().max(80).optional(),
  title: z.string().max(72),
  summary: z.string().max(100),
  provider: z.string().max(48),
  host: z.string().max(300).optional(),
  resourcePath: z.string().max(512).optional(),
  networkLabel: z.string().max(128).optional(),
  actionClass: z.enum(['retrieve', 'transform', 'analyze', 'create', 'mutate', 'other', 'unclassified']),
  objectClass: z.enum(['web', 'document', 'image', 'location', 'chain', 'data', 'other', 'unclassified']),
  category: z.string().max(80).optional(),
  readiness: z.enum(['ready', 'unverified', 'unavailable']),
  price: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('indicative'), label: z.string(), validUntil: z.number().int().nonnegative().optional() }),
    z.strictObject({ kind: z.literal('unavailable') }),
  ]),
  detailRef: z.string(),
  next: z.array(registryNextActionSchema).max(1),
  signals: searchSignalsSchema.optional(),
  freshness: z.union([supplyProjectionFreshnessSchema, z.strictObject({
    source: z.literal('x402_directory'), state: z.enum(['absent', 'failed', 'stale', 'fresh']),
    completedAt: z.number().optional(), staleAfterMs: z.number(),
  })]).optional(),
})
const searchMetaSchema = {
  schemaVersion: z.literal(PublicToolRegistrySchemaVersion),
  query: z.string(),
  partialResults: z.boolean(),
  recipient: z.strictObject({ label: z.string(), host: z.string(), data: z.literal('query and candidate summaries') }).optional(),
  recommendation: z.strictObject({ toolRef: z.string().refine(isPublicToolRef), by: z.string().min(1).max(80) }).optional(),
  freshness: supplyProjectionFreshnessSchema.optional(),
  assessed: z.strictObject({
    source: z.enum(['current', 'coinbase', 'all']),
    scope: z.enum(['complete', 'page']),
    examined: z.number().int().nonnegative(),
    coverage: z.enum(['complete', 'partial']),
    generation: z.string().optional(),
    completedAt: z.number().optional(),
  }),
  pagination: toolCatalogPaginationSchema,
  next: z.array(registryNextActionSchema).max(1),
}
export const saveNeedDescriptorSchema = z.strictObject({
  action: z.literal('marketDemand.record'),
  args: z.strictObject({
    query: z.string().trim().min(1).max(SEARCH_QUERY_MAX_LENGTH),
    source: toolCatalogSearchInputSchema.shape.source,
    filters: toolCatalogFiltersSchema.optional(),
  }),
  requiredInput: z.tuple([z.literal('idempotencyKey')]),
  authority: z.literal('owner_or_connected_agent'),
})

export const toolChoiceSearchOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...searchMetaSchema, kind: z.literal('match'), results: z.array(searchResultSchema).min(1).max(12) }),
  z.strictObject({ ...searchMetaSchema, kind: z.literal('scoped'), results: z.array(searchResultSchema).max(12), reason: z.string() }),
  z.strictObject({ ...searchMetaSchema, kind: z.literal('noMatch'), results: z.tuple([]), reason: z.string(), saveNeed: saveNeedDescriptorSchema.optional() }),
  z.strictObject({ ...searchMetaSchema, kind: z.literal('unavailable'), pagination: toolCatalogPaginationSchema.refine(page => !page.hasMore && page.nextCursor === undefined), results: z.tuple([]), reason: z.enum(['source_unavailable', 'capacity_exceeded']) }),
])
export type SearchEnvelope = z.output<typeof toolChoiceSearchOutputSchema>
export type ToolChoiceSearchOutput = SearchEnvelope
/** Search is always read-only; only an admitted caller sees a separate write affordance. */
export function withAuthorizedSaveNeed(
  result: SearchEnvelope,
  input: z.output<typeof toolCatalogSearchInputSchema>,
  authorized: boolean,
): SearchEnvelope {
  if (result.kind !== 'noMatch') return result
  const { saveNeed: _saveNeed, ...publicResult } = result
  if (!authorized || result.assessed.scope !== 'complete'
    || result.assessed.coverage !== 'complete' || result.partialResults || result.pagination.hasMore) return publicResult
  return {
    ...publicResult,
    saveNeed: {
      action: 'marketDemand.record',
      args: {
        query: result.query,
        ...(input.source === undefined ? {} : { source: input.source }),
        ...(input.filters === undefined ? {} : { filters: input.filters }),
      },
      requiredInput: ['idempotencyKey'],
      authority: 'owner_or_connected_agent',
    },
  }
}


const toolDescriptionSchema = z.strictObject({
  toolRef: z.string(),
  capabilityId: z.string(),
  title: z.string(),
  description: z.string(),
  provider: z.strictObject({ name: z.string(), slug: z.string() }),
  priceLabel: z.string(),
  displayPrice: publicToolDisplayPriceSchema.optional(),
  commercialPrice: publicToolPriceSchema,
  healthStatus: toolHealthStatusSchema,
  latency: toolLatencyEvidenceSchema.optional(),
  readiness: z.enum(['ready', 'unverified', 'unavailable']),
  ...choiceEvidenceSchema,
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
/** Directory metadata is Provider-declared, not a published contract or a live Quote. */
export const externalToolDescriptionSchema = z.strictObject({
  kind: z.literal('external'),
  schemaVersion: z.literal(PublicToolRegistrySchemaVersion),
  tool: z.strictObject({
    id: directoryToolRefSchema,
    toolRef: directoryToolRefSchema,
    source: z.literal('coinbase'),
    access: z.enum(['ae_callable', 'setup_required', 'unavailable']),
    reason: z.string().optional(),
    readiness: z.literal('unverified'),
    verification: z.literal('not_verified'),
    claimSource: z.literal('provider'),
    title: z.string(), description: z.string(), provider: z.string(), resource: z.string(),
    method: z.string().optional(),
    input: z.record(z.string(), jsonValueSchema).optional(),
    output: z.record(z.string(), jsonValueSchema).optional(),
    prices: z.array(z.object({
      network: z.string(), scheme: z.string(), amount: z.string(),
      asset: z.string().optional(), symbol: z.string().optional(), decimalAmount: z.string().optional(),
    })),
  }),
})
export const toolChoiceDescribeOutputSchema = z.union([
  externalToolDescriptionSchema,
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
  if (price.kind === 'fixed') return (price.amount.currency === 'AUD'
    ? formatDisplayAmount(price.amount)
    : formatDisplayPrice({ kind: 'indicative', amount: price.amount })) ?? 'Price confirmed at inspection'
  if (price.minimum.currency !== price.maximum.currency) return 'Price confirmed at inspection'
  const minimum = price.minimum.currency === 'AUD'
    ? formatDisplayAmount(price.minimum)
    : formatDisplayPrice({ kind: 'indicative', amount: price.minimum })
  const maximum = price.maximum.currency === 'AUD'
    ? formatDisplayAmount(price.maximum)
    : formatDisplayPrice({ kind: 'indicative', amount: price.maximum })
  return minimum === undefined || maximum === undefined
    ? 'Price confirmed at inspection'
    : `${minimum}–${maximum}`
}

function projectCompactTool(tool: PublicToolDescriptor) {
  const { readiness: _readiness, ...evidence } = projectToolChoiceEvidence(tool)
  return compactToolCandidateSchema.parse({
    toolRef: tool.toolRef,
    capabilityId: tool.contract.capabilityId,
    title: tool.listing.label,
    description: tool.summary,
    provider: { name: tool.business.name, slug: tool.business.slug },
    priceLabel: priceLabel(tool),
    ...(tool.commercial.displayPrice === undefined ? {} : { displayPrice: tool.commercial.displayPrice }),
    ...evidence,
    listingTier: tool.listingTier,
    ...(tool.canonical === undefined ? {} : { canonicalUrl: tool.canonical.path }),
  })
}

type CatalogFilters = z.output<typeof toolCatalogFiltersSchema>

function matchesAdmittedFilters(tool: PublicToolDescriptor, filters: CatalogFilters): boolean {
  // The descriptor has no geographic fact or Bazaar classification. A Provider
  // name is not location evidence; unknown facts cannot satisfy a hard filter.
  if (filters.location !== undefined || filters.category !== undefined
    || (filters.actionClass !== undefined && filters.actionClass !== 'unclassified')
    || (filters.objectClass !== undefined && filters.objectClass !== 'unclassified')
    || (filters.priceBand !== undefined && filters.priceBand !== 'unknown')) return false
  const provider = filters.provider?.toLocaleLowerCase()
  if (provider !== undefined && tool.business.name.toLocaleLowerCase() !== provider
    && tool.business.slug.toLocaleLowerCase() !== provider) return false
  const access = tool.availability.posture === 'routeable' ? 'ae_callable' : tool.availability.posture
  if (filters.access !== undefined && filters.access !== access) return false
  if (!matchesToolFilters(tool, {
    ...(filters.effects === undefined ? {} : { effects: filters.effects }),
    ...(filters.dataUse === undefined ? {} : { dataUse: filters.dataUse }),
    ...(filters.currency === undefined ? {} : { currency: filters.currency }),
    ...(filters.maximumPrice === undefined ? {} : { maximumPrice: filters.maximumPrice }),
  })) return false
  const health = projectToolHealth(tool.availability, Date.now()).healthStatus
  return filters.healthStatus === undefined
    ? health === 'operational' || tool.availability.reason === 'inspection_required'
    : filters.healthStatus.includes(health)
}

/** Apply descriptor facts before ranking and again at the public projection. */
export function filterToolSearchCandidates(result: ToolSearchResult, filters?: unknown): ToolSearchResult {
  if (result.kind !== 'ok') return result
  const parsed = toolCatalogFiltersSchema.safeParse(filters ?? {})
  return { ...result, items: parsed.success
    ? result.items.filter(tool => matchesAdmittedFilters(tool, parsed.data)) : [] }
}

/** Directory rows do not carry contract data-use, geographic or price-ceiling facts. */
export function filterExternalSearchRows(rows: readonly SearchResult[], filters?: unknown): SearchResult[] {
  const parsed = toolCatalogFiltersSchema.safeParse(filters ?? {})
  if (!parsed.success) return []
  const selected = parsed.data
  if (selected.location !== undefined || selected.effects !== undefined || selected.dataUse !== undefined
    || selected.currency !== undefined || selected.maximumPrice !== undefined) return []
  return rows.filter(row => {
    if (selected.access !== undefined && selected.access !== row.access) return false
    if (selected.actionClass !== undefined && selected.actionClass !== row.actionClass) return false
    if (selected.objectClass !== undefined && selected.objectClass !== row.objectClass) return false
    if (selected.category !== undefined && selected.category !== row.category) return false
    // Directory rows have no observed health until a Quote probes them.
    return selected.healthStatus === undefined || selected.healthStatus.includes('unverified')
  })
}

function visibleTools(tools: readonly PublicToolDescriptor[], filters: unknown) {
  const parsed = toolCatalogFiltersSchema.safeParse(filters ?? {})
  return parsed.success
    ? tools.filter(tool => matchesAdmittedFilters(tool, parsed.data)).map(projectCompactTool) : []
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
  filters: unknown,
  assessment: Readonly<{ verdict: 'matched' | 'noMatch'; nearMisses: readonly PublicToolDescriptor[] }>,
  freshness?: SupplyProjectionFreshness,
  visibleLimit = 8,
  context: Readonly<{
    query?: string
    source?: 'current' | 'coinbase' | 'all'
    // Preserve the requested source; assessed supply can differ from cursor scope.
    searchSource?: 'current' | 'coinbase'
    searchCursor?: string
    complete?: boolean
    external?: readonly SearchResult[]
    pagination?: { limit: number; nextCursor?: string; hasMore: boolean }
    generation?: string
    completedAt?: number
    externalExamined?: number
    admittedExamined?: number
    recipient?: Readonly<{ label: string; host: string; data: 'query and candidate summaries' }>
  }> = {},
): ToolChoiceSearchOutput {
  const pagination = result.kind === 'unavailable'
    ? { limit: visibleLimit, hasMore: false as const }
    : context.pagination ?? (result.kind === 'ok' ? result.pagination : { limit: visibleLimit, hasMore: false })
  const query = context.query ?? (result.kind === 'unavailable' ? '' : result.query)
  const unavailable = result.kind === 'unavailable'
  const parsedFilters = toolCatalogFiltersSchema.safeParse(filters)
  const filtered = filterToolSearchCandidates(result, filters)
  const tools = filtered.kind === 'ok' && assessment.verdict === 'matched' ? filtered.items : []
  const rows: SearchResult[] = tools.map(tool => {
    const display = tool.commercial.displayPrice
    const formatted = display?.kind === 'indicative' && display.validUntil > Date.now()
      ? formatDisplayPrice(display) : undefined
    return {
      id: tool.toolRef,
      source: 'current',
      access: tool.availability.posture === 'routeable' ? 'ae_callable' : tool.availability.posture,
      toolRef: tool.toolRef,
      title: truncateText(tool.listing.label, 72),
      summary: truncateText(tool.summary, 100),
      provider: truncateText(tool.business.name, 48),
      actionClass: 'unclassified',
      objectClass: 'unclassified',
      readiness: projectToolChoiceEvidence(tool).readiness,
      price: formatted === undefined || !formatted.includes('A$') || display?.kind !== 'indicative'
        ? { kind: 'unavailable' } : { kind: 'indicative', label: formatted, validUntil: display.validUntil },
      detailRef: tool.toolRef,
      next: [{ action: 'registry.tools.describe', args: { toolRef: tool.toolRef }, authority: 'public' }],
    }
  })
  const displayedRows = [...rows, ...filterExternalSearchRows(context.external ?? [], filters)].slice(0, visibleLimit)
  const selected = parsedFilters.success ? parsedFilters.data : undefined
  const missingEvidence = [
    ...(selected?.location === undefined ? [] : ['location']),
    ...((context.source ?? 'current') === 'current' ? [
      ...(selected?.category === undefined ? [] : ['category']),
      ...(selected?.actionClass === undefined || selected.actionClass === 'unclassified' ? [] : ['actionClass']),
      ...(selected?.objectClass === undefined || selected.objectClass === 'unclassified' ? [] : ['objectClass']),
      ...(selected?.priceBand === undefined || selected.priceBand === 'unknown' ? [] : ['priceBand']),
    ] : [
      ...(selected?.effects === undefined ? [] : ['effects']),
      ...(selected?.dataUse === undefined ? [] : ['dataUse']),
      ...(selected?.currency === undefined ? [] : ['currency']),
      ...(selected?.maximumPrice === undefined ? [] : ['maximumPrice']),
      ...(selected?.healthStatus === undefined || selected.healthStatus.includes('unverified') ? [] : ['healthStatus']),
    ]),
  ]
  const complete = context.complete === true && missingEvidence.length === 0
    && !pagination.hasMore && (result.kind !== 'ok' || result.partialResults !== true)
  const kind = searchVerdict({ matches: displayedRows.length, assessedComplete: complete && displayedRows.length === 0, available: !unavailable })
  const assessed = {
    source: context.source ?? 'current',
    scope: complete ? 'complete' as const : 'page' as const,
    examined: (context.admittedExamined ?? (result.kind === 'ok' ? result.items.length : 0)) + (context.externalExamined ?? 0),
    coverage: complete ? 'complete' as const : 'partial' as const,
    ...(context.generation === undefined ? {} : { generation: context.generation }),
    ...(context.completedAt === undefined ? {} : { completedAt: context.completedAt }),
  }
  const searchArgs = {
    query, limit: visibleLimit,
    ...(context.searchSource === undefined ? {} : { source: context.searchSource }),
    ...(parsedFilters.success ? { filters: parsedFilters.data } : {}),
  }
  const meta = {
    schemaVersion: PublicToolRegistrySchemaVersion,
    query, partialResults: !complete,
    ...(freshness === undefined ? {} : { freshness }),
    ...(context.recipient === undefined ? {} : { recipient: context.recipient }),
    assessed, pagination,
    next: kind === 'unavailable'
      ? [{ action: 'registry.tools.search' as const, args: { ...searchArgs, ...(context.searchCursor === undefined ? {} : { cursor: context.searchCursor }) }, authority: 'public' as const }]
      : searchNextActions(query, pagination, searchArgs),
  }
  if (kind === 'unavailable') return toolChoiceSearchOutputSchema.parse({
    ...meta, kind, results: [], reason: result.kind === 'unavailable' && result.reason === 'source_capacity_exceeded' ? 'capacity_exceeded' : 'source_unavailable',
  })
  if (kind === 'match') return toolChoiceSearchOutputSchema.parse({ ...meta, kind, results: displayedRows })
  if (kind === 'scoped') return toolChoiceSearchOutputSchema.parse({
    ...meta, kind, results: displayedRows,
    reason: displayedRows.length === 0 && missingEvidence.length > 0
      ? `Required ${missingEvidence.join(', ')} evidence is unavailable in the assessed supply.`
      : 'More of the selected catalogue remains to assess.',
  })
  return toolChoiceSearchOutputSchema.parse({ ...meta, kind, results: [], reason: 'No suitable Tool in the assessed supply.' })
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
      commercialPrice: tool.commercial.price,
      ...projectToolChoiceEvidence(tool),
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
  return toolChoiceCompareOutputSchema.parse({
    ...result,
    schemaVersion: PublicToolRegistrySchemaVersion,
    ...(result.kind === 'ok' ? { tools: result.tools.map(projectCompactTool) } : {}),
  })
}
