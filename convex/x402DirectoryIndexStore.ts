import { start } from '@convex-dev/workflow'
import { v } from 'convex/values'
import Decimal from 'decimal.js'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { directoryNetwork, directoryProviderKey, directorySlugBase, directorySlugWithMethod, isDirectoryEntryEligible } from '@/modules/market/x402-directory-index'
import { canonicalProviderWebsite, isProgrammableProviderBusinessContext } from '@/modules/business/public'
import { listingTier, sourceRouteRef } from '@/modules/capability-supply/public'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server'
import { parseWorkloadCronSnapshot, reconcileWorkloadCronSnapshot, workloadCronSnapshotValue } from './workloadCron'
import { indexedSourceValue, progressValue, type IndexedSource, type IndexProgress, type DirectoryEntry } from './lib/x402DirectoryIndex/contracts'
import { directoryFacets } from './lib/x402DirectoryIndex/facets'
import { ANALYTICS_VERSION, deleteAnalyticsMembership, eligibleFacetsNamespace, searchAnalytics, writeAnalytics } from './lib/x402DirectoryIndex/analytics'
import { directoryGeneration, directoryState, storedDirectoryEntry, activeDirectoryGeneration } from './lib/x402DirectoryIndex/rows'
import { listingIdentityDigest } from './lib/x402DirectoryIndex/listingDigest'

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

/**
 * Well 8 Lane B: one live generation, updated in place. `begin` no longer
 * mints a fresh generation when an active one already exists - it reuses
 * `state.activeGeneration`, resets that generation row's per-run cursor and
 * reports, and records the run's start time on `marketExternalRegistryState.
 * runStartedAt` (threaded through to every touched row's `lastSeenRunAt`,
 * and to the removal sweep's staleness threshold). Only the very first ever
 * run (no `activeGeneration` yet) mints a new generation id.
 */
