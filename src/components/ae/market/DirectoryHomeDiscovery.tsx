import { ArrowUpRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'
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

/** Evidence-based marketplace shelves; the server omits empty or failed reads. */
export function DirectoryHomeDiscovery({ home, onSave, isSaved, saveDisabled, saveUnknown = false, onCompare, isComparing, compareDisabled }: DirectoryHomeDiscoveryProps) {
  const rails = home.rails.filter(rail => rail.items.length > 0)
  return <div className="pb-[calc(var(--ae-mobile-nav-height)+env(safe-area-inset-bottom,0px)+2rem)] md:pb-8">
    <div className="grid gap-12 sm:gap-16">
      {rails.map(rail => <section key={rail.id} className="min-w-0 scroll-mt-[calc(var(--header-height)+1rem)] scroll-mb-[calc(var(--ae-mobile-nav-height)+env(safe-area-inset-bottom,0px)+1rem)]" aria-labelledby={`directory-collection-${rail.id}`}>
        <Carousel opts={{ align: 'start', loop: false }} aria-label={`${rail.title} Tools`}>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <h2 id={`directory-collection-${rail.id}`} className="text-2xl font-medium tracking-tight sm:text-3xl">{rail.title}</h2>
              <p className="mt-2 line-clamp-1 text-sm leading-relaxed text-muted-foreground">{rail.subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a href={`/market?sort=${rail.sort}`} aria-label={`See all ${rail.title}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mr-1 min-h-touch rounded-full')}>See all<ArrowUpRight className="size-4" aria-hidden="true" /></a>
              <CarouselPrevious className="static size-10 min-h-touch translate-y-0" aria-label={`Previous ${rail.title} Tools`} />
              <CarouselNext className="static size-10 min-h-touch translate-y-0" aria-label={`Next ${rail.title} Tools`} />
            </div>
          </div>
          <CarouselContent className="-ml-4 py-1">
              {rail.items.slice(0, 8).map(entry => {
                const item = { entry, search: {} }
                return <CarouselItem key={entry.resource} className="h-full basis-[85%] pl-4 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4">
                  <DirectoryToolCard model={toDirectoryToolCardModel(entry)} onSave={() => onSave(item)} saved={isSaved(item)} saveDisabled={saveDisabled === true} saveUnknown={saveUnknown}
                    onCompare={() => onCompare(item)} comparing={isComparing(entry.resource)} compareDisabled={compareDisabled(entry.resource)} />
                </CarouselItem>
              })}
          </CarouselContent>
        </Carousel>
      </section>)}
    </div>
  </div>
}
