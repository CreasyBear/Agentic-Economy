
import { Link } from '@tanstack/react-router'

/**
 * The cold-start question is "is there anything here for me?".
 *
 * A blank composer cannot answer it, and a person should not have to compose a
 * sentence to find out. So the front door names the trades AE can actually
 * reach, each one click from the matching listings.
 *
 * Deliberately no counts. The public projection pages at a fixed size and
 * exposes no total, so any figure derived here would describe one page rather
 * than the catalogue, and would disagree with the listings it links to. A
 * truthful count needs a bounded aggregate that also excludes sandbox
 * providers; until that exists, naming the trades is the honest claim.
 */

export type SupplyFacet = Readonly<{
  id: string
  label: string
  href: string
}>

export function AeSupplyFacets({ facets }: { facets: readonly SupplyFacet[] }) {
  if (facets.length === 0) {
    return null
  }

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-3" aria-labelledby="supply-facets-heading">
      <p id="supply-facets-heading" className="block font-semibold">Browse by trade</p>
      <ul className="flex flex-wrap gap-2">
        {facets.map((facet) => (
          <li key={facet.id}>
            {facet.href === '/registry' || facet.href.startsWith('/registry?') || facet.href.startsWith('/registry#') ? (
              <Link
                to="/registry"
                search={{ q: facet.label, category: facet.label }}
                className="flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-[background-color,border-color] duration-150 hover:border-brand hover:bg-brand-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {facet.label}
              </Link>
            ) : (
              <a
                href={facet.href}
                className="flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-[background-color,border-color] duration-150 hover:border-brand hover:bg-brand-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {facet.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Sandbox and synthetic providers are labelled fixtures that prove workflows.
 * They are real rows in the catalogue but they are not supply a customer can
 * buy from, so they must never appear as a browsable trade on a public surface.
 *
 * The projection carries no fixture flag yet, so this matches the slug prefix
 * and category wording the seed uses. Replace this with the flag as soon as the
 * public projection exposes one.
 */
function isFixtureListing(listing: Readonly<{ category: string; slug: string }>): boolean {
  const category = listing.category.toLowerCase()
  return listing.slug.startsWith('sandbox-')
    || category.includes('sandbox')
    || category.includes('synthetic')
}

export function supplyFacetsFromListings(
  listings: readonly Readonly<{ category: string; slug: string }>[],
): readonly SupplyFacet[] {
  const byCategory = new Map<string, string>()
  for (const listing of listings) {
    const category = listing.category.trim()
    if (category.length === 0 || isFixtureListing(listing)) {
      continue
    }
    const key = category.toLowerCase()
    if (byCategory.has(key)) {
      continue
    }
    byCategory.set(key, category)
  }

  return [...byCategory.entries()]
    .sort(([, left], [, right]) => left.localeCompare(right))
    .map(([key, label]) => ({
      id: key,
      label,
      // Pin the category as well as the query: the entry point promises this
      // trade, so it must land on this trade rather than a broader text match.
      href: `/registry?q=${encodeURIComponent(label)}&category=${encodeURIComponent(label)}`,
    }))
}
