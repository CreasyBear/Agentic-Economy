import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'

import { ProductListingShelf } from '@/components/ae/shared/arc-pro/market/ProductListing'
import { ProviderListingCard } from '@/components/ae/shared/arc-pro/market/ProviderListing'
import type { X402DirectoryCatalogueOverview } from '@/modules/market/x402-directory-catalogue'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { SavedDirectoryTool } from '@/modules/market/saved-tools.contracts'
import { DirectoryToolCard } from './DirectoryToolCard'
import { useMarketPath } from './market-navigation-context'

type Props = Readonly<{
  overview: Extract<X402DirectoryCatalogueOverview, { kind: 'ok' }>
  onSave: (item: SavedDirectoryTool) => void
  isSaved: (item: SavedDirectoryTool) => boolean
  onCompare: (item: SavedDirectoryTool) => void
  isComparing: (resource: string) => boolean
  compareDisabled: (resource: string) => boolean
}>

/** Ranks and Provider counts come directly from the complete observed directory index. */
export function DirectoryIndexDiscovery({ overview, onSave, isSaved, onCompare, isComparing, compareDisabled }: Props) {
  const marketPath = useMarketPath()
  const shelves = [
    { key: 'popular', title: 'Busiest Tools', description: 'Most calls reported in the last 30 days.', entries: overview.popular, sort: 'popular' },
  ] as const

  return <div className="arc-market grid min-w-0 gap-12 pb-10 sm:gap-16">
    {shelves.map(shelf => <ProductListingShelf key={shelf.key} title={shelf.title} description={shelf.description} label={`${shelf.title} carousel`} previousLabel={`Previous ${shelf.title}`} nextLabel={`Next ${shelf.title}`} action={<Link to={marketPath} search={{ view: 'tools', sort: shelf.sort }} aria-label={`View all ${shelf.title.toLowerCase()}`} className="arc-listing-all">View all<ArrowUpRight size={16} aria-hidden="true" /></Link>} {...(shelf.entries.length === 0 ? { empty: <p className="arc-listing-empty">No reported usage is available for this selection yet.</p> } : {})}>
      {shelf.entries.map(({ entry }) => {
        const item: SavedDirectoryTool = { entry, search: {} }
        return <li key={entry.resource}><DirectoryToolCard model={toDirectoryToolCardModel(entry)} entry={entry} onSave={() => onSave(item)} saved={isSaved(item)} onCompare={() => onCompare(item)} comparing={isComparing(entry.resource)} compareDisabled={compareDisabled(entry.resource)} /></li>
      })}
    </ProductListingShelf>)}
    <ProductListingShelf
      title="Explore Providers"
      description="An A–Z selection, with catalogue-wide Tool counts."
      label="Explore Providers"
      previousLabel="Previous Providers"
      nextLabel="Next Providers"
      action={<Link to={marketPath} search={{ view: 'providers' }} className="arc-listing-all">All Providers<ArrowUpRight size={16} aria-hidden="true" /></Link>}
      {...(overview.providers.length === 0 ? { empty: <p className="arc-listing-empty">No Provider hostnames are available for this selection.</p> } : {})}
    >
      {overview.providers.map(provider => <li key={provider.key}><ProviderListingCard provider={provider.label} {...(provider.iconUrl === undefined ? {} : { iconUrl: provider.iconUrl })} countLabel={`${provider.count.toLocaleString('en-AU')} ${provider.count === 1 ? 'Tool' : 'Tools'}`} countScope="In the indexed catalogue" action={<Link to={marketPath} search={{ view: 'tools', provider: provider.key }} aria-label={`View Tools from ${provider.label}`} className="arc-provider-action">Explore Tools<ArrowUpRight size={16} aria-hidden="true" /></Link>} /></li>)}
    </ProductListingShelf>
  </div>
}