export const begin = internalMutation({
  args: { startedAt: v.number(), workload: workloadCronSnapshotValue },
  returns: v.object({ kind: v.union(v.literal('started'), v.literal('refreshing')), generation: v.string() }),
  handler: async (ctx, args): Promise<{ kind: 'started' | 'refreshing'; generation: string }> => {
    await authorize(ctx, args.workload)
    if (!Number.isSafeInteger(args.startedAt)) throw new Error('directory_generation_invalid')
    const state = await directoryState(ctx)
    if (state?.refreshGeneration !== undefined) {
      const previous = await directoryGeneration(ctx, state.refreshGeneration)
      if (previous?.status === 'refreshing') return { kind: 'refreshing', generation: previous.generation }
    }
    const generation = state?.activeGeneration ?? `coinbase-${args.startedAt}-${crypto.randomUUID()}`
    if (!/^coinbase-[a-zA-Z0-9-]{1,100}$/u.test(generation)) throw new Error('directory_generation_invalid')
    const existingRow = await directoryGeneration(ctx, generation)
    if (existingRow === null) {
      await ctx.db.insert('marketExternalRegistryGenerations', {
        generation, source: 'coinbase', status: 'refreshing', startedAt: args.startedAt,
        ingestedCount: 0, nextOffset: 0, pageItemCursor: 0, pagesFetched: 0, observations: 0, duplicateObservations: 0, terminalObserved: false, analyticsVersion: ANALYTICS_VERSION,
      })
    } else {
      // Reuse in place: reset this run's cursor/report fields; `ingestedCount`
      // (the live row total) and `terminalObserved` (sticky "has ever
      // completed" flag read by activeDirectoryGeneration) are NOT reset, so
      // reads stay served from the last-good state for the run's whole
      // duration - there is no spare "previous complete generation" anymore.
      await ctx.db.patch(existingRow._id, {
        status: 'refreshing', startedAt: args.startedAt, nextOffset: 0, pageItemCursor: 0,
        pagesFetched: 0, observations: 0, duplicateObservations: 0,
        sourceReportedInitial: undefined, sourceReportedLatest: undefined, sourceReportedMinimum: undefined, sourceReportedMaximum: undefined,
        completedAt: undefined, failedAt: undefined, failureReason: undefined,
      })
    }
    const next = {
      key: 'coinbase' as const, activeGeneration: generation, refreshGeneration: generation,
      runStartedAt: args.startedAt, lastAttemptAt: args.startedAt, lastAttemptStatus: 'refreshing' as const,
    }
    if (state === null) await ctx.db.insert('marketExternalRegistryState', next)
    else await ctx.db.replace(state._id, next)
    await start(ctx, internal.x402DirectoryIndexRefresh.scan, { generation, workload: args.workload, runStartedAt: args.startedAt }, {
      startAsync: true, onComplete: internal.x402DirectoryIndexRefresh.onComplete,
      context: { generation, workload: args.workload, runStartedAt: args.startedAt },
    })
    return { kind: 'started', generation }
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

/** Adds or removes the eligible-only mirror membership only, for a resource whose base category/provider/network facets are unchanged. */
async function toggleEligibleFacetMembership(ctx: MutationCtx, generation: string, resource: string, category: string, provider: string, networks: string[], eligible: boolean, previousEligible: boolean) {
  if (eligible === previousEligible) return
  const namespace = eligibleFacetsNamespace(generation)
  for (const key of facetKeys({ directoryCategory: category, provider, networks })) {
    if (eligible) await directoryFacets.insert(ctx, { namespace, key, id: resource })
    else await directoryFacets.deleteIfExists(ctx, { namespace, key, id: resource })
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
  // Well 8 Lane C: provider rows slug off the offering's label text, not a
  // URL path (resource there is a synthetic sourceRouteRef key) - defaults to
  // `resource` unchanged for every existing Coinbase caller.
  slugSource: string = resource,
): Promise<string> {
  const base = directorySlugBase(slugSource)
  const collision = await ctx.db.query('marketDirectorySearchEntries')
    .withIndex('by_generation_and_providerKey_and_slug', q => q.eq('generation', generation).eq('providerKey', providerKey).eq('slug', base))
    .filter(q => q.eq(q.field('network'), '*'))
    .first()
  return collision !== null && collision.resource !== resource ? directorySlugWithMethod(slugSource, method) : base
}

type WriteOutcome = 'inserted' | 'unchanged' | 'activity_patched' | 'rewritten'

/**
 * Well 8 Lane B, three-tier diff against the retained observation:
 * 1. No previous row -> insert (full path, as always).
 * 2. `sourceDigest` (whole raw entry) unchanged -> nothing at all changed;
 *    only `lastSeenRunAt` is stamped so the removal sweep does not treat this
 *    resource as gone.
 * 3. `sourceDigest` changed but `listingDigest` (identity-only) did not ->
 *    activity-only change (the common week-to-week case for an active
 *    resource): patch the retained snapshot and each search row's
 *    activity-derived fields, and flip the eligible-only facet mirror if
 *    adoption crossed the threshold. No slug/category/provider/network facet
 *    churn - those depend only on identity fields, which are unchanged.
 * 4. `listingDigest` changed (or there's no previous row) -> full rewrite:
 *    same insert-shaped path as case 1, applied on top of the existing row.
 */
async function writeSource(ctx: MutationCtx, generation: string, item: IndexedSource, observedAt: number, runStartedAt: number): Promise<WriteOutcome> {
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
  const digest = listingIdentityDigest(entry, category)

  // Tier 2: nothing changed at all upstream.
  if (previous !== null && previous.sourceDigest === item.sourceDigest) {
    await ctx.db.patch(previous._id, { lastSeenRunAt: runStartedAt })
    return 'unchanged'
  }

  // Tier 3: activity-only change - the listing itself is identical.
  if (previous !== null && previous.listingDigest === digest) {
    const sourceUpdatedAt = entry.provenance?.updatedAt === undefined ? undefined : Date.parse(entry.provenance.updatedAt)
    const updatedOrder = sourceUpdatedAt !== undefined && Number.isFinite(sourceUpdatedAt) ? sourceUpdatedAt : -1
    const calls = entry.activity?.calls30d
    const popularOrder = calls !== undefined && Number.isSafeInteger(calls) && calls >= 0 ? calls : -1
    await ctx.db.patch(previous._id, {
      sourceDigest: item.sourceDigest, updatedAt: observedAt,
      directoryEntryJson: JSON.stringify({ ...entry, metadataJson: '' }), directorySourceJson: item.sourceJson,
      directorySourceUpdatedAt: updatedOrder === -1 ? undefined : updatedOrder,
      directoryCalls30d: popularOrder === -1 ? undefined : popularOrder,
      listingDigest: digest, lastSeenRunAt: runStartedAt,
    })
    const searchRows = await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_resource', q => q.eq('generation', generation).eq('resource', item.resource)).take(130)
    const universalAnalytics = searchAnalytics(entry, '*', observedAt)
    const eligible = isDirectoryEntryEligible(universalAnalytics)
    const previousEligible = searchRows.find(row => row.network === '*')?.eligible === true
    for (const row of searchRows) {
      const next = searchAnalytics(entry, row.network, observedAt)
      const changed = row.popularOrder !== popularOrder || row.updatedOrder !== updatedOrder || row.eligible !== eligible
        || row.payersOrder !== next.payersOrder || row.adoptionBand !== next.adoptionBand || row.depthBand !== next.depthBand
        || row.lastCalledBand !== next.lastCalledBand || row.payerDepth !== next.payerDepth || row.lastActivatedAt !== next.lastActivatedAt
      if (changed) {
        await ctx.db.patch(row._id, {
          popularOrder, updatedOrder, eligible,
          payersOrder: next.payersOrder, adoptionBand: next.adoptionBand, depthBand: next.depthBand, lastCalledBand: next.lastCalledBand,
          payerDepth: next.payerDepth, lastActivatedAt: next.lastActivatedAt,
        })
      }
    }
    await toggleEligibleFacetMembership(ctx, generation, item.resource, category, entry.provider, networks, eligible, previousEligible)
    return 'activity_patched'
  }

  // Tier 1/4: insert, or a listing-identity rewrite.
  const sourceUpdatedAt = entry.provenance?.updatedAt === undefined ? undefined : Date.parse(entry.provenance.updatedAt)
  const updatedOrder = sourceUpdatedAt !== undefined && Number.isFinite(sourceUpdatedAt) ? sourceUpdatedAt : -1
  const calls = entry.activity?.calls30d
  const popularOrder = calls !== undefined && Number.isSafeInteger(calls) && calls >= 0 ? calls : -1
  const searchText = [entry.title, entry.serviceName, entry.description, entry.provider, category, ...(entry.tags ?? [])].filter(Boolean).join(' ').slice(0, 8000)
  // Eligibility and provider identity are resource-level (not per-network), so
  // compute once and copy onto every network-variant search row below.
  const universalAnalytics = searchAnalytics(entry, '*', observedAt)
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
  // Well 8 Lane C tie-break: a reviewed-tier publication's provider row wins
  // this sourceRouteRef (upsertProviderDirectoryRows absorbs any Coinbase row
  // sharing it at write time). While that claim stands, Coinbase's own scan
  // must not recreate a competing row here - it stamps nothing and reports
  // 'unchanged' rather than reinserting. The provider's withdrawal removes
  // the provider row without resurrecting this one; the *next* time this
  // resource is observed with no live claim, `previous` is null (the earlier
  // absorption deleted it) and this falls through to the ordinary insert
  // path below - "restored on the next refresh tier".
  if (routeRef !== undefined) {
    const providerClaim = await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_sourceRouteRef', q => q.eq('generation', generation).eq('sourceRouteRef', routeRef))
      .filter(q => q.eq(q.field('source'), 'provider'))
      .first()
    if (providerClaim !== null) return 'unchanged'
  }
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
    listingDigest: digest, lastSeenRunAt: runStartedAt,
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
      popularOrder, updatedOrder, ...searchAnalytics(entry, network, observedAt),

    })
  }
  await writeFacetMembership(ctx, generation, item.resource, item, category, networks, eligible, previous, previousEligible)
  await writeAnalytics(ctx, generation, item.resource, entry, previous === null ? undefined : storedDirectoryEntry(previous))
  return previous === null ? 'inserted' : 'rewritten'
}

// --- Well 8 Lane C: provider (reviewed-tier) directory rows -----------------

const PROVIDER_RESOURCE_PREFIX = 'provider-route:'

function providerResourceKey(sourceRouteRef: string): string {
  return `${PROVIDER_RESOURCE_PREFIX}${sourceRouteRef}`
}

/** Separate identity namespace from Coinbase's resource-keyed documentId - a provider row never shares a marketExternalRegistryEntries row with a Coinbase one. */
function providerDocumentId(sourceRouteRef: string): string {
  return `registry:${canonicalDigest({ source: 'provider', sourceRouteRef }).slice(7)}`
}

/** Business host if this is a self-declared programmable provider with a valid website, else the business's own public slug. */
export function providerKeyForBusiness(business: Doc<'businesses'>): string {
  if (isProgrammableProviderBusinessContext(business.businessContext)) {
    const canonical = canonicalProviderWebsite(business.businessContext.website)
    if (canonical !== undefined) return directoryProviderKey(new URL(canonical).hostname)
  }
  return business.slug
}

function providerOfferingPrices(offering: Doc<'capabilityOfferings'>, networkId: string): DirectoryEntry['prices'] {
  const price = offering.presentation.price
  if (price === undefined || price.kind === 'on_request') return []
  const amount = price.kind === 'fixed' ? price.amount : price.minimum
  const decimalAmount = new Decimal(amount.units).div(new Decimal(10).pow(amount.exponent)).toFixed()
  return [{ network: networkId, scheme: 'exact', amount: amount.units, asset: amount.currency, symbol: amount.currency, decimalAmount }]
}

/**
 * The Coinbase-shaped projection of one reviewed-tier publication. Feeding
 * this through the same helpers a Coinbase entry uses (searchAnalytics,
 * listingIdentityDigest, writeFacetMembership, writeAnalytics,
 * indexedDirectoryEntry/storedDirectoryEntry) is what lets browse/search/
 * facets/bySlug/canonical carry no provider-specific branch.
 */
function providerDirectoryEntry(
  resource: string, providerKey: string, business: Doc<'businesses'>, offering: Doc<'capabilityOfferings'>,
  publication: Pick<Doc<'capabilityPublications'>, 'sourceKind' | 'networkId'>,
): DirectoryEntry {
  return {
    resource, title: offering.presentation.label, description: offering.presentation.summary,
    protocol: publication.sourceKind,
    // Matches the Coinbase convention (directoryProviderKey(entry.provider))
    // where `provider` is itself the normalised host - not a display name -
    // so the provider-filtered browse/facets index key (row.provider) stays
    // consistent across both sources.
    provider: providerKey,
    category: business.category.trim().toLowerCase() || 'uncategorized',
    prices: providerOfferingPrices(offering, publication.networkId),
    metadataJson: '',
  }
}

/**
 * Tie-break (Well 8 Lane C): a Coinbase-authored row sharing this
 * sourceRouteRef is fully absorbed - its search rows, registry entry and
 * facet/analytics memberships are torn down - so the provider row becomes the
 * sole visible entry at that identity. Nothing resurrects it here; Coinbase's
 * own writeSource() naturally reinserts it once it next observes the
 * resource with no live provider claim (see the suppression check there).
 */
async function absorbCoinbaseRowAtRoute(ctx: MutationCtx, generation: string, routeRef: string): Promise<void> {
  const claimed = await ctx.db.query('marketDirectorySearchEntries')
    .withIndex('by_generation_and_sourceRouteRef', q => q.eq('generation', generation).eq('sourceRouteRef', routeRef))
    .filter(q => q.neq(q.field('source'), 'provider'))
    .first()
  if (claimed === null) return
  const entryDoc = await ctx.db.get(claimed.entryId)
  if (entryDoc === null || entryDoc.source !== 'coinbase') return
  const resource = entryDoc.endpointUrl ?? claimed.resource
  const searchRows = await ctx.db.query('marketDirectorySearchEntries')
    .withIndex('by_generation_and_resource', q => q.eq('generation', generation).eq('resource', resource)).take(130)
  const wasEligible = searchRows.some(row => row.eligible === true)
  for (const key of facetKeys(entryDoc)) {
    await directoryFacets.delete(ctx, { namespace: generation, key, id: resource })
    if (wasEligible) await directoryFacets.deleteIfExists(ctx, { namespace: eligibleFacetsNamespace(generation), key, id: resource })
  }
  await deleteAnalyticsMembership(ctx, generation, resource, storedDirectoryEntry(entryDoc))
  for (const row of searchRows) await ctx.db.delete(row._id)
  await ctx.db.delete(entryDoc._id)
}

/** Deletes a provider row's registry entry, search rows and facet/analytics memberships. Never resurrects a Coinbase row - see absorbCoinbaseRowAtRoute. */
async function removeProviderDirectoryRow(ctx: MutationCtx, generation: string, routeRef: string): Promise<void> {
  const id = providerDocumentId(routeRef)
  const entryDoc = await ctx.db.query('marketExternalRegistryEntries')
    .withIndex('by_generation_and_documentId', q => q.eq('generation', generation).eq('documentId', id)).unique()
  if (entryDoc === null || entryDoc.source !== 'provider') return
  const resource = providerResourceKey(routeRef)
  const searchRows = await ctx.db.query('marketDirectorySearchEntries')
    .withIndex('by_generation_and_resource', q => q.eq('generation', generation).eq('resource', resource)).take(130)
  const wasEligible = searchRows.some(row => row.eligible === true)
  for (const key of facetKeys(entryDoc)) {
    await directoryFacets.delete(ctx, { namespace: generation, key, id: resource })
    if (wasEligible) await directoryFacets.deleteIfExists(ctx, { namespace: eligibleFacetsNamespace(generation), key, id: resource })
  }
  await deleteAnalyticsMembership(ctx, generation, resource, storedDirectoryEntry(entryDoc))
  for (const row of searchRows) await ctx.db.delete(row._id)
  await ctx.db.delete(entryDoc._id)
}

/**
 * Well 8 Lane C write path. Upserts (or, once the publication is no longer a
 * current reviewed-tier one, removes) the '*' + single-network directory rows
 * for one publication. Called directly, in the same transaction, from the
 * publish/withdraw command handlers (no ctx.runMutation hop - see the
 * guidelines' "pull shared code into a helper" rule) and from
 * reconcileProviderDirectoryRows below for the hourly sweep.
 *
 * Sweep note: provider rows are stamped with lastSeenRunAt =
 * Number.MAX_SAFE_INTEGER so x402DirectoryIndexStore.cleanup's
 * `lt(lastSeenRunAt, runStartedAt)` range scan never revisits them - cheaper
 * than restamping on every Coinbase run (a compound generation+source+
 * lastSeenRunAt index would be the only way to instead *exclude* them from
 * that scan, at the cost of a new index on a large table for one field).
 */
export type ProviderDirectoryPublicationInput = Readonly<Pick<Doc<'capabilityPublications'>,
  'disposition' | 'authorityMode' | 'sourceRouteRef' | 'businessId' | 'offeringId' | 'networkId' | 'sourceKind'
>>

export async function upsertProviderDirectoryRows(
  ctx: MutationCtx,
  publication: ProviderDirectoryPublicationInput,
): Promise<void> {
  const generation = await activeDirectoryGeneration(ctx)
  if (generation === null) return
  const routeRef = publication.sourceRouteRef
  if (routeRef === undefined) return
  if (publication.disposition !== 'current' || listingTier(publication.authorityMode) !== 'reviewed') {
    await removeProviderDirectoryRow(ctx, generation.generation, routeRef)
    return
  }
  const [business, offering] = await Promise.all([
    ctx.db.get(publication.businessId),
    ctx.db.query('capabilityOfferings').withIndex('by_offeringId', q => q.eq('offeringId', publication.offeringId)).unique(),
  ])
  if (business === null || offering === null) return
  const now = Date.now()
  const providerKey = providerKeyForBusiness(business)
  const resource = providerResourceKey(routeRef)
  const entry = providerDirectoryEntry(resource, providerKey, business, offering, publication)
  const category = entry.category ?? 'uncategorized'
  const slug = await resolveDirectorySlug(ctx, generation.generation, providerKey, resource, undefined, entry.title)
  await absorbCoinbaseRowAtRoute(ctx, generation.generation, routeRef)
  const documentId = providerDocumentId(routeRef)
  const existing = await ctx.db.query('marketExternalRegistryEntries')
    .withIndex('by_generation_and_documentId', q => q.eq('generation', generation.generation).eq('documentId', documentId)).unique()
  if (existing !== null && existing.source !== 'provider') throw new Error('directory_source_identity_conflict')
  const searchText = [entry.title, entry.description, business.name, category].filter(Boolean).join(' ').slice(0, 8000)
  const sourceDigest = canonicalDigest({
    source: 'provider', publicationRef: publication.offeringId, prices: entry.prices,
    label: entry.title, summary: entry.description,
  })
  const row = {
    generation: generation.generation, documentId, source: 'provider' as const,
    upstreamServiceId: publication.offeringId, upstreamEndpointId: resource,
    sourceUrl: resource, endpointUrl: resource,
    name: entry.title, summary: entry.description, provider: providerKey, category,
    tags: [], networks: [publication.networkId],
    access: 'provider_account' as const, authority: 'source_metadata_only' as const,
    sourceDigest, searchText, updatedAt: now,
    directoryEntryJson: JSON.stringify({ ...entry, metadataJson: '' }),
    directorySourceJson: JSON.stringify({ title: entry.title, description: entry.description, serviceName: business.name }),
    directoryCategory: category,
    listingDigest: listingIdentityDigest(entry, category),
    lastSeenRunAt: Number.MAX_SAFE_INTEGER,
  }
  let entryId: Id<'marketExternalRegistryEntries'>
  if (existing === null) entryId = await ctx.db.insert('marketExternalRegistryEntries', row)
  else { await ctx.db.replace(existing._id, row); entryId = existing._id }
  const oldSearch = await ctx.db.query('marketDirectorySearchEntries')
    .withIndex('by_generation_and_resource', q => q.eq('generation', generation.generation).eq('resource', resource)).take(130)
  const previousEligible = oldSearch[0]?.eligible === true
  for (const old of oldSearch) await ctx.db.delete(old._id)
  for (const network of ['*', publication.networkId]) {
    await ctx.db.insert('marketDirectorySearchEntries', {
      generation: generation.generation, resource, entryId, network, category,
      provider: providerKey, providerKey, eligible: true, source: 'provider' as const,
      sourceRouteRef: routeRef, slug, searchText,
      popularOrder: -1, updatedOrder: -1, ...searchAnalytics(entry, network, now),
    })
  }
  const asIndexedSource: IndexedSource = { resource, entry, sourceJson: row.directorySourceJson, sourceDigest }
  await writeFacetMembership(ctx, generation.generation, resource, asIndexedSource, category, [publication.networkId], true, existing, previousEligible)
  await writeAnalytics(ctx, generation.generation, resource, entry, existing === null ? undefined : storedDirectoryEntry(existing))
}

const PROVIDER_DIRECTORY_RECONCILE_PAGE_SIZE = 50

/**
 * Hourly sweep half of Well 8 Lane C: pages through every CURRENT publication
 * and upserts provider rows for the reviewed-tier ones (upsertProviderDirectoryRows
 * is a no-op past the disposition/tier check for the rest). The publish/withdraw
 * hooks keep rows in step immediately; this is the reconciling safety net for
 * any path that changes disposition without going through those hooks.
 */
export const reconcileProviderDirectoryRows = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query('capabilityPublications')
      .withIndex('by_disposition', q => q.eq('disposition', 'current'))
      .paginate({ cursor: args.cursor ?? null, numItems: PROVIDER_DIRECTORY_RECONCILE_PAGE_SIZE })
    for (const publication of page.page) {
      if (listingTier(publication.authorityMode) !== 'reviewed') continue
      await upsertProviderDirectoryRows(ctx, publication)
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexStore.reconcileProviderDirectoryRows, { cursor: page.continueCursor })
    }
    return null
  },
})

