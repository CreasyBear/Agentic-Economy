import { ArrowUpRight } from 'lucide-react'

import { ProductListingShelf } from '@/components/arc/market/ProductListing'
import type { X402MarketplaceHome } from '@/modules/market/x402-marketplace-home'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { SavedDirectoryTool } from '@/modules/market/saved-tools.contracts'
import { DirectoryToolCard } from './DirectoryToolCard'

type DirectoryHomeDiscoveryProps = Readonly<{
  home: X402MarketplaceHome
  onSave: (item: SavedDirectoryTool) => void
  isSaved: (item: SavedDirectoryTool) => boolean
  saveDisabled?: boolean
  saveUnknown?: boolean
  onCompare: (item: SavedDirectoryTool) => void
  isComparing: (resource: string) => boolean
  compareDisabled: (resource: string) => boolean
}>

/** Evidence shelves retain the server's order, omissions and eight-Tool bound. */
export function DirectoryHomeDiscovery({ home, onSave, isSaved, saveDisabled, saveUnknown = false, onCompare, isComparing, compareDisabled }: DirectoryHomeDiscoveryProps) {
  const rails = home.rails.filter(rail => rail.items.length > 0)
  return <div className="arc-market grid min-w-0 gap-12 pb-[calc(var(--ae-mobile-nav-height)+env(safe-area-inset-bottom,0px)+2rem)] md:pb-8 sm:gap-16">
    {rails.map(rail => <ProductListingShelf key={rail.id} title={rail.title} description={rail.subtitle} label={`${rail.title} Tools`} previousLabel={`Previous ${rail.title} Tools`} nextLabel={`Next ${rail.title} Tools`} action={<a href={`/market?sort=${rail.sort}`} aria-label={`See all ${rail.title}`} className="arc-listing-all">See all<ArrowUpRight size={16} aria-hidden="true" /></a>}>
      {rail.items.slice(0, 8).map(entry => {
        const item: SavedDirectoryTool = { entry, search: {} }
        return <li key={entry.resource}><DirectoryToolCard model={toDirectoryToolCardModel(entry)} entry={entry} onSave={() => onSave(item)} saved={isSaved(item)} saveDisabled={saveDisabled === true} saveUnknown={saveUnknown} onCompare={() => onCompare(item)} comparing={isComparing(entry.resource)} compareDisabled={compareDisabled(entry.resource)} /></li>
      })}
    </ProductListingShelf>)}
  </div>
}
