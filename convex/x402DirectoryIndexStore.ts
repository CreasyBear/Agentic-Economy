import { start } from '@convex-dev/workflow'
import { v } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { directoryNetwork, directoryProviderKey, directorySlugBase, directorySlugWithMethod, isDirectoryEntryEligible } from '@/modules/market/x402-directory-index'
import { sourceRouteRef } from '@/modules/capability-supply/public'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server'
import { parseWorkloadCronSnapshot, reconcileWorkloadCronSnapshot, workloadCronSnapshotValue } from './workloadCron'
import { indexedSourceValue, progressValue, type IndexedSource, type IndexProgress } from './lib/x402DirectoryIndex/contracts'
import { directoryFacets } from './lib/x402DirectoryIndex/facets'
import { ANALYTICS_VERSION, analyticsNamespace, eligibleFacetsNamespace, searchAnalytics, writeAnalytics } from './lib/x402DirectoryIndex/analytics'
import { activeDirectoryGeneration, directoryGeneration, directoryState, storedDirectoryEntry } from './lib/x402DirectoryIndex/rows'

export const DIRECTORY_INDEX_PAGE_SIZE = 100
const MAX_ENTRY_BYTES = 768 * 1024
const MAX_SOURCE_BYTES = 384 * 1024
const encoder = new TextEncoder()

function documentId(resource: string): string {
  return `registry:${canonicalDigest({ source: 'coinbase', resource }).slice(7)}`
}

async function authorize(ctx: MutationCtx, workload: Parameters<typeof parseWorkloadCronSnapshot>[0]) {
  await reconcileWorkloadCronSnapshot(ctx, 'refresh Agentic Economy API registry', parseWorkloadCronSnapshot(workload))
}

export const begin = internalMutation({
  args: { generation: v.string(), startedAt: v.number(), workload: workloadCronSnapshotValue },
  returns: v.object({ kind: v.union(v.literal('started'), v.literal('refreshing')), generation: v.string() }),
  handler: async (ctx, args): Promise<{ kind: 'started' | 'refreshing'; generation: string }> => {
    await authorize(ctx, args.workload)
    if (!/^coinbase-[a-zA-Z0-9-]{1,100}$/u.test(args.generation) || !Number.isSafeInteger(args.startedAt)) throw new Error('directory_generation_invalid')
    const state = await directoryState(ctx)
    if (state?.refreshGeneration !== undefined) {
      const previous = await directoryGeneration(ctx, state.refreshGeneration)
      if (previous?.status === 'refreshing') return { kind: 'refreshing', generation: previous.generation }
    }
    if (await directoryGeneration(ctx, args.generation) !== null) throw new Error('directory_generation_exists')
    await ctx.db.insert('marketExternalRegistryGenerations', {
      generation: args.generation, source: 'coinbase', status: 'refreshing', startedAt: args.startedAt,
      ingestedCount: 0, nextOffset: 0, pagesFetched: 0, observations: 0, duplicateObservations: 0, terminalObserved: false, analyticsVersion: ANALYTICS_VERSION,
    })
    const next = {
      key: 'coinbase' as const, ...(state?.activeGeneration === undefined ? {} : { activeGeneration: state.activeGeneration }),
      refreshGeneration: args.generation, lastAttemptAt: args.startedAt, lastAttemptStatus: 'refreshing' as const,
    }
    if (state === null) await ctx.db.insert('marketExternalRegistryState', next)
    else await ctx.db.replace(state._id, next)
    await start(ctx, internal.x402DirectoryIndexRefresh.scan, { generation: args.generation, workload: args.workload }, {
      startAsync: true, onComplete: internal.x402DirectoryIndexRefresh.onComplete,
      context: { generation: args.generation, workload: args.workload },
    })
    return { kind: 'started', generation: args.generation }
  },
})

export const checkpoint = internalQuery({
  args: { generation: v.string() },
  returns: v.union(v.null(), v.object({ status: v.union(v.literal('refreshing'), v.literal('complete'), v.literal('failed')), nextOffset: v.number(), indexedTotal: v.number() })),
  handler: async (ctx, args) => {
    const row = await directoryGeneration(ctx, args.generation)
    return row === null ? null : { status: row.status, nextOffset: row.nextOffset ?? 0, indexedTotal: row.ingestedCount }
  },
})

