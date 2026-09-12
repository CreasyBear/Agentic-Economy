import Decimal from 'decimal.js'
import { z } from 'zod'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { x402DirectoryFilterSchema, type X402DirectoryEntry, type X402DirectoryFilters } from './x402-directory'

export const DIRECTORY_PRICE_BANDS = ['lt_0_01', '0_01_to_0_03', '0_03_to_0_10', '0_10_to_1', '1_to_10', '10_plus', 'unknown'] as const
export const DIRECTORY_ADOPTION_BANDS = ['missing', '0', '1', '2_4', '5_9', '10_49', '50_plus'] as const
export const DIRECTORY_RECENCY_BANDS = ['unknown', 'fresh', 'recent', 'stale'] as const
export const DIRECTORY_DEPTH_BANDS = ['unknown', 'broad', 'repeat', 'concentrated', 'whale_heavy'] as const
export const DIRECTORY_MOMENTUM_BANDS = ['new', 'rising', 'flat', 'falling', 'unknown'] as const
export type DirectoryPriceBand = typeof DIRECTORY_PRICE_BANDS[number]
export type DirectoryAdoptionBand = typeof DIRECTORY_ADOPTION_BANDS[number]
export type DirectoryDepthBand = typeof DIRECTORY_DEPTH_BANDS[number]
export type DirectoryRecencyBand = typeof DIRECTORY_RECENCY_BANDS[number]
export type DirectoryMomentumBand = typeof DIRECTORY_MOMENTUM_BANDS[number]

export const x402DirectoryIndexInputSchema = x402DirectoryFilterSchema.extend({
  query: z.string().trim().max(200).optional(),
  category: z.string().trim().min(1).max(80).transform(value => value.toLowerCase()).optional(),
  sort: z.enum(['relevance', 'popular', 'updated', 'adoption', 'price_asc', 'momentum']).optional(),
  minUsdPrice: z.number().finite().nonnegative().optional(),
  priceBand: z.enum(DIRECTORY_PRICE_BANDS).optional(),
  adoptionBand: z.enum(DIRECTORY_ADOPTION_BANDS).optional(),
  maxPayers30d: z.number().int().nonnegative().safe().optional(),
  minPayers30d: z.number().int().nonnegative().safe().optional(),
  curatedOnly: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(48)).min(1).max(5).optional(),
  bundleSlugs: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(64)).min(1).max(5).optional(),
  hasInputFields: z.boolean().optional(),
  hasOutputFields: z.boolean().optional(),
  hasInputSchema: z.boolean().optional(),
  hasOutputSchema: z.boolean().optional(),
  hasOutputExample: z.boolean().optional(),
})
export type X402DirectoryIndexInput = z.infer<typeof x402DirectoryIndexInputSchema>
export type X402DirectoryIndexCoverage = Readonly<{
  source: 'coinbase'
  generation: string
  indexedTotal: number
  reportedTotal: number
  reportedTotalAtStart: number
  sourceChangedDuringScan: boolean
  duplicateObservations: number
  pagesFetched: number
  startedAt: number
  completedAt: number
  completeness: 'completed_observed_scan'
}>
export type X402IndexedDirectoryEntry = Readonly<{
  entry: X402DirectoryEntry
  category: string
  categorySource: 'provider_declared' | 'unclassified'
  observedAt: number
  sourceDigest: string
  /** Joined live from capabilityPublications - see convex/x402DirectoryIndex.ts:admittedToolRef. */
  toolRef?: string
  analytics?: Readonly<{
    payerDepth?: number
    depthBand: DirectoryDepthBand
    lastActivatedAt?: number
    lastCalledBand: DirectoryRecencyBand
    callDelta?: number
    payerDelta?: number
    momentumBand: DirectoryMomentumBand
  }>
}>

const NETWORK_ALIASES: Readonly<Record<string, string>> = {
  base: 'eip155:8453', 'base-sepolia': 'eip155:84532',
  ethereum: 'eip155:1', mainnet: 'eip155:1', sepolia: 'eip155:11155111',
  arbitrum: 'eip155:42161', optimism: 'eip155:10', polygon: 'eip155:137', avalanche: 'eip155:43114',
  solana: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'solana-devnet': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
}
export function directoryNetwork(network: string): string {
  return NETWORK_ALIASES[network.toLowerCase()] ?? network
}