/** Each successful page advances its checkpoint atomically with all metadata/index writes. */
export const applyPage = internalMutation({
  args: {
    generation: v.string(), offset: v.number(), reportedTotal: v.number(), items: v.array(indexedSourceValue),
    startItem: v.optional(v.number()), totalItems: v.optional(v.number()),
    observedAt: v.number(), runStartedAt: v.number(), workload: workloadCronSnapshotValue,
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
    const counts: Record<WriteOutcome, number> = { inserted: 0, unchanged: 0, activity_patched: 0, rewritten: 0 }
    for (const item of args.items) counts[await writeSource(ctx, args.generation, item, args.observedAt, args.runStartedAt)] += 1
    const inserted = counts.inserted
    console.info(JSON.stringify({ kind: 'x402_directory_page_applied', generation: args.generation, offset: args.offset, ...counts }))
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
      // Sticky true (never reset false): activeDirectoryGeneration gates read
      // availability on this alone, so a mid-run patch never makes the live
      // generation look "not ready yet" (rows.ts:activeDirectoryGeneration).
      terminalObserved: complete || generation.terminalObserved === true,
      ...(complete ? { status: 'complete' as const, completedAt: args.observedAt, analyticsVersion: ANALYTICS_VERSION, analyticsStatus: 'ready' as const } : {}),
    }
    await ctx.db.patch(generation._id, next)
    if (complete && state !== null) {
      await ctx.db.replace(state._id, {
        key: 'coinbase', activeGeneration: args.generation,
        ...(state.runStartedAt === undefined ? {} : { runStartedAt: state.runStartedAt }),
        lastAttemptAt: args.observedAt, lastAttemptStatus: 'complete',
      })
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
    // The live generation is left exactly as far as this run got - a partial
    // scan must never trigger the removal sweep (that only runs from
    // onComplete after a full successful scan), so nothing is deleted here.
    const generation = await directoryGeneration(ctx, args.generation)
    if (generation === null || generation.status !== 'refreshing') return null
    const state = await directoryState(ctx)
    await ctx.db.patch(generation._id, { status: 'failed', failedAt: Date.now(), failureReason: args.reason.slice(0, 500) })
    if (state?.refreshGeneration === args.generation) await ctx.db.replace(state._id, {
      key: 'coinbase', ...(state.activeGeneration === undefined ? {} : { activeGeneration: state.activeGeneration }),
      ...(state.runStartedAt === undefined ? {} : { runStartedAt: state.runStartedAt }),
      lastAttemptAt: Date.now(), lastAttemptStatus: 'failed', lastError: args.reason.slice(0, 500),
    })
    return null
  },
})