/** The active generation's already-recorded coverage, for the change-signal guard in x402DirectoryIndexRefresh.start. */
export const activeCoverage = internalQuery({
  args: {},
  returns: v.union(v.null(), v.object({ generation: v.string(), sourceReportedLatest: v.optional(v.number()) })),
  handler: async ctx => {
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return null
    return { generation: generation.generation, ...(generation.sourceReportedLatest === undefined ? {} : { sourceReportedLatest: generation.sourceReportedLatest }) }
  },
})

/**
 * Advances the audit trail when the change-signal guard finds nothing new
 * upstream: marketExternalRegistryState.lastAttemptAt moves to now so an
 * operator can see the check happened, without minting a new generation row.
 * No new schema field is needed - the compared totals (equal by definition
 * of "unchanged") are already on the active generation's sourceReportedLatest,
 * and the exact comparison is logged by the caller.
 */
export const recordUnchangedCheck = internalMutation({
  args: { workload: workloadCronSnapshotValue },
  returns: v.null(),
  handler: async (ctx, args) => {
    await authorize(ctx, args.workload)
    const state = await directoryState(ctx)
    if (state === null) return null
    await ctx.db.replace(state._id, {
      key: 'coinbase',
      ...(state.activeGeneration === undefined ? {} : { activeGeneration: state.activeGeneration }),
      ...(state.refreshGeneration === undefined ? {} : { refreshGeneration: state.refreshGeneration }),
      lastAttemptAt: Date.now(), lastAttemptStatus: state.lastAttemptStatus,
      ...(state.lastError === undefined ? {} : { lastError: state.lastError }),
    })
    return null
  },
})

type FacetKind = 'category' | 'provider' | 'network'
function facetKeys(row: Pick<Doc<'marketExternalRegistryEntries'>, 'directoryCategory' | 'provider' | 'networks'>): [FacetKind, string][] {
  return [['category', row.directoryCategory ?? 'uncategorized'], ['provider', row.provider], ...row.networks.map(network => ['network', network] as [FacetKind, string])]
}

/**
 * Category/provider/network facets are mirrored into a second, eligible-only
 * namespace alongside the generation-wide one (the same pattern already used
 * for analyticsNamespace) so the facet panel can default to eligible-only
 * counts without a provider-scoped long-tail view (Lane 1: facets never
 * expose a provider filter, unlike browse/search).
 */
async function writeFacetMembership(ctx: MutationCtx, generation: string, resource: string, next: IndexedSource, category: string, networks: string[], eligible: boolean, previous: Doc<'marketExternalRegistryEntries'> | null, previousEligible: boolean) {
  if (previous !== null) {
    for (const key of facetKeys(previous)) {
      await directoryFacets.delete(ctx, { namespace: generation, key, id: resource })
      if (previousEligible) await directoryFacets.deleteIfExists(ctx, { namespace: eligibleFacetsNamespace(generation), key, id: resource })
    }
  }
  for (const key of facetKeys({ directoryCategory: category, provider: next.entry.provider, networks })) {
    await directoryFacets.insert(ctx, { namespace: generation, key, id: resource })
    if (eligible) await directoryFacets.insert(ctx, { namespace: eligibleFacetsNamespace(generation), key, id: resource })
    const exists = await ctx.db.query('marketDirectoryFacets')
      .withIndex('by_generation_and_kind_and_key', q => q.eq('generation', generation).eq('kind', key[0]).eq('key', key[1])).unique()
    if (exists === null) await ctx.db.insert('marketDirectoryFacets', {
      generation, kind: key[0], key: key[1], label: key[1],
      ...(key[0] === 'provider' && next.entry.iconUrl !== undefined ? { iconUrl: next.entry.iconUrl } : {}),
    })
  }
}

/**
 * Kebab slug for the canonical `/tools/<providerKey>/<slug>` URL, unique
 * within (generation, providerKey). The base slug is the resource path only;
 * a collision with a *different* resource already holding that slug (e.g.
 * two methods on the same path) is resolved by qualifying the new entry's
 * slug with its method, leaving the earlier resource's slug untouched - both
 * remain unique. Checked and assigned once per resource (not per network
 * variant), same as providerKey/eligible above.
 */
