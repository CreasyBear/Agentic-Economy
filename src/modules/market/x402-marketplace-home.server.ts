import { readX402DirectoryCatalogue } from './x402-directory-index.server'
import { X402_MARKETPLACE_RAILS, type X402MarketplaceHome, type X402MarketplaceRail } from './x402-marketplace-home'

/** Each evidence shelf reads the persisted directory generation independently. */
export async function readX402MarketplaceHome(): Promise<X402MarketplaceHome> {
  const results = await Promise.allSettled(X402_MARKETPLACE_RAILS.map(rail => readX402DirectoryCatalogue({ sort: rail.sort })))
  const rails: X402MarketplaceRail[] = X402_MARKETPLACE_RAILS.flatMap((rail, index) => {
    const result = results[index]
    const page = result?.status === 'fulfilled' ? result.value : undefined
    if (page?.kind !== 'ok') return []

    const providerCounts = new Map<string, number>()
    const resources = new Set<string>()
    const items = page.page.items.filter(entry => {
      if (resources.has(entry.resource)) return false
      resources.add(entry.resource)
      const count = providerCounts.get(entry.provider) ?? 0
      if (count >= 2) return false
      providerCounts.set(entry.provider, count + 1)
      return true
    }).slice(0, 8)
    return items.length === 0 ? [] : [{ ...rail, items }]
  })
  return { observedAt: new Date().toISOString(), rails }
}
