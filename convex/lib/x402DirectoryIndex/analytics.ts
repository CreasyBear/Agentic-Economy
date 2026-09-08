import Decimal from 'decimal.js'
import { directoryAdoptionBand, directoryNetwork, directoryPriceBand, minimumDirectoryUsdPrice } from '@/modules/market/x402-directory-index'
import { directoryMetadataFlags } from '@/modules/market/x402-directory-metadata'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import type { MutationCtx } from '../../_generated/server'
import { directoryFacets } from './facets'

export const ANALYTICS_VERSION = 1
export const analyticsNamespace = (generation: string) => `${generation}:analytics:${ANALYTICS_VERSION}`
export function searchAnalytics(entry: X402DirectoryEntry, network: string) {
  const minimumUsdPrice = minimumDirectoryUsdPrice(entry, network === '*' ? undefined : network)
  const price = minimumUsdPrice === undefined ? -1 : new Decimal(minimumUsdPrice).toNumber()
  const payers = entry.activity?.payers30d
  return {
    ...directoryMetadataFlags(entry), curated: entry.curated === true,
    tags: [...(entry.tags ?? [])], bundleSlugs: [...(entry.bundleSlugs ?? [])],
    payersOrder: payers !== undefined && Number.isSafeInteger(payers) && payers >= 0 ? payers : -1,
    priceOrder: price < 0 || !Number.isFinite(price) ? Number.MAX_VALUE : price,
    ...(minimumUsdPrice === undefined ? {} : { minimumUsdPrice }), minimumUsdPriceOrder: Number.isFinite(price) ? price : Number.MAX_VALUE,
    priceBand: directoryPriceBand(minimumUsdPrice), adoptionBand: directoryAdoptionBand(payers),
  }
}
function memberships(entry: X402DirectoryEntry): [string, string | number][] {
  const keys: [string, string | number][] = [['adoption', directoryAdoptionBand(entry.activity?.payers30d)]]
  for (const [flag, present] of Object.entries(directoryMetadataFlags(entry))) if (present) keys.push(['metadata', flag])
  for (const tag of new Set(entry.tags ?? [])) keys.push(['tag', tag])
  for (const bundle of new Set(entry.bundleSlugs ?? [])) keys.push(['bundle', bundle])
  if (entry.curated) keys.push(['metadata', 'curated'])
  for (const network of ['*', ...new Set(entry.prices.map(price => directoryNetwork(price.network)))]) {
    const price = minimumDirectoryUsdPrice(entry, network === '*' ? undefined : network)
    keys.push([`price_band:${network}`, directoryPriceBand(price)])
    if (price !== undefined) keys.push([`price:${network}`, new Decimal(price).toNumber()])
  }
  return keys
}
export async function writeAnalytics(ctx: MutationCtx, generation: string, resource: string, entry: X402DirectoryEntry, previous?: X402DirectoryEntry) {
  const namespace = analyticsNamespace(generation)
  if (previous !== undefined) for (const key of memberships(previous)) await directoryFacets.deleteIfExists(ctx, { namespace, key, id: resource })
  for (const key of memberships(entry)) {
    await directoryFacets.insert(ctx, { namespace, key, id: resource })
    if ((key[0] === 'tag' || key[0] === 'bundle') && typeof key[1] === 'string') {
      const kind = key[0], label = key[1]
      const existing = await ctx.db.query('marketDirectoryFacets').withIndex('by_generation_and_kind_and_key', q => q.eq('generation', generation).eq('kind', kind).eq('key', label)).unique()
      if (existing === null) await ctx.db.insert('marketDirectoryFacets', { generation, kind, key: label, label })
    }
  }
}
