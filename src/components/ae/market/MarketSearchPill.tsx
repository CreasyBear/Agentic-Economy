import { SearchIcon } from 'lucide-react'
import { forwardRef, type FormEvent } from 'react'

import { Button } from '@/components/arc/button/button'
import { SearchField, type SearchFieldProps } from '@/components/arc/search-field/search-field'
import './MarketComposition.css'

type MarketSearchPillProps = Readonly<{
  label: string
  value: string
  onValueChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  /** Field attributes beyond the value, such as the placeholder, validity or autocorrect. */
  field?: Omit<SearchFieldProps, 'label' | 'value' | 'onValueChange'>
}>

/**
 * Airbnb's search pill, the one search bar on the landing and in /market: Arc's search field and a
 * primary Search button in a rounded bar. The form is a real GET to /market, so it works before hydration.
 */
export const MarketSearchPill = forwardRef<HTMLInputElement, MarketSearchPillProps>(function MarketSearchPill({ label, value, onValueChange, onSubmit, field }, ref) {
  return <form role="search" aria-label={label} action="/market" method="get" className="ae-browse-search" onSubmit={onSubmit}>
    <SearchField ref={ref} label={label} name="query" value={value} onValueChange={onValueChange} autoComplete="off" enterKeyHint="search" {...field} />
    <Button type="submit" variant="primary" aria-label="Search"><SearchIcon aria-hidden="true" /><span className="ae-browse-search-label">Search</span></Button>
  </form>
})
