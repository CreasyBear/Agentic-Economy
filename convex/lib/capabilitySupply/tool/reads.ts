import { filter } from 'convex-helpers/server/filter'

import { CURRENT_TOOL_PROJECTION_NAVIGATION } from '@/modules/actions/contract'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { normalizeSearchText, SEARCH_STOP_WORDS } from '@/modules/common/normalize-search-text'
import {
  compareCapabilityTools,
  detailCapabilityTool,
  projectCapabilityTool,
  matchesToolFilters,
  normalizeToolSearchInput,
  noToolNavigation,
  toolSearchInputSchema,
  type PublicToolDescriptor,
  serializeToolCompareResult,
  serializeToolDetailResult,
  serializeToolSearchResult,
  type CapabilityToolSourcePort,
  type CapabilityToolSourceRecord,
  type ToolCompareInput,
  type ToolDetailInput,
  type ToolSearchInput,
} from '@/modules/capability-supply/public'

import type { QueryCtx } from '../../../_generated/server'
import { toolRecord } from './projection'

export async function searchHandler(ctx: QueryCtx, args: ToolSearchInput) {
  const navigation = noToolNavigation(CURRENT_TOOL_PROJECTION_NAVIGATION)
  const parsed = toolSearchInputSchema.safeParse(args)
  const normalized = parsed.success ? normalizeToolSearchInput({ ...parsed.data, limit: parsed.data.limit ?? 20 }) : undefined
  if (normalized === undefined || (args.source !== undefined && args.source !== 'current')) {
    return serializeToolSearchResult({ kind: 'unavailable', schemaVersion: 'registry-tools:v3', reason: 'query_invalid', navigation })
  }
  args = { ...args, ...normalized }
  const now = Date.now()
  const query = args.query.trim()
  // Requires a validated request. Native full-text search matches any supplied
  // word, so filler such as "from" must not establish capability relevance.
  // Preserve the literal request, eligibility and native cursor semantics;
  // a nonempty request with no meaningful terms returns no candidates, never browse.
  const searchQuery = normalizeSearchText(query).split(' ').filter((token) => token.length > 0 && !SEARCH_STOP_WORDS.has(token)).join(' ')
  if (query.length > 0 && searchQuery.length === 0) {
    return serializeToolSearchResult({
      kind: 'no_candidates', schemaVersion: 'registry-tools:v3', query,
      appliedFilters: args.filters ?? {}, matchedCount: 0, ranking: [], navigation,
    })
  }
  const limit = args.limit ?? 20
  const networkId = args.filters?.networkId
  const source = query.length > 0
    ? ctx.db.query('capabilityPublications').withSearchIndex('search_text', (q) => {
        const search = q.search('searchText', searchQuery).eq('disposition', 'current')
        return networkId === undefined ? search : search.eq('networkId', networkId)
      })
    : networkId === undefined
      ? ctx.db.query('capabilityPublications').withIndex('by_disposition', (q) => q.eq('disposition', 'current'))
      : ctx.db.query('capabilityPublications').withIndex('by_networkId_and_disposition', (q) => q.eq('networkId', networkId).eq('disposition', 'current'))
  const hydrated = new Map<string, PublicToolDescriptor>()
  const page = await filter(source, async (publication) => {
    const record = await toolRecord(ctx, publication, now)
    if (record === undefined) return false
    const tool = projectCapabilityTool(record, now, CURRENT_TOOL_PROJECTION_NAVIGATION)
    if (!matchesToolFilters(tool, args.filters ?? {})) return false
    hydrated.set(publication.toolRef, tool)
    return true
  }).paginate({ cursor: args.cursor ?? null, numItems: limit }).catch((error: unknown) => {
    // Let Convex validate its opaque cursor; classify only its cursor failures.
    if (args.cursor !== undefined && error instanceof Error
      && (error.message.includes('InvalidCursor') || error.message.includes('Failed to parse cursor'))) return undefined
    throw error
  })
  if (page === undefined) return serializeToolSearchResult({ kind: 'unavailable', schemaVersion: 'registry-tools:v3', reason: 'query_invalid', navigation })
  const items = page.page.flatMap((publication) => {
    const tool = hydrated.get(publication.toolRef)
    return tool === undefined ? [] : [tool]
  })
  if (items.length === 0 && page.isDone && args.cursor === undefined) {
    return serializeToolSearchResult({
      kind: 'no_candidates', schemaVersion: 'registry-tools:v3', query,
      appliedFilters: args.filters ?? {}, matchedCount: 0, ranking: [], navigation,
    })
  }
  return serializeToolSearchResult({
    kind: 'ok', schemaVersion: 'registry-tools:v3', query, items, ranking: [],
    pagination: { limit, hasMore: !page.isDone, ...(page.isDone ? {} : { nextCursor: page.continueCursor }) },
    navigation,
  })
}
export async function detailHandler(ctx: QueryCtx, args: ToolDetailInput) {
  return serializeToolDetailResult(await detailCapabilityTool(capabilityToolSourcePort(ctx), args))
}
export async function compareHandler(ctx: QueryCtx, args: ToolCompareInput) {
  return serializeToolCompareResult(await compareCapabilityTools(capabilityToolSourcePort(ctx), args))
}
function capabilityToolSourcePort(ctx: QueryCtx): CapabilityToolSourcePort {
  const listCurrent = async (
    networkId: string | undefined,
    limit: number,
    now: number,
  ): Promise<Readonly<{
    tools: readonly CapabilityToolSourceRecord[]
    sourceCount: number
    snapshotKey: string
  }>> => {
    const publications = networkId === undefined
      ? await ctx.db.query('capabilityPublications')
        .withIndex('by_disposition_and_readinessValidUntil', (query) => query.eq('disposition', 'current'))
        .take(limit)
      : await ctx.db.query('capabilityPublications')
        .withIndex('by_networkId_and_disposition', (query) => query.eq('networkId', networkId).eq('disposition', 'current'))
        .take(limit)
    if (publications.length >= limit) {
      return {
        tools: [],
        sourceCount: publications.length,
        snapshotKey: `capability-supply:capacity:${canonicalDigest(publications.map((publication) => ({
          publicationRef: publication.publicationRef,
          revision: publication.revision,
        })))}`,
      }
    }
    const records = await Promise.all(publications.map((publication) => toolRecord(ctx, publication, now)))
    const tools = records.flatMap((record) => record === undefined ? [] : [record])
    return {
      tools,
      sourceCount: publications.length,
      snapshotKey: `capability-supply:current:${canonicalDigest({
        publications: publications.map((publication) => ({
          publicationRef: publication.publicationRef,
          toolRef: publication.toolRef,
          revision: publication.revision,
          disposition: publication.disposition,
          networkId: publication.networkId,
          credentialState: publication.credentialState,
          healthState: publication.healthState,
          readinessTargetDigest: publication.readinessTargetDigest ?? null,
          readinessRequestDigest: publication.readinessRequestDigest ?? null,
          readinessResponseStatus: publication.readinessResponseStatus ?? null,
          readinessResponseContentType: publication.readinessResponseContentType ?? null,
          readinessResponseDigest: publication.readinessResponseDigest ?? null,
          readinessOutcome: publication.readinessOutcome ?? null,
          readinessObservedAt: publication.readinessObservedAt ?? null,
          readinessValidUntil: publication.readinessValidUntil ?? null,
          readinessLastHealthyAt: publication.readinessLastHealthyAt ?? null,
          readinessEvidenceRefs: [...publication.readinessEvidenceRefs].sort(),
        })),
        operationDigests: tools.map((tool) => canonicalDigest(tool)),
      })}`,
    }
  }
  const loadCurrent = async (toolRef: string) => {
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_toolRef_and_disposition', (query) => (
        query.eq('toolRef', toolRef).eq('disposition', 'current')
      ))
      .unique()
    if (publication === null) return null
    return await toolRecord(ctx, publication, Date.now()) ?? null
  }
  return {
    navigation: CURRENT_TOOL_PROJECTION_NAVIGATION,
    listCurrent: async (input) => await listCurrent(input.networkId, input.limit, input.now),
    loadCurrent,
  }
}
