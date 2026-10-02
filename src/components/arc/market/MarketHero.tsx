import type { ReactNode } from 'react'
import './MarketHero.css'

export type MarketHeroProps = Readonly<{
  children: ReactNode
  starters?: ReactNode
  compact?: boolean
  title?: string
  headingLevel?: 1 | 2
}>

/**
 * Requires: callers supply child controls and may supply an exact title.
 * Ensures: the title or default appears once at the requested heading level.
 * Invariant: presentation owns no query, chat or purchase state.
 * On violation: absent children render no claim about available supply.
 */
export function MarketHero({ children, title = 'Tool market', headingLevel = 1 }: MarketHeroProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h1'

  return <section className="arc-market-hero">
    <header className="arc-market-hero-top arc-listing-top">
      <div className="arc-market-hero-heading arc-listing-heading">
        <Heading className="arc-market-hero-title">{title}</Heading>
        <p className="arc-market-hero-deck">Find a useful contribution.</p>
      </div>
      <div className="arc-market-hero-tools arc-listing-tools">{children}</div>
    </header>
  </section>
}
