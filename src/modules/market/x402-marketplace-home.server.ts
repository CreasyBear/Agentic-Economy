import type { X402DirectoryEntry } from './x402-directory'
import { readX402DirectoryCatalogue } from './x402-directory-index.server'
import { X402_MARKETPLACE_COLLECTIONS, type X402MarketplaceHome, type X402MarketplaceRail } from './x402-marketplace-home'

function reportedCount(value: number | undefined): number {
  return value !== undefined && value > 0 ? value : 0
}

/** Bazaar paid-call volume, then payers. Equal volume keeps the search order. */
function byBazaarVolume(left: { entry: X402DirectoryEntry; index: number }, right: { entry: X402DirectoryEntry; index: number }): number {
  return reportedCount(right.entry.activity?.calls30d) - reportedCount(left.entry.activity?.calls30d)
    || reportedCount(right.entry.activity?.payers30d) - reportedCount(left.entry.activity?.payers30d)
    || left.index - right.index
}

/** Editorial searches read the same persisted generation as the full catalogue. */
export async function readX402MarketplaceHome(): Promise<X402MarketplaceHome> {
  const results = await Promise.allSettled(X402_MARKETPLACE_COLLECTIONS.map(collection => readX402DirectoryCatalogue({ query: collection.query })))
  const rails: X402MarketplaceRail[] = X402_MARKETPLACE_COLLECTIONS.map((collection, index) => {
    const result = results[index]
    const page = result?.status === 'fulfilled' ? result.value : undefined
    const providerCounts = new Map<string, number>()
    const resources = new Set<string>()
    const ranked = page?.kind !== 'ok' ? [] : page.page.items.map((entry, itemIndex) => ({ entry, index: itemIndex })).sort(byBazaarVolume).map(item => item.entry)
    const items = ranked.filter(entry => {
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
      returnedCount: page?.kind === 'ok' ? page.page.items.length : 0,
      partialResults: page?.kind === 'ok' && !page.isDone,
    }
  })
  return { observedAt: new Date().toISOString(), rails }
}
