import { readX402Directory } from './x402-directory.server'
import { X402_MARKETPLACE_COLLECTIONS, type X402MarketplaceHome, type X402MarketplaceRail } from './x402-marketplace-home'

/** Independent catalogue-wide searches; source transport owns timeout handling. */
export async function readX402MarketplaceHome(): Promise<X402MarketplaceHome> {
  const results = await Promise.allSettled(X402_MARKETPLACE_COLLECTIONS.map(collection => readX402Directory({ query: collection.query })))
  const rails: X402MarketplaceRail[] = X402_MARKETPLACE_COLLECTIONS.map((collection, index) => {
    const result = results[index]
    const page = result?.status === 'fulfilled' ? result.value : undefined
    const providerCounts = new Map<string, number>()
    const resources = new Set<string>()
    const items = page?.kind !== 'ok' ? [] : page.items.filter(entry => {
      if (resources.has(entry.resource)) return false
      resources.add(entry.resource)
      const count = providerCounts.get(entry.provider) ?? 0
      if (count >= 2) return false
      providerCounts.set(entry.provider, count + 1)
      return true
    })
    return {
      ...collection,
      search: { query: collection.query },
      kind: page?.kind === 'ok' ? 'ok' : 'unavailable',
      items,
      returnedCount: page?.kind === 'ok' ? page.items.length : 0,
      partialResults: page?.kind === 'ok' && page.partialResults === true,
    }
  })
  return { observedAt: new Date().toISOString(), rails }
}
