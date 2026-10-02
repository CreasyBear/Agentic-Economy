import './ProviderCatalogueComposition.css'
import { ToolListingCard } from './ToolListingCard'
import type { ProviderHumanOfferingView, ToolObjectView } from './object-family.contracts'

export type ProviderPortfolioProps = Readonly<{ offerings: readonly ToolObjectView[]; otherOfferings?: readonly ProviderHumanOfferingView[] }>

export function ProviderPortfolio({ offerings, otherOfferings = [] }: ProviderPortfolioProps) {
  return (
    <section aria-labelledby="provider-offerings-heading" className="arc-provider-portfolio">
      <h2 id="provider-offerings-heading">Tools and offerings</h2>
      {offerings.length === 0 && otherOfferings.length === 0 ? <p className="text-sm text-muted-foreground">No sourced offerings are available.</p> : (
        <div className="arc-provider-gallery">
          {offerings.map((view) => <div key={view.href ?? view.listing.identity.title.sourceRef} className="arc-provider-offering">
            <ToolListingCard view={view} />
            <p className="arc-provider-meta">{view.listing.canonicalToolRef.kind === 'present' ? 'Admitted Tool' : 'Catalogue-only offering'}</p>
          </div>)}
          {otherOfferings.map((offering) => <article key={offering.name} className="arc-provider-card">
            <header><h3>{offering.name}</h3></header>
            <div className="arc-provider-card-body">
              {offering.summary === undefined ? null : <p>{offering.summary}</p>}
              <p className="arc-provider-meta">Human-request offering · not an admitted Tool</p>
              {offering.href === undefined ? null : <a href={offering.href} className="arc-provider-text-link">View offering</a>}
            </div>
          </article>)}
        </div>
      )}
    </section>
  )
}
