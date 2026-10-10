import { Link } from '@tanstack/react-router'

import { LANDING_CHIPS } from '@/components/ae/home/landing-content'
import type { MarketSearch } from '@/modules/market/market-route-data'
import './MarketComposition.css'

/**
 * Airbnb's category bar, the one chip row on the landing and in /market: plain links to a /market search,
 * on one line that scrolls sideways when it runs out of room. Links work before hydration and never
 * promise a filter the index can't answer. The selected chip links back to the unfiltered list.
 */
export function MarketCategoryRow({ selected, linkSearch, align = 'start' }: Readonly<{
  selected?: string | undefined
  /** The search a chip opens; /market passes one that keeps its other filters. */
  linkSearch?: (query: string | undefined) => MarketSearch
  align?: 'start' | 'center'
}>) {
  return <nav className="ae-chip-row ae-browse-categories" data-align={align} aria-label="Popular searches">
    <ul>
      {LANDING_CHIPS.map(chip => {
        const active = selected === chip.value
        const next = active ? undefined : chip.value
        return <li key={chip.value}>
          <Link to="/market" search={linkSearch?.(next) ?? (next === undefined ? {} : { query: next })} aria-current={active ? 'true' : undefined} className="ae-chip">{chip.label}</Link>
        </li>
      })}
    </ul>
  </nav>
}
