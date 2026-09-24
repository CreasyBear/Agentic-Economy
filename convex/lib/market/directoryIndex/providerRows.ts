import { v, type Infer } from 'convex/values'
import { listingTier } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { internal } from '../../../_generated/api'
import type { Doc, Id } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { deleteAnalyticsMembership, eligibleFacetsNamespace, searchAnalytics, writeAnalytics } from './analytics'
import { type IndexedSource } from './contracts'
import { directoryFacets } from './facets'
import { listingIdentityDigest } from './listingDigest'
import { facetKeys, resolveDirectorySlug, writeFacetMembership } from './membership'
import { providerDirectoryEntry, providerDocumentId, providerKeyForBusiness, providerResourceKey } from './providerProjection'
import { refreshProviderLead } from './providerLead'
import { activeDirectoryGeneration, storedDirectoryEntry } from './rows'

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
  await refreshProviderLead(ctx, generation, entryDoc.provider)
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
  await refreshProviderLead(ctx, generation, entryDoc.provider)
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
export type ProviderDirectoryPublicationInput = Readonly<Pick<Doc<'capabilityPublications'>, 'disposition' | 'authorityMode' | 'sourceRouteRef' | 'businessId' | 'offeringId' | 'networkId' | 'sourceKind'> & { bindingId?: string }>

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
  const bindingId = publication.bindingId
  if (bindingId === undefined) return
  const [business, offering, binding] = await Promise.all([
    ctx.db.get(publication.businessId),
    ctx.db.query('capabilityOfferings').withIndex('by_offeringId', q => q.eq('offeringId', publication.offeringId)).unique(),
    ctx.db.query('capabilityTransportBindings').withIndex('by_bindingId', q => q.eq('bindingId', bindingId)).unique(),
  ])
  if (business === null || offering === null || binding === null) return
  const now = Date.now()
  const providerKey = providerKeyForBusiness(business)
  const resource = providerResourceKey(routeRef)
  const entry = providerDirectoryEntry(resource, providerKey, business, offering, publication)
  const category = entry.category ?? 'uncategorized'
  const slug = await resolveDirectorySlug(ctx, generation.generation, providerKey, resource, undefined, binding.endpointUrl)
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
  await refreshProviderLead(ctx, generation.generation, providerKey)
}
const PROVIDER_DIRECTORY_RECONCILE_PAGE_SIZE = 50

/**
 * Hourly sweep half of Well 8 Lane C: pages through every CURRENT publication
 * and upserts provider rows for the reviewed-tier ones (upsertProviderDirectoryRows
 * is a no-op past the disposition/tier check for the rest). The publish/withdraw
 * hooks keep rows in step immediately; this is the reconciling safety net for
 * any path that changes disposition without going through those hooks.
 */
export const reconcileProviderDirectoryRowsArgs = v.object({ cursor: v.optional(v.union(v.string(), v.null())) })
export const reconcileProviderDirectoryRowsReturns = v.null()
export const reconcileProviderDirectoryRowsHandler = async (ctx: MutationCtx, args: Infer<typeof reconcileProviderDirectoryRowsArgs>) => {
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
  }
