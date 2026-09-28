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
  publicToolPriceSchema,
} from '@/modules/capability-supply/tool-schemas'
import { exactAmountSchema, formatDisplayAmount, formatDisplayPrice } from '@/modules/money/public'
import { projectToolHealth, type ToolHealthStatus } from '@/modules/capability-supply/tool-health'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'
import { projectToolChoiceEvidence } from './tool-choice-evidence'
import { searchVerdict } from './search-verdict'
import { searchNextActions } from './next-action'

export type { ToolHealthStatus } from '@/modules/capability-supply/tool-health'

export const toolHealthStatusSchema = z.enum([
  'operational',
  'degraded',
  'unverified',
])
const choiceEvidenceSchema = { verification: z.enum(['verified', 'not_verified']), network: z.enum(['mainnet', 'testnet', 'unknown']), claimSource: z.enum(['provider', 'listing']) }

export const toolCatalogFiltersSchema = z.strictObject({
  actionClass: z.enum(['retrieve', 'transform', 'analyze', 'create', 'mutate', 'other', 'unclassified']).optional(),
  objectClass: z.enum(['web', 'document', 'image', 'location', 'chain', 'data', 'other', 'unclassified']).optional(),
  category: z.string().max(80).optional(),
  provider: z.string().max(200).optional(),
  access: z.enum(['ae_callable', 'external_listing']).optional(),
  priceBand: z.enum(['lt_0_01', '0_01_to_0_03', '0_03_to_0_10', '0_10_to_1', '1_to_10', '10_plus', 'unknown']).optional(),
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
  source: z.enum(['current', 'coinbase']).optional(),
  query: z.string().trim().min(1).max(SEARCH_QUERY_MAX_LENGTH),
  limit: z.number().int().min(1).max(12).default(8),
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
export type SearchResult = z.output<typeof searchResultSchema>
export type SupplyProjectionFreshness = z.infer<typeof supplyProjectionFreshnessSchema>
export type { RegistryNextAction } from './next-action'
export const registryNextActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('describe'), args: z.strictObject({ toolRef: z.string().regex(/^operation:v1:[0-9a-f]{64}$/).transform((ref) => ref as PublicToolRef) }), authority: z.literal('public') }),
  z.strictObject({ action: z.literal('describe-external'), args: z.strictObject({ id: z.string() }), authority: z.literal('public') }),
  z.strictObject({ action: z.literal('next-page'), args: z.strictObject({ query: z.string(), cursor: z.string() }), authority: z.literal('public') }),
  z.strictObject({ action: z.literal('broaden'), args: z.strictObject({ query: z.string() }), authority: z.literal('public') }),
  z.strictObject({ action: z.literal('retry'), args: z.strictObject({ query: z.string() }), authority: z.literal('public') }),
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
const publicToolRefSchema = z.string().regex(/^operation:v1:[0-9a-f]{64}$/).transform((ref) => ref as PublicToolRef)
const searchResultSchema = z.strictObject({
  id: z.string(),
  source: z.enum(['current', 'coinbase']),
  access: z.enum(['ae_callable', 'external_listing', 'setup_required', 'unavailable']),
  toolRef: publicToolRefSchema.optional(),
  sourceRouteRef: z.string().max(8192).optional(),
  sourcePrice: z.string().max(80).optional(),
  title: z.string().max(72),
  summary: z.string().max(100),
  provider: z.string().max(48),
  actionClass: z.enum(['retrieve', 'transform', 'analyze', 'create', 'mutate', 'other', 'unclassified']),
  objectClass: z.enum(['web', 'document', 'image', 'location', 'chain', 'data', 'other', 'unclassified']),
  category: z.string().max(80).optional(),
  readiness: z.enum(['ready', 'unverified', 'unavailable']),
  price: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('indicative'), label: z.string() }),
    z.strictObject({ kind: z.literal('unavailable') }),
  ]),
  detailRef: z.string(),
  next: z.array(registryNextActionSchema).length(1),
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
  next: z.array(registryNextActionSchema),
}
export const toolChoiceSearchOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...searchMetaSchema, kind: z.literal('match'), results: z.array(searchResultSchema).min(1).max(12) }),
  z.strictObject({ ...searchMetaSchema, kind: z.literal('scoped'), results: z.array(searchResultSchema).max(12), reason: z.string() }),
  z.strictObject({ ...searchMetaSchema, kind: z.literal('noMatch'), results: z.tuple([]), reason: z.string() }),
  z.strictObject({ ...searchMetaSchema, kind: z.literal('unavailable'), results: z.tuple([]), reason: z.enum(['source_unavailable', 'capacity_exceeded']) }),
])
export type SearchEnvelope = z.output<typeof toolChoiceSearchOutputSchema>
export type ToolChoiceSearchOutput = SearchEnvelope

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
  if (price.kind === 'fixed') return price.amount.currency === 'AUD'
    ? formatDisplayAmount(price.amount) : formatDisplayPrice({ kind: 'unavailable' }) ?? 'AUD estimate temporarily unavailable'
  return price.minimum.currency === 'AUD' && price.maximum.currency === 'AUD'
    ? `${formatDisplayAmount(price.minimum)}–${formatDisplayAmount(price.maximum)}`
    : formatDisplayPrice({ kind: 'unavailable' }) ?? 'AUD estimate temporarily unavailable'
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
  filters: unknown,
  assessment: Readonly<{ verdict: 'matched' | 'degraded' | 'noMatch'; reason?: string; nearMisses: readonly PublicToolDescriptor[] }>,
  freshness?: SupplyProjectionFreshness,
  visibleLimit = 8,
  context: Readonly<{
    query?: string
    source?: 'current' | 'coinbase' | 'all'
    complete?: boolean
    external?: readonly SearchResult[]
    pagination?: { limit: number; nextCursor?: string; hasMore: boolean }
    generation?: string
    completedAt?: number
    externalExamined?: number
    admittedExamined?: number
    externalAvailable?: boolean
    recipient?: Readonly<{ label: string; host: string; data: 'query and candidate summaries' }>
  }> = {},
): ToolChoiceSearchOutput {
  const pagination = context.pagination ?? (result.kind === 'ok' ? result.pagination : { limit: visibleLimit, hasMore: false })
  const query = context.query ?? (result.kind === 'unavailable' ? '' : result.query)
  const unavailable = result.kind === 'unavailable' || assessment.verdict === 'degraded' || context.externalAvailable === false
  const admitted = admittedHealth(filters)
  const parsedFilters = toolCatalogFiltersSchema.safeParse(filters)
  const explicitHealthFilter = parsedFilters.success && parsedFilters.data.healthStatus !== undefined
  const tools = result.kind === 'ok' && assessment.verdict === 'matched'
    ? result.items.filter(tool => admitted.has(projectToolHealth(tool.availability, Date.now()).healthStatus)
      || (!explicitHealthFilter && tool.availability.reason === 'inspection_required'))
    : []
  const rows: SearchResult[] = tools.map(tool => {
    const display = tool.commercial.displayPrice
    const formatted = display?.kind === 'indicative' && display.validUntil > Date.now()
      ? formatDisplayPrice(display) : undefined
    return {
      id: tool.toolRef,
      source: 'current',
      access: tool.availability.posture === 'routeable' ? 'ae_callable' : tool.availability.posture,
      toolRef: tool.toolRef,
      title: Array.from(tool.listing.label).slice(0, 72).join(''),
      summary: Array.from(tool.summary).slice(0, 100).join(''),
      provider: Array.from(tool.business.name).slice(0, 48).join(''),
      actionClass: 'unclassified',
      objectClass: 'unclassified',
      readiness: projectToolChoiceEvidence(tool).readiness,
      price: formatted === undefined || !formatted.includes('A$') ? { kind: 'unavailable' } : { kind: 'indicative', label: formatted },
      detailRef: tool.toolRef,
      next: [{ action: 'describe', args: { toolRef: tool.toolRef }, authority: 'public' }],
      ...(freshness === undefined ? {} : { freshness }),
    }
  })
  const displayedRows = [...rows, ...context.external ?? []].slice(0, visibleLimit)
  const complete = context.complete === true && !pagination.hasMore && (result.kind !== 'ok' || result.partialResults !== true)
  const kind = searchVerdict({ matches: rows.length, assessedComplete: complete && displayedRows.length === 0, available: !unavailable })
  const assessed = {
    source: context.source ?? 'current',
    scope: complete ? 'complete' as const : 'page' as const,
    examined: (context.admittedExamined ?? (result.kind === 'ok' ? result.items.length : 0)) + (context.externalExamined ?? 0),
    coverage: complete ? 'complete' as const : 'partial' as const,
    ...(context.generation === undefined ? {} : { generation: context.generation }),
    ...(context.completedAt === undefined ? {} : { completedAt: context.completedAt }),
  }
  const meta = {
    schemaVersion: PublicToolRegistrySchemaVersion,
    query, partialResults: !complete,
    ...(freshness === undefined ? {} : { freshness }),
    ...(context.recipient === undefined ? {} : { recipient: context.recipient }),
    assessed, pagination,
    next: kind === 'unavailable'
      ? [{ action: 'retry' as const, args: { query }, authority: 'public' as const }]
      : searchNextActions(query, pagination),
  }
  if (kind === 'unavailable') return toolChoiceSearchOutputSchema.parse({
    ...meta, kind, results: [], reason: result.kind === 'unavailable' && result.reason === 'source_capacity_exceeded' ? 'capacity_exceeded' : 'source_unavailable',
  })
  if (kind === 'match') return toolChoiceSearchOutputSchema.parse({ ...meta, kind, results: displayedRows })
  if (kind === 'scoped') return toolChoiceSearchOutputSchema.parse({
    ...meta, kind, results: displayedRows, reason: 'More of the selected catalogue remains to assess.',
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
  return toolChoiceCompareOutputSchema.parse(result.kind === 'ok'
    ? {
        kind: 'ok',
        schemaVersion: PublicToolRegistrySchemaVersion,
        tools: result.tools.map(projectCompactTool),
        ...(result.missing === undefined ? {} : { missing: result.missing }),
      }
    : { kind: 'unavailable', schemaVersion: PublicToolRegistrySchemaVersion, reason: result.reason })
}
