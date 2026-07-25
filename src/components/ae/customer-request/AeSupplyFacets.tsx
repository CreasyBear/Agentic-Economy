import { Text } from '@astryxdesign/core/Text'

import { RouterLink } from '@/components/astryx/RouterLink'

/**
 * The cold-start question is "is there anything here for me?".
 *
 * A blank composer cannot answer it, and a person should not have to compose a
 * sentence to find out. So the front door states the supply it actually has:
 * one entry per published trade, carrying its real count, each one click from
 * the matching listings.
 *
 * Every figure is derived from published listings. Nothing here is a target, a
 * placeholder, or a rounded-up ambition, and the whole block disappears rather
 * than implying supply that does not exist.
 */

export type SupplyFacet = Readonly<{
  id: string
  label: string
  count: number
  href: string
}>

export function AeSupplyFacets({ facets, businessCount, stateCount }: {
  facets: readonly SupplyFacet[]
  businessCount: number
  stateCount: number
}) {
  if (facets.length === 0) {
    return null
  }

  const businesses = `${businessCount} ${businessCount === 1 ? 'business' : 'businesses'}`
  const scope = stateCount > 1 ? `${businesses} across ${stateCount} states` : businesses

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-3" aria-labelledby="supply-facets-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text id="supply-facets-heading" weight="semibold" className="block">Browse by trade</Text>
        <Text type="supporting" color="secondary">{scope}</Text>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {facets.map((facet) => (
          <li key={facet.id}>
            <RouterLink
              href={facet.href}
              className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2 text-primary transition-[background-color,border-color] duration-150 hover:border-accent hover:bg-accent-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="truncate text-sm font-medium">{facet.label}</span>
              <span className="shrink-0 text-sm text-secondary" aria-label={`${facet.count} listed`}>{facet.count}</span>
            </RouterLink>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Busiest trade first: the ordering is itself information, the way a ranked
 * leaderboard tells you where the depth is before you read a single row.
 */
export function supplyFacetsFromListings(
  listings: readonly Readonly<{ category: string }>[],
): readonly SupplyFacet[] {
  const counts = new Map<string, { label: string; count: number }>()
  for (const listing of listings) {
    const category = listing.category.trim()
    if (category.length === 0) {
      continue
    }
    const key = category.toLowerCase()
    const existing = counts.get(key)
    if (existing === undefined) {
      counts.set(key, { label: category, count: 1 })
      continue
    }
    existing.count += 1
  }

  return [...counts.entries()]
    .sort(([, left], [, right]) => right.count - left.count || left.label.localeCompare(right.label))
    .map(([key, { label, count }]) => ({
      id: key,
      label,
      count,
      href: `/registry?q=${encodeURIComponent(label)}`,
    }))
}

export function countPublishedStates(listings: readonly Readonly<{ stateTerritory: string }>[]): number {
  const states = new Set<string>()
  for (const listing of listings) {
    const state = listing.stateTerritory.trim()
    if (state.length > 0) {
      states.add(state.toUpperCase())
    }
  }
  return states.size
}