/** A USD cap applies only to a known USDC denomination, on the same payment option. */
export function minimumDirectoryUsdPrice(entry: X402DirectoryEntry, network?: string): string | undefined {
  let minimum: Decimal | undefined
  for (const price of entry.prices) {
    if (network !== undefined && directoryNetwork(price.network) !== directoryNetwork(network)) continue
    if (price.scheme !== 'exact' || price.symbol !== 'USDC' || price.decimalAmount === undefined) continue
    try {
      const amount = new Decimal(price.decimalAmount)
      if (!amount.isFinite() || amount.isNegative()) continue
      if (minimum === undefined || amount.lt(minimum)) minimum = amount
    } catch (cause) { degradeBackend(cause, undefined, { site: 'minimumDirectoryUsdPrice', reason: 'invalid_response' }) /* Unknown price facts never satisfy a price ceiling. */ }
  }
  return minimum?.toFixed()
}

export function directoryEntryMatchesFilters(entry: X402DirectoryEntry, filters: X402DirectoryFilters): boolean {
  if (filters.provider !== undefined && entry.provider.toLowerCase() !== filters.provider.toLowerCase()) return false
  const network = filters.network
  if (network !== undefined && !entry.prices.some(price => directoryNetwork(price.network) === directoryNetwork(network))) return false
  if (filters.maxUsdPrice !== undefined) {
    const price = minimumDirectoryUsdPrice(entry, filters.network)
    if (price === undefined || new Decimal(price).gt(filters.maxUsdPrice)) return false
  }
  return true
}

export function directoryPriceBand(price: string | undefined): DirectoryPriceBand {
  if (price === undefined) return 'unknown'
  const amount = new Decimal(price)
  if (amount.lt('0.01')) return 'lt_0_01'
  if (amount.lt('0.03')) return '0_01_to_0_03'
  if (amount.lt('0.1')) return '0_03_to_0_10'
  if (amount.lt('1')) return '0_10_to_1'
  if (amount.lt('10')) return '1_to_10'
  return '10_plus'
}
export function directoryAdoptionBand(payers: number | undefined): DirectoryAdoptionBand {
  if (payers === undefined || !Number.isSafeInteger(payers) || payers < 0) return 'missing'
  if (payers === 0) return '0'
  if (payers === 1) return '1'
  if (payers < 5) return '2_4'
  if (payers < 10) return '5_9'
  if (payers < 50) return '10_49'
  return '50_plus'
}
export function directoryIndexRangesValid(input: X402DirectoryIndexInput): boolean {
  return !(input.minUsdPrice !== undefined && input.maxUsdPrice !== undefined && input.minUsdPrice > input.maxUsdPrice)
    && !(input.minPayers30d !== undefined && input.maxPayers30d !== undefined && input.minPayers30d > input.maxPayers30d)
}

export { isDirectoryEntryEligible } from '@/modules/capability-contract/public'
export type { DirectoryEligibilitySignals } from '@/modules/capability-contract/public'

/** Normalised host: lowercase, no port, no trailing dot. */
export function directoryProviderKey(provider: string): string {
  return provider.trim().toLowerCase().replace(/:\d+$/u, '').replace(/\.+$/u, '')
}

/**
 * Kebab slug for the canonical `/tools/<providerKey>/<slug>` URL
 * (docs pattern: RapidAPI `/provider/api`, npm `/package/name`). Derived from
 * the resource's URL path only - the query string and hash never contribute,
 * so two resources differing only in query parameters collide and fall back
 * to the method-qualified form below.
 */
export function directorySlugBase(resource: string): string {
  let path: string
  try {
    path = new URL(resource).pathname
  } catch (cause) {
    path = degradeBackend(cause, resource, { site: 'directorySlugBase', reason: 'invalid_response' })
  }
  const decoded = path.split('/').map(segment => {
    try {
      return decodeURIComponent(segment)
    } catch (cause) {
      return degradeBackend(cause, segment, { site: 'directorySlugBase', reason: 'invalid_response' })
    }
  }).join(' ')
  const slug = decoded.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')
  return slug.length > 0 ? slug.slice(0, 120) : 'tool'
}

/** Method-qualified slug, used only to disambiguate two resources on the same host whose path slugs collide. */
export function directorySlugWithMethod(resource: string, method: string | undefined): string {
  const base = directorySlugBase(resource)
  return method === undefined || method.length === 0 ? base : `${base}-${method.toLowerCase()}`
}