/**
 * Removal sweep (Well 8 Lane B): replaces the old "delete the abandoned
 * generation" cleanup. The live generation is never torn down wholesale
 * anymore - this deletes only the resources a full, successful scan did NOT
 * see this run (`lastSeenRunAt < runStartedAt`), decrementing their facet
 * memberships the same budgeted way the old cleanup did. Scheduled only from
 * x402DirectoryIndexRefresh.onComplete after a scan reports `kind: 'complete'`
 * - never after a partial/failed scan (see `fail` above).
 */
export const cleanup = internalMutation({
  args: { generation: v.string(), runStartedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await directoryState(ctx)
    if (state?.activeGeneration !== args.generation) return null
    const generation = await directoryGeneration(ctx, args.generation)
    if (generation === null) return null
    // Batch 200, same facet-key budget pattern as the old cleanup: each row's
    // facetKeys() fans out to category + provider + up to 128 network
    // aggregate deletes, so the budget (not the row count) bounds one
    // invocation's work.
    const CLEANUP_FACET_KEY_BUDGET = 2000
    const stale = await ctx.db.query('marketExternalRegistryEntries')
      .withIndex('by_generation_and_lastSeenRunAt', q => q.eq('generation', args.generation).lt('lastSeenRunAt', args.runStartedAt))
      .take(200)
    if (stale.length === 0) {
      console.info(JSON.stringify({ kind: 'x402_directory_sweep_complete', generation: args.generation }))
      return null
    }
    let keyBudget = 0
    let deleted = 0
    for (const [processed, row] of stale.entries()) {
      const keys = facetKeys(row)
      if (processed > 0 && keyBudget + keys.length > CLEANUP_FACET_KEY_BUDGET) break
      if (row.source !== 'coinbase') throw new Error('directory_cleanup_source_conflict')
      const endpointUrl = row.endpointUrl
      if (endpointUrl === undefined) throw new Error('directory_cleanup_endpoint_missing')
      const searchRows = await ctx.db.query('marketDirectorySearchEntries')
        .withIndex('by_generation_and_resource', q => q.eq('generation', args.generation).eq('resource', endpointUrl)).take(130)
      const wasEligible = searchRows.some(searchRow => searchRow.eligible === true)
      for (const key of keys) {
        await directoryFacets.delete(ctx, { namespace: args.generation, key, id: endpointUrl })
        if (wasEligible) await directoryFacets.deleteIfExists(ctx, { namespace: eligibleFacetsNamespace(args.generation), key, id: endpointUrl })
      }
      await deleteAnalyticsMembership(ctx, args.generation, endpointUrl, storedDirectoryEntry(row))
      for (const searchRow of searchRows) await ctx.db.delete(searchRow._id)
      await ctx.db.delete(row._id)
      deleted += 1
      keyBudget += keys.length
    }
    if (deleted > 0) await ctx.db.patch(generation._id, { ingestedCount: Math.max(0, generation.ingestedCount - deleted) })
    console.info(JSON.stringify({ kind: 'x402_directory_sweep_progress', generation: args.generation, deleted }))
    await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexStore.cleanup, args)
    return null
  },
})
