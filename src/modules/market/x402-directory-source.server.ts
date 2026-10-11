import { CircuitOpenError, dependencyBreaker } from '@/lib/observability/circuit-breaker'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { listX402DiscoveryResources, searchX402Resources } from '@coinbase/cdp-sdk'
import Decimal from 'decimal.js'
import { normalizeToolSearchInput } from '@/modules/capability-supply/public'
import { x402PaymentProfileForEnvironment } from '@/modules/capability-supply/public'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { isRecord } from '@/modules/common/is-record'
import { directoryNetwork } from './x402-directory-index'
import { x402DirectoryInputSchema, type X402DirectoryFilters, type X402DirectoryInput, type X402DirectoryPage } from './x402-directory'

const PAGE_SIZE = 20

type Resource = Awaited<ReturnType<typeof listX402DiscoveryResources>>['items'][number]
type RawPage =
  | Readonly<{ kind: 'ok'; items: readonly Resource[]; total?: number; offset: number; limit: number; nextOffset?: number; previousOffset?: number; partialResults?: boolean; mode: 'browse' | 'search'; appliedFilters: X402DirectoryFilters }>
  | Extract<X402DirectoryPage, { kind: 'unavailable' }>

/** Native directory pages are observations. Admission never controls their visibility. */
export async function readX402DirectoryRawPage(input: X402DirectoryInput): Promise<RawPage> {
  const parsed = x402DirectoryInputSchema.safeParse(input)
  const normalized = parsed.success ? normalizeToolSearchInput({ query: parsed.data.query ?? '', limit: PAGE_SIZE }) : undefined
  if (!parsed.success || normalized === undefined) return { kind: 'unavailable', reason: 'query_invalid' }
  const networkKey = x402PaymentProfileForEnvironment(deploymentPaymentEnvironment(process.env))?.network
  if (networkKey === undefined) return { kind: 'unavailable', reason: 'source_unavailable' }
  const { network, provider, maxUsdPrice } = parsed.data
  if (network !== undefined && directoryNetwork(network) !== networkKey) return { kind: 'unavailable', reason: 'query_invalid' }
  const appliedFilters: X402DirectoryFilters = {
    network: networkKey,
    ...(provider === undefined ? {} : { provider }),
    ...(maxUsdPrice === undefined ? {} : { maxUsdPrice }),
  }
  const offset = parsed.data.offset ?? 0
  const searching = normalized.query.length > 0 || network !== undefined || provider !== undefined || maxUsdPrice !== undefined
  if (searching && offset !== 0) return { kind: 'unavailable', reason: 'query_invalid' }
  try {
    if (searching) {
      // These filters apply to the upstream catalogue, never just this page.
      // urlSubstring is a directory URL filter, not verified Provider ownership.
      const result = await dependencyBreaker.run('x402-directory', () => searchX402Resources({
        ...(normalized.query.length === 0 ? {} : { query: normalized.query }),
        network: networkKey,
        ...(provider === undefined ? {} : { urlSubstring: `://${provider}/` }),
        ...(maxUsdPrice === undefined ? {} : { maxUsdPrice: new Decimal(maxUsdPrice).toFixed() }),
        limit: PAGE_SIZE,
      }))
      return { kind: 'ok', items: result.resources.filter(item => hasNetwork(item, networkKey)), offset: 0, limit: PAGE_SIZE, partialResults: result.partialResults, mode: 'search', appliedFilters }
    }
    const result = await dependencyBreaker.run('x402-directory', () => listX402DiscoveryResources({ limit: PAGE_SIZE, offset }))
    const position = result.pagination.offset ?? offset
    const limit = result.pagination.limit ?? PAGE_SIZE
    const total = result.pagination.total
    const next = position + limit
    const hasMore = total === undefined ? result.items.length === limit : next < total
    return {
      kind: 'ok', items: result.items.filter(item => hasNetwork(item, networkKey)), offset: position, limit, mode: 'browse', appliedFilters,
      ...(total === undefined ? {} : { total }),
      ...(hasMore ? { nextOffset: next } : {}),
      ...(position > 0 ? { previousOffset: Math.max(0, position - limit) } : {}),
    }
  } catch (cause) {
    if (cause instanceof CircuitOpenError) return { kind: 'unavailable', reason: 'source_unavailable' }
    return degradeBackend(cause, { kind: 'unavailable', reason: 'source_unavailable' } as const, { site: 'readX402DirectoryRawPage', reason: 'source_unavailable' })
  }
}

function hasNetwork(item: unknown, network: string): boolean {
  return isRecord(item) && Array.isArray(item.accepts)
    && item.accepts.some(accept => isRecord(accept) && typeof accept.network === 'string' && directoryNetwork(accept.network) === network)
}
