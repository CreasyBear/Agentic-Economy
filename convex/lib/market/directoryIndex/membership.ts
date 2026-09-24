import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { directorySlugBase, directorySlugWithMethod } from '@/modules/market/x402-directory-index'
import type { IndexedSource } from './contracts'
import { directoryFacets } from './facets'
import { eligibleFacetsNamespace } from './analytics'

type FacetKind = 'category' | 'provider' | 'network'
export function facetKeys(row: Pick<Doc<'marketExternalRegistryEntries'>, 'directoryCategory' | 'provider' | 'networks'>): [FacetKind, string][] {
  return [['category', row.directoryCategory ?? 'uncategorized'], ['provider', row.provider], ...row.networks.map(network => ['network', network] as [FacetKind, string])]
}

/**
 * Category/provider/network facets are mirrored into a second, eligible-only
 * namespace alongside the generation-wide one (the same pattern already used
 * for analyticsNamespace) so the facet panel can default to eligible-only
 * counts without a provider-scoped long-tail view (Lane 1: facets never
 * expose a provider filter, unlike browse/search).
 */
export async function writeFacetMembership(ctx: MutationCtx, generation: string, resource: string, next: IndexedSource, category: string, networks: string[], eligible: boolean, previous: Doc<'marketExternalRegistryEntries'> | null, previousEligible: boolean) {
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
export async function toggleEligibleFacetMembership(ctx: MutationCtx, generation: string, resource: string, category: string, provider: string, networks: string[], eligible: boolean, previousEligible: boolean) {
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
export async function resolveDirectorySlug(
  ctx: MutationCtx, generation: string, providerKey: string, resource: string, method: string | undefined,
  // Provider rows keep synthetic resource identity but slug from the real binding endpoint URL.
  slugSource: string = resource,
): Promise<string> {
  const base = directorySlugBase(slugSource)
  const collision = await ctx.db.query('marketDirectorySearchEntries')
    .withIndex('by_generation_and_providerKey_and_slug', q => q.eq('generation', generation).eq('providerKey', providerKey).eq('slug', base))
    .filter(q => q.eq(q.field('network'), '*'))
    .first()
  return collision !== null && collision.resource !== resource ? directorySlugWithMethod(slugSource, method) : base
}
