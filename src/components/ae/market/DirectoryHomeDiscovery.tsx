import { ArrowUpRight, Code2, Image, Search, ShoppingBag, ShieldCheck, TrendingUp } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'
import type { X402MarketplaceHome } from '@/modules/market/x402-marketplace-home'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { SavedDirectoryTool } from '@/modules/market/saved-tools.contracts'
import { DirectoryToolCard } from './DirectoryToolCard'

type Props = Readonly<{
  home: X402MarketplaceHome
  onSave: (item: SavedDirectoryTool) => void
  isSaved: (resource: string) => boolean
  onCompare: (item: SavedDirectoryTool) => void
  isComparing: (resource: string) => boolean
  compareDisabled: (resource: string) => boolean
}>

const editorialOrder = ['creative', 'research', 'developer', 'finance', 'commerce', 'identity'] as const
const navigation = {
  creative: { label: 'Create', icon: Image }, research: { label: 'Research', icon: Search },
  developer: { label: 'Build', icon: Code2 }, finance: { label: 'Markets', icon: TrendingUp },
  commerce: { label: 'Commerce', icon: ShoppingBag }, identity: { label: 'Identity', icon: ShieldCheck },
} as const

/** Editorial collections of live directory matches, using the installed Embla carousel. */
export function DirectoryHomeDiscovery({ home, onSave, isSaved, onCompare, isComparing, compareDisabled }: Props) {
  const rails = editorialOrder.flatMap(id => home.rails.filter(rail => rail.id === id))
  return <div className="pb-8">
    <nav aria-label="Discover Tools by job" className="mb-10 flex gap-2 overflow-x-auto border-b border-border pb-5 sm:justify-center sm:gap-3">
      {rails.map(rail => {
        const item = navigation[rail.id]
        const Icon = item.icon
        return <a key={rail.id} href={`#directory-collection-${rail.id}`} className={cn(buttonVariants({ variant: 'outline' }), 'shrink-0 gap-2 rounded-full border-border/70 bg-card px-4 sm:px-5')}><Icon className="size-4" aria-hidden="true" />{item.label}</a>
      })}
    </nav>
    <div className="grid gap-12 sm:gap-16">
      {rails.map(rail => <section key={rail.id} className="min-w-0" aria-labelledby={`directory-collection-${rail.id}`}>
        <Carousel opts={{ align: 'start', loop: false }} aria-label={`${rail.category} Tools`}>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="mb-2 text-caption font-medium uppercase tracking-[0.14em] text-muted-foreground">{rail.category}</p>
              <h2 id={`directory-collection-${rail.id}`} className="text-2xl font-medium tracking-tight sm:text-3xl">{rail.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{rail.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a href={`#directory-collection-${rail.id}`} aria-label={`View collection: ${rail.category}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mr-1 min-h-touch rounded-full')}>View collection<ArrowUpRight className="size-4" aria-hidden="true" /></a>
              {rail.kind === 'ok' && rail.items.length > 0 ? <>
                <CarouselPrevious className="static size-10 min-h-touch translate-y-0" aria-label={`Previous ${rail.category} Tools`} />
                <CarouselNext className="static size-10 min-h-touch translate-y-0" aria-label={`Next ${rail.category} Tools`} />
              </> : null}
            </div>
          </div>
          {rail.kind === 'unavailable' ? <p role="status" className="rounded-xl border border-border bg-muted/30 px-5 py-8 text-sm text-muted-foreground">This collection could not be loaded. See all Tools to keep looking.</p>
            : rail.items.length === 0 ? <p className="rounded-xl border border-border bg-muted/30 px-5 py-8 text-sm text-muted-foreground">No matches were returned for this collection. See all Tools to keep looking.</p>
            : <CarouselContent className="-ml-4 py-1">
              {rail.items.slice(0, 8).map(entry => {
                const item = { entry, search: rail.search }
                return <CarouselItem key={entry.resource} className="h-full basis-[85%] pl-4 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4">
                  <DirectoryToolCard model={toDirectoryToolCardModel(entry)} onSave={() => onSave(item)} saved={isSaved(entry.resource)}
                    onCompare={() => onCompare(item)} comparing={isComparing(entry.resource)} compareDisabled={compareDisabled(entry.resource)} />
                </CarouselItem>
              })}
            </CarouselContent>}
        </Carousel>
      </section>)}
    </div>
  </div>
}
