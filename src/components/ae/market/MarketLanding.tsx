import { Link, useRouter } from '@tanstack/react-router'
import { ArrowDown, ArrowUpRight } from 'lucide-react'

import { HeroContent } from '@/components/arc/blocks/hero-section/hero-content'
import { RouterLinkBoundary } from '@/components/ae/shared/router-link-boundary/RouterLinkBoundary'
import { AECON_DARK_MARK_SRC } from '@/content/brand-assets'
import { marketCategories } from '@/modules/market/listing-evidence'
import { marketUsesCanonicalSearch } from '@/modules/market/market-route-data'
import type { MarketSearch } from '@/modules/market/market.functions'
import './MarketLanding.css'

type MarketLandingProps = Readonly<{
  search: MarketSearch
  searchRecipient: Readonly<{ label: string; host: string }> | null
}>

/** Broad search entry points, using the market owner's vocabulary, not directory facet IDs. */
export function MarketLanding({ search, searchRecipient }: MarketLandingProps) {
  const router = useRouter()
  const { page: _page, indexCursor: _cursor, offset: _offset, view: _view, ...retainedSearch } = search
  const browseSearch: MarketSearch = { ...retainedSearch, view: 'tools' }
  const externalSearch = marketUsesCanonicalSearch({ ...browseSearch, query: 'Finance' });
  const browseHref = router.buildLocation({ to: '/market', search: browseSearch }).href

  return <div className="arc-market ae-market-landing">
    <div className="ae-market-landing__opening">
      <RouterLinkBoundary>
        <HeroContent
          layout="split"
          className="ae-market-landing__hero"
          animateIn={false}
          title="Intelligence, put to work."
          description="A world of tools for you and your agents. Find the capability. Make your next move."
          primaryAction={{ label: 'Explore capabilities', href: '#market-capabilities' }}
          secondaryAction={{ label: 'Browse Tools', href: browseHref }}
          media={<div className="ae-market-landing__symbol" aria-hidden="true">
            <img src={AECON_DARK_MARK_SRC} alt="" width="880" height="725" fetchPriority="high" />
          </div>}
        />
      </RouterLinkBoundary>
      <div className="ae-market-landing__signature">
        <span>Human ambition. Agent capability.</span>
        <a href="#market-capabilities" aria-label="Discover capability categories"><ArrowDown size={20} aria-hidden="true" /></a>
        <span>Agentic Economy</span>
      </div>
    </div>

    <section id="market-capabilities" className="ae-market-landing__capabilities" aria-labelledby="market-capabilities-title" tabIndex={-1}>
      {(search.compare?.length ?? 0) > 0 ? <Link to="/market" search={browseSearch} preload={false} className="ae-market-landing__resume">Resume your comparison<ArrowUpRight size={18} aria-hidden="true" /></Link> : null}
      <div className="ae-market-landing__section-heading">
        <h2 id="market-capabilities-title">What’s your<br />next move?</h2>
        <p>Start with a field of possibility.<br />Find a tool that takes you further.</p>
      </div>
      <nav aria-label="Explore capability categories" className="ae-market-landing__categories">
        {marketCategories.filter(category => category.id !== 'other').map((category, index) => <Link
          key={category.id}
          to="/market"
          search={{ ...browseSearch, query: category.label, sort: 'relevance' }}
          preload={false}
          className="ae-market-landing__category"
          aria-describedby="market-category-search-disclosure"
        >
          <span className="ae-market-landing__category-number" aria-hidden="true">0{index + 1}</span>
          <h3>{category.label}</h3>
          <p>{category.description}</p>
          <ArrowUpRight className="ae-market-landing__category-arrow" size={24} strokeWidth={1.5} aria-hidden="true" />
        </Link>)}
      </nav>
      <div className="ae-market-landing__discovery-note">
        <p id="market-category-search-disclosure">Each category opens a market search.{searchRecipient === null || !externalSearch ? '' : ` Search query and candidate Tool text go to ${searchRecipient.label} (${searchRecipient.host}).`}</p>
        <Link to="/market" search={browseSearch} preload={false}>Browse the whole market<ArrowUpRight size={18} aria-hidden="true" /></Link>
      </div>
    </section>
    <nav className="ae-market-landing__utility" aria-label="Market help and legal">
      <span>Aecon</span>
      <div><Link to="/developers/api">Build with Aecon</Link><Link to="/support">Help</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div>
    </nav>
  </div>
}
