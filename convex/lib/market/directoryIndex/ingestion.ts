import { canonicalDigest } from '@/modules/common/canonical-digest'
import { directoryNetwork, directoryProviderKey, isDirectoryEntryEligible } from '@/modules/market/x402-directory-index'
import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { searchAnalytics, writeAnalytics } from './analytics'
import type { IndexedSource, ListingAdmission } from './contracts'
import { listingIdentityDigest } from './listingDigest'
import { resolveDirectorySlug, toggleEligibleFacetMembership, writeFacetMembership } from './membership'
import { refreshProviderLead } from './providerLead'
import { classifyDirectoryEntry, compactDirectoryText, storedDirectoryEntry } from './rows'

export const DIRECTORY_INDEX_PAGE_SIZE = 100
const MAX_ENTRY_BYTES = 768 * 1024
const MAX_SOURCE_BYTES = 384 * 1024
const encoder = new TextEncoder()

/** The `registry:<hex>` listing ref of a Coinbase-indexed resource. */
export function directoryListingId(resource: string): string {
  return `registry:${canonicalDigest({ source: 'coinbase', resource }).slice(7)}`
}
function sameAdmission(stored: ListingAdmission | undefined, next: ListingAdmission): boolean {
  return stored?.kind === next.kind && (stored.kind === 'quotable' || stored.reason === (next as { reason: string }).reason)
}
export type WriteOutcome = 'inserted' | 'unchanged' | 'activity_patched' | 'rewritten'

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
export async function writeSource(ctx: MutationCtx, generation: string, item: IndexedSource, observedAt: number, runStartedAt: number): Promise<WriteOutcome> {
  if (item.resource !== item.entry.resource || item.resource.length === 0 || item.resource.length > 8192
    || !/^sha256:[0-9a-f]{64}$/u.test(item.sourceDigest)
    || encoder.encode(item.sourceJson).byteLength > MAX_SOURCE_BYTES
    || encoder.encode(JSON.stringify(item)).byteLength > MAX_ENTRY_BYTES) throw new Error('directory_source_entry_invalid')
  const entry = item.entry
  const id = directoryListingId(item.resource)
  const previous = await ctx.db.query('marketExternalRegistryEntries')
    .withIndex('by_generation_and_documentId', q => q.eq('generation', generation).eq('documentId', id)).unique()
  if (previous !== null && previous.source !== 'coinbase') throw new Error('directory_source_identity_conflict')
  const networks = [...new Set(entry.prices.map(price => directoryNetwork(price.network)))].sort()
  if (networks.length > 128) throw new Error('directory_network_metadata_invalid')
  const category = entry.category?.trim().toLowerCase() || 'uncategorized'
  const digest = listingIdentityDigest(entry, category)
  const classes = classifyDirectoryEntry(entry)
  const compact = { documentId: id, title: compactDirectoryText(entry.title, 72), summary: compactDirectoryText(entry.description, 100) }

  // Tier 2: nothing changed at all upstream.
  if (previous !== null && previous.sourceDigest === item.sourceDigest) {
    const classChanged = previous.actionClass !== classes.actionClass || previous.objectClass !== classes.objectClass
    await ctx.db.patch(previous._id, { lastSeenRunAt: runStartedAt, ...(classChanged ? classes : {}) })
    const searchRows = await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_resource', q => q.eq('generation', generation).eq('resource', item.resource)).take(130)
    for (const row of searchRows) {
      if (row.actionClass !== classes.actionClass || row.objectClass !== classes.objectClass || row.documentId !== id || row.title !== compact.title || row.summary !== compact.summary
        || !sameAdmission(row.admission, item.admission)) {
        await ctx.db.patch(row._id, { ...classes, ...compact, admission: item.admission })
      }
    }
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
      ...classes,
    })
    const searchRows = await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_resource', q => q.eq('generation', generation).eq('resource', item.resource)).take(130)
    await writeAnalytics(ctx, generation, item.resource, entry, storedDirectoryEntry(previous), observedAt)
    const universalAnalytics = searchAnalytics(entry, '*', observedAt)
    const eligible = isDirectoryEntryEligible({
      hasOutputSchema: universalAnalytics.hasOutputSchema,
      hasOutputExample: universalAnalytics.hasOutputExample,
      minimumUsdPrice: universalAnalytics.minimumUsdPrice,
      payersOrder: universalAnalytics.payersOrder,
    })
    const previousEligible = searchRows.find(row => row.network === '*')?.eligible === true
    for (const row of searchRows) {
      const next = searchAnalytics(entry, row.network, observedAt)
      const changed = row.popularOrder !== popularOrder || row.updatedOrder !== updatedOrder || row.eligible !== eligible
        || row.minimumUsdPrice !== next.minimumUsdPrice || row.minimumUsdPriceOrder !== next.minimumUsdPriceOrder
        || row.priceOrder !== next.priceOrder || row.priceBand !== next.priceBand
        || row.payersOrder !== next.payersOrder || row.adoptionBand !== next.adoptionBand || row.depthBand !== next.depthBand
        || row.lastCalledBand !== next.lastCalledBand || row.payerDepth !== next.payerDepth || row.lastActivatedAt !== next.lastActivatedAt
        || row.actionClass !== classes.actionClass || row.objectClass !== classes.objectClass
        || row.documentId !== id || row.title !== compact.title || row.summary !== compact.summary
        || !sameAdmission(row.admission, item.admission)
      if (changed) {
        await ctx.db.patch(row._id, {
          popularOrder, updatedOrder, eligible, admission: item.admission,
          minimumUsdPrice: next.minimumUsdPrice, minimumUsdPriceOrder: next.minimumUsdPriceOrder,
          priceOrder: next.priceOrder, priceBand: next.priceBand,
          payersOrder: next.payersOrder, adoptionBand: next.adoptionBand, depthBand: next.depthBand, lastCalledBand: next.lastCalledBand,
          payerDepth: next.payerDepth, lastActivatedAt: next.lastActivatedAt,
          ...classes,
          ...compact,
        })
      }
    }
    await toggleEligibleFacetMembership(ctx, generation, item.resource, category, entry.provider, networks, eligible, previousEligible)
    await refreshProviderLead(ctx, generation, entry.provider)
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
  const eligible = isDirectoryEntryEligible({
    hasOutputSchema: universalAnalytics.hasOutputSchema,
    hasOutputExample: universalAnalytics.hasOutputExample,
    minimumUsdPrice: universalAnalytics.minimumUsdPrice,
    payersOrder: universalAnalytics.payersOrder,
  })
  const providerKey = directoryProviderKey(entry.provider)
  const slug = await resolveDirectorySlug(ctx, generation, providerKey, item.resource, entry.method)
  // Derived at prepare time by admittedSourceRoute from the admitted draft, the
  // same derivation publication uses, so it equals capabilityPublications.sourceRouteRef.
  const routeRef = item.sourceRouteRef
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
    ...classes,
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
      slug, ...(routeRef === undefined ? {} : { sourceRouteRef: routeRef }), admission: item.admission,
      ...classes,
      ...compact,
      popularOrder, updatedOrder, ...searchAnalytics(entry, network, observedAt),

    })
  }
  await writeFacetMembership(ctx, generation, item.resource, item, category, networks, eligible, previous, previousEligible)
  await writeAnalytics(ctx, generation, item.resource, entry, previous === null ? undefined : storedDirectoryEntry(previous), observedAt)
  await refreshProviderLead(ctx, generation, entry.provider)
  return previous === null ? 'inserted' : 'rewritten'
}
