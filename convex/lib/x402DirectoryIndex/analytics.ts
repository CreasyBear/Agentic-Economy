import Decimal from 'decimal.js'
import { directoryAdoptionBand, directoryPriceBand, minimumDirectoryUsdPrice, type DirectoryDepthBand, type DirectoryRecencyBand } from '@/modules/market/x402-directory-index'
import { directoryMetadataFlags } from '@/modules/market/x402-directory-metadata'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import type { MutationCtx } from '../../_generated/server'
import { directoryFacets } from './facets'

export const ANALYTICS_VERSION = 2
export const analyticsNamespace = (generation: string) => `${generation}:analytics:${ANALYTICS_VERSION}`
/** Category/provider/network facet memberships for eligible-only rows, mirrored alongside the generation-wide namespace. */
export const eligibleFacetsNamespace = (generation: string) => `${generation}:eligible`
export function directoryDepthBand(calls: number | undefined, payers: number | undefined): DirectoryDepthBand {
  if (calls === undefined || payers === undefined || !Number.isSafeInteger(calls) || !Number.isSafeInteger(payers) || payers <= 0 || calls < 0) return 'unknown'
  const depth = Math.round((calls / payers) * 100) / 100
  if (depth < 2) return 'broad'
  if (depth < 5) return 'repeat'
  if (depth < 10) return 'concentrated'
  return 'whale_heavy'
}
export function directoryRecencyBand(lastCalledAt: string | undefined, now: number): DirectoryRecencyBand {
  if (lastCalledAt === undefined) return 'stale'
  const at = Date.parse(lastCalledAt)
  if (!Number.isFinite(at)) return 'unknown'
  const age = now - at
  if (age < 7 * DIRECTORY_DAY_MS) return 'fresh'
  if (age < 30 * DIRECTORY_DAY_MS) return 'recent'
  return 'stale'
}
export const DIRECTORY_DAY_MS = 24 * 60 * 60 * 1000
export function searchAnalytics(entry: X402DirectoryEntry, network: string, now = Date.now()) {
  const minimumUsdPrice = minimumDirectoryUsdPrice(entry, network === '*' ? undefined : network)
  const price = minimumUsdPrice === undefined ? -1 : new Decimal(minimumUsdPrice).toNumber()
  const calls = entry.activity?.calls30d
  const payers = entry.activity?.payers30d
  const lastCalledAt = entry.activity?.lastCalledAt
  const lastActivatedAt = lastCalledAt === undefined ? undefined : Date.parse(lastCalledAt)
  const payerDepth = directoryPayerDepth(calls, payers)
  return {
    ...directoryMetadataFlags(entry), curated: entry.curated === true,
    tags: [...(entry.tags ?? [])], bundleSlugs: [...(entry.bundleSlugs ?? [])],
    payersOrder: payers !== undefined && Number.isSafeInteger(payers) && payers >= 0 ? payers : -1,
    priceOrder: price < 0 || !Number.isFinite(price) ? Number.MAX_VALUE : price,
    ...(minimumUsdPrice === undefined ? {} : { minimumUsdPrice }), minimumUsdPriceOrder: Number.isFinite(price) ? price : Number.MAX_VALUE,
    priceBand: directoryPriceBand(minimumUsdPrice), adoptionBand: directoryAdoptionBand(payers),
    ...(payerDepth === undefined ? {} : { payerDepth }),
    depthBand: directoryDepthBand(calls, payers),
    ...(lastActivatedAt === undefined || !Number.isFinite(lastActivatedAt) ? {} : { lastActivatedAt }),
    lastCalledBand: directoryRecencyBand(lastCalledAt, now),
  }
}
function directoryPayerDepth(calls: number | undefined, payers: number | undefined): number | undefined {
  if (calls === undefined || payers === undefined || !Number.isSafeInteger(calls) || !Number.isSafeInteger(payers) || payers <= 0) return undefined
  return Math.round((calls / payers) * 100) / 100
}
export function memberships(entry: X402DirectoryEntry, now: number): [string, string | number][] {
  const keys: [string, string | number][] = [['adoption', directoryAdoptionBand(entry.activity?.payers30d)], ['depth', directoryDepthBand(entry.activity?.calls30d, entry.activity?.payers30d)], ['recency', directoryRecencyBand(entry.activity?.lastCalledAt, now)]]
  for (const tag of new Set(entry.tags ?? [])) keys.push(['tag', tag])
  for (const bundle of new Set(entry.bundleSlugs ?? [])) keys.push(['bundle', bundle])
  for (const [flag, present] of Object.entries(directoryMetadataFlags(entry))) if (present) keys.push(['metadata', flag])
  if (entry.curated) keys.push(['metadata', 'curated'])
  // Aggregate '*' row only: the per-network price_band/price fan-out (one
  // extra membership pair per network the resource prices on) roughly
  // doubled-to-tripled this function's aggregate-component calls for no
  // feature currently reading it (the analytics query's per-network price
  // scope is a rare path). Drop it for now; add it back scoped to a real need.
  const price = minimumDirectoryUsdPrice(entry, undefined)
  keys.push(['price_band:*', directoryPriceBand(price)])
  if (price !== undefined) keys.push(['price:*', new Decimal(price).toNumber()])
  return keys
}
/** Removes every analytics-namespace membership for a resource being swept out of the live generation. */
export async function deleteAnalyticsMembership(ctx: MutationCtx, generation: string, resource: string, entry: X402DirectoryEntry, now = Date.now()) {
  const namespace = analyticsNamespace(generation)
  for (const key of memberships(entry, now)) await directoryFacets.deleteIfExists(ctx, { namespace, key, id: resource })
}

export async function writeAnalytics(ctx: MutationCtx, generation: string, resource: string, entry: X402DirectoryEntry, previous?: X402DirectoryEntry, now = Date.now()) {
  const namespace = analyticsNamespace(generation)
  if (previous !== undefined) for (const key of memberships(previous, now)) await directoryFacets.deleteIfExists(ctx, { namespace, key, id: resource })
  for (const key of memberships(entry, now)) {
    await directoryFacets.insert(ctx, { namespace, key, id: resource })
    if ((key[0] === 'tag' || key[0] === 'bundle') && typeof key[1] === 'string') {
      const kind = key[0], label = key[1]
      const existing = await ctx.db.query('marketDirectoryFacets').withIndex('by_generation_and_kind_and_key', q => q.eq('generation', generation).eq('kind', kind).eq('key', label)).unique()
      if (existing === null) await ctx.db.insert('marketDirectoryFacets', { generation, kind, key: label, label })
    }
  }
}