async function resolveDirectorySlug(
  ctx: MutationCtx, generation: string, providerKey: string, resource: string, method: string | undefined,
): Promise<string> {
  const base = directorySlugBase(resource)
  const collision = await ctx.db.query('marketDirectorySearchEntries')
    .withIndex('by_generation_and_providerKey_and_slug', q => q.eq('generation', generation).eq('providerKey', providerKey).eq('slug', base))
    .filter(q => q.eq(q.field('network'), '*'))
    .first()
  return collision !== null && collision.resource !== resource ? directorySlugWithMethod(resource, method) : base
}

async function writeSource(ctx: MutationCtx, generation: string, item: IndexedSource, observedAt: number): Promise<boolean> {
  if (item.resource !== item.entry.resource || item.resource.length === 0 || item.resource.length > 8192
    || !/^sha256:[0-9a-f]{64}$/u.test(item.sourceDigest)
    || encoder.encode(item.sourceJson).byteLength > MAX_SOURCE_BYTES
    || encoder.encode(JSON.stringify(item)).byteLength > MAX_ENTRY_BYTES) throw new Error('directory_source_entry_invalid')
  const entry = item.entry
  const id = documentId(item.resource)
  const previous = await ctx.db.query('marketExternalRegistryEntries')
    .withIndex('by_generation_and_documentId', q => q.eq('generation', generation).eq('documentId', id)).unique()
  if (previous !== null && previous.source !== 'coinbase') throw new Error('directory_source_identity_conflict')
  const networks = [...new Set(entry.prices.map(price => directoryNetwork(price.network)))].sort()
  if (networks.length > 128) throw new Error('directory_network_metadata_invalid')
  const category = entry.category?.trim().toLowerCase() || 'uncategorized'
  const sourceUpdatedAt = entry.provenance?.updatedAt === undefined ? undefined : Date.parse(entry.provenance.updatedAt)
  const updatedOrder = sourceUpdatedAt !== undefined && Number.isFinite(sourceUpdatedAt) ? sourceUpdatedAt : -1
  const calls = entry.activity?.calls30d
  const popularOrder = calls !== undefined && Number.isSafeInteger(calls) && calls >= 0 ? calls : -1
  const searchText = [entry.title, entry.serviceName, entry.description, entry.provider, category, ...(entry.tags ?? [])].filter(Boolean).join(' ').slice(0, 8000)
  // Eligibility and provider identity are resource-level (not per-network), so
  // compute once and copy onto every network-variant search row below.
  const universalAnalytics = searchAnalytics(entry, '*')
  const eligible = isDirectoryEntryEligible(universalAnalytics)
  const providerKey = directoryProviderKey(entry.provider)
  const slug = await resolveDirectorySlug(ctx, generation, providerKey, item.resource, entry.method)
  // Computed from the same raw resource JSON that flows into
  // admitFacilitatorDiscoveryItems at resolve time (item.sourceJson ==
  // stableStringify(source.resource) there), so the digest this produces is
  // bit-for-bit identical to capabilityPublications.sourceRouteRef once the
  // resource is admitted - the join in x402DirectoryIndex.ts relies on that.
  const routeRef = sourceRouteRef({
    sourceKind: 'x402', sourceSelector: {}, sourceDescriptorJson: item.sourceJson, endpointUrl: item.resource,
  })
  const row = {
    generation, documentId: id, source: 'coinbase' as const,
    upstreamServiceId: entry.serviceName ?? entry.provider, upstreamEndpointId: item.resource,
    sourceUrl: 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources', endpointUrl: item.resource,
    name: entry.title, summary: entry.description, provider: entry.provider, category,
    ...(entry.method === undefined ? {} : { method: entry.method }), tags: entry.tags ?? [], networks,
    access: 'x402' as const, authority: 'source_metadata_only' as const,
    sourceDigest: item.sourceDigest, searchText, updatedAt: observedAt,
    directoryEntryJson: JSON.stringify({ ...entry, metadataJson: '' }), directorySourceJson: item.sourceJson,
    directoryCategory: category, ...(updatedOrder === -1 ? {} : { directorySourceUpdatedAt: updatedOrder }),
    ...(popularOrder === -1 ? {} : { directoryCalls30d: popularOrder }),
  }
  let entryId: Id<'marketExternalRegistryEntries'>
  if (previous === null) entryId = await ctx.db.insert('marketExternalRegistryEntries', row)
  else { await ctx.db.replace(previous._id, row); entryId = previous._id }
  const oldSearch = await ctx.db.query('marketDirectorySearchEntries')
    .withIndex('by_generation_and_resource', q => q.eq('generation', generation).eq('resource', item.resource)).take(130)
  const previousEligible = oldSearch[0]?.eligible === true
  for (const old of oldSearch) await ctx.db.delete(old._id)
  for (const network of ['*', ...networks]) {
    await ctx.db.insert('marketDirectorySearchEntries', {
      generation, resource: item.resource, entryId, network, category, provider: entry.provider.toLowerCase(), providerKey, eligible, searchText,
      slug, ...(routeRef === undefined ? {} : { sourceRouteRef: routeRef }),
      popularOrder, updatedOrder, ...searchAnalytics(entry, network),

    })
  }
  await writeFacetMembership(ctx, generation, item.resource, item, category, networks, eligible, previous, previousEligible)
  await writeAnalytics(ctx, generation, item.resource, entry, previous === null ? undefined : storedDirectoryEntry(previous))
  return previous === null
}

