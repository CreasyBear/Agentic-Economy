import { Link } from '@tanstack/react-router'
import { AeActionLink } from '@/components/ae/shared/action-link/AeActionLink'
import type { ToolObjectView } from './object-family.contracts'
import { ToolFacts } from './ToolFacts'
import './ProviderCatalogueComposition.css'

export type ToolListingCardProps = Readonly<{
  view: ToolObjectView
  onSave?: () => void
  saved?: boolean
  onCompare?: () => void
  comparing?: boolean
  compareDisabled?: boolean
  fromMarket?: boolean
}>

export function ToolListingCard({ view, onSave, saved, onCompare, comparing, compareDisabled, fromMarket }: ToolListingCardProps) {
  return (
    <article className="arc-provider-card">
      <header>
        <h3>{view.href === undefined
          ? view.title
          : <Link to={view.href} {...(fromMarket ? { state: { fromMarket: true as const } } : {})}>{view.title}</Link>}</h3>
        {view.identity === undefined ? null : <p className="arc-provider-meta">{view.identity.kind === 'verified_provider' ? 'Provider' : view.identity.kind === 'publisher' ? 'Publisher' : 'Directory Host'}: {view.identity.name}</p>}
      </header>
      <div className="arc-provider-card-body">
        {view.outcome === undefined ? null : <p>{view.outcome}</p>}
        <ToolFacts view={view} compact />
        <p className="arc-provider-meta">Source: {view.listing.identity.title.provenance.replaceAll('_', ' ')}</p>
      </div>
      {onSave === undefined && onCompare === undefined ? null : (
        <footer className="arc-provider-actions">
          {onSave === undefined ? null : <AeActionLink type="button" variant="ghost" size="md" labelLayout="wrap" aria-pressed={saved === true} onAction={onSave}>{saved ? 'Saved' : 'Save'}</AeActionLink>}
          {onCompare === undefined ? null : <AeActionLink type="button" variant="ghost" size="md" labelLayout="wrap" aria-label={`${comparing ? 'Remove' : 'Add'} ${view.title} ${comparing ? 'from' : 'to'} comparison`} disabled={compareDisabled === true} aria-pressed={comparing === true} onAction={onCompare}>{comparing ? 'Comparing' : 'Compare'}</AeActionLink>}
        </footer>
      )}
    </article>
  )
}