/** Each successful page advances its checkpoint atomically with all metadata/index writes. */
export const applyPage = internalMutation({
  args: {
    generation: v.string(), offset: v.number(), reportedTotal: v.number(), items: v.array(indexedSourceValue),
    startItem: v.optional(v.number()), totalItems: v.optional(v.number()),
    observedAt: v.number(), workload: workloadCronSnapshotValue,
  },
  returns: progressValue,
  handler: async (ctx, args): Promise<IndexProgress> => {
    await authorize(ctx, args.workload)
    const generation = await directoryGeneration(ctx, args.generation)
    const state = await directoryState(ctx)
    if (generation === null || generation.status !== 'refreshing' || state?.refreshGeneration !== args.generation) return { kind: 'stale', generation: args.generation, nextOffset: generation?.nextOffset ?? 0, indexedTotal: generation?.ingestedCount ?? 0 }
    const offset = generation.nextOffset ?? 0
    if (args.offset < offset) return { kind: 'advanced', generation: args.generation, nextOffset: offset, indexedTotal: generation.ingestedCount }
    if (args.offset !== offset || !Number.isSafeInteger(args.offset) || args.offset < 0 || !Number.isSafeInteger(args.reportedTotal) || args.reportedTotal < 0
      || args.items.length > DIRECTORY_INDEX_PAGE_SIZE || !Number.isSafeInteger(args.observedAt)) throw new Error('directory_source_page_invalid')
    const startItem = args.startItem ?? 0
    const totalItems = args.totalItems ?? args.items.length
    const pageItemCursor = generation.pageItemCursor ?? 0
    if (startItem < pageItemCursor) return { kind: 'advanced', generation: args.generation, nextOffset: offset, indexedTotal: generation.ingestedCount }
    if (startItem !== pageItemCursor || !Number.isSafeInteger(totalItems) || totalItems < 0 || totalItems > DIRECTORY_INDEX_PAGE_SIZE || startItem + args.items.length > totalItems) throw new Error('directory_source_batch_invalid')
    const pageDone = startItem + args.items.length === totalItems
    if (totalItems === 0 && args.offset < args.reportedTotal) throw new Error('directory_source_ended_early')
    let inserted = 0
    for (const item of args.items) if (await writeSource(ctx, args.generation, item, args.observedAt)) inserted += 1
    const complete = totalItems === 0
    // The source paginates fixed offset windows, including a short final page.
    // Advancing by its window avoids re-reading a rounded-down final offset.
    const nextOffset = complete || !pageDone ? args.offset : args.offset + DIRECTORY_INDEX_PAGE_SIZE
    const ingestedCount = generation.ingestedCount + inserted
    const next = {
      nextOffset, pageItemCursor: pageDone ? 0 : startItem + args.items.length, ingestedCount, sourceReportedInitial: generation.sourceReportedInitial ?? args.reportedTotal,
      sourceReportedLatest: args.reportedTotal,
      sourceReportedMinimum: Math.min(generation.sourceReportedMinimum ?? args.reportedTotal, args.reportedTotal),
      sourceReportedMaximum: Math.max(generation.sourceReportedMaximum ?? args.reportedTotal, args.reportedTotal),
      pagesFetched: (generation.pagesFetched ?? 0) + (pageDone ? 1 : 0),
      observations: (generation.observations ?? 0) + args.items.length,
      duplicateObservations: (generation.duplicateObservations ?? 0) + args.items.length - inserted,
      terminalObserved: complete,
      ...(complete ? { status: 'complete' as const, completedAt: args.observedAt, analyticsVersion: ANALYTICS_VERSION, analyticsStatus: 'ready' as const } : {}),
    }
    await ctx.db.patch(generation._id, next)
    if (complete) {
      await ctx.db.replace(state._id, { key: 'coinbase', activeGeneration: args.generation, lastAttemptAt: args.observedAt, lastAttemptStatus: 'complete' })
      if (state.activeGeneration !== undefined && state.activeGeneration !== args.generation) await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexStore.cleanup, { generation: state.activeGeneration })
    }
    return { kind: complete ? 'complete' : 'advanced', generation: args.generation, nextOffset, indexedTotal: ingestedCount }
  },
})

export const fail = internalMutation({
  args: { generation: v.string(), reason: v.string(), workload: workloadCronSnapshotValue },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Failure records preserve visibility even if the workload was revoked.
    // They never write source rows, replace active coverage, or admit supply.
    const generation = await directoryGeneration(ctx, args.generation)
    if (generation === null || generation.status !== 'refreshing') return null
    const state = await directoryState(ctx)
    await ctx.db.patch(generation._id, { status: 'failed', failedAt: Date.now(), failureReason: args.reason.slice(0, 500) })
    if (state?.refreshGeneration === args.generation) await ctx.db.replace(state._id, {
      key: 'coinbase', ...(state.activeGeneration === undefined ? {} : { activeGeneration: state.activeGeneration }),
      lastAttemptAt: Date.now(), lastAttemptStatus: 'failed', lastError: args.reason.slice(0, 500),
    })
    await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexStore.cleanup, { generation: args.generation })
    return null
  },
})

export const cleanup = internalMutation({
  args: { generation: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const state = await directoryState(ctx)
    if (state?.activeGeneration === args.generation || state?.refreshGeneration === args.generation) return null
    const generation = await directoryGeneration(ctx, args.generation)
    if (generation === null) return null
    const searchRows = await ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_resource', q => q.eq('generation', args.generation)).take(100)
    if (searchRows.length > 0) {
      for (const row of searchRows) await ctx.db.delete(row._id)
      await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexStore.cleanup, args)
      return null
    }
    // Batch 200 (was 5): the same read/write budget services 40x more rows per
    // reschedule tick, which is what turned cleanup into thousands of extra
    // internalMutation calls per generation (see cost comment in scheduled-workloads.ts).
    // Bounded by work, not row count: each row's facetKeys() fans out to
    // category + provider + up to 128 network aggregate deletes, so 200 rows
    // can mean up to 26,000 aggregate deletes in one mutation. Stop once the
    // accumulated key count would cross the budget (always processing at
    // least one row, so a single wide row can't stall the reschedule loop).
    const CLEANUP_FACET_KEY_BUDGET = 2000
    const rows = await ctx.db.query('marketExternalRegistryEntries').withIndex('by_generation_and_documentId', q => q.eq('generation', args.generation)).take(200)
    if (rows.length > 0) {
      let keyBudget = 0
      for (const [processed, row] of rows.entries()) {
        const keys = facetKeys(row)
        if (processed > 0 && keyBudget + keys.length > CLEANUP_FACET_KEY_BUDGET) break
        if (row.source !== 'coinbase') throw new Error('directory_cleanup_source_conflict')
        const endpointUrl = row.endpointUrl
        if (endpointUrl === undefined) throw new Error('directory_cleanup_endpoint_missing')
        for (const key of keys) await directoryFacets.delete(ctx, { namespace: args.generation, key, id: endpointUrl })
        await ctx.db.delete(row._id)
        keyBudget += keys.length
      }
      await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexStore.cleanup, args)
      return null
    }
    const facets = await ctx.db.query('marketDirectoryFacets').withIndex('by_generation_and_kind_and_key', q => q.eq('generation', args.generation)).take(100)
    for (const row of facets) await ctx.db.delete(row._id)
    if (facets.length === 100) { await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexStore.cleanup, args); return null }
    await directoryFacets.clear(ctx, { namespace: args.generation })
    await directoryFacets.clear(ctx, { namespace: analyticsNamespace(args.generation) })
    await directoryFacets.clear(ctx, { namespace: eligibleFacetsNamespace(args.generation) })
    await ctx.db.delete(generation._id)
    return null
  },
})
