import { Link } from '@tanstack/react-router'
import { ArrowUpRight, BracesIcon } from 'lucide-react'
import { useId } from 'react'

import { AeCollectionRail } from '@/components/ae/shared/AeCollectionRail'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'
import type { X402DirectoryCatalogueOverview } from '@/modules/market/x402-directory-catalogue'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { SavedDirectoryTool } from '@/modules/market/saved-tools.contracts'
import { DirectoryToolCard } from './DirectoryToolCard'
import { directoryDate } from './directory-presentation'
import { useMarketPath } from './market-navigation-context'

type Props = Readonly<{
  overview: Extract<X402DirectoryCatalogueOverview, { kind: 'ok' }>
  onSave: (item: SavedDirectoryTool) => void
  isSaved: (resource: string) => boolean
  onCompare: (item: SavedDirectoryTool) => void
  isComparing: (resource: string) => boolean
  compareDisabled: (resource: string) => boolean
}>

/** Ranks and Provider counts come directly from the complete observed directory index. */
export function DirectoryIndexDiscovery({ overview, onSave, isSaved, onCompare, isComparing, compareDisabled }: Props) {
  const marketPath = useMarketPath()
  const id = useId()
  const shelves = [
    { key: 'popular', kicker: 'Adoption', title: 'Popular Tools', description: 'Most Calls reported in the last 30 days.', entries: overview.popular, sort: 'popular' },
    { key: 'updated', kicker: 'Freshness', title: 'Recently updated', description: 'Service details ordered by the Provider’s published update date.', entries: overview.recentlyUpdated, sort: 'updated' },
  ] as const

  return <div className="grid min-w-0 gap-12 pb-10 sm:gap-16">
    {shelves.map(shelf => <section key={shelf.key} className="min-w-0">
      <Carousel opts={{ align: 'start', loop: false }} aria-label={`${shelf.title} carousel`}>
        <AeCollectionRail
          kicker={shelf.kicker}
          title={shelf.title}
          titleId={`${id}-${shelf.key}`}
          deck={shelf.description}
          action={<div className="flex shrink-0 items-center gap-2">
            <Link to={marketPath} search={{ view: 'tools', sort: shelf.sort }} aria-label={`View all ${shelf.title.toLowerCase()}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mr-1 min-h-touch rounded-full')}>View all<ArrowUpRight className="size-4" aria-hidden="true" /></Link>
            {shelf.entries.length === 0 ? null : <><CarouselPrevious className="static size-10 min-h-touch translate-y-0" aria-label={`Previous ${shelf.title}`} /><CarouselNext className="static size-10 min-h-touch translate-y-0" aria-label={`Next ${shelf.title}`} /></>}
          </div>}
          className="mb-0"
        />
        {shelf.entries.length === 0 ? <p className="rounded-card border border-dashed border-border px-5 py-8 text-sm text-muted-foreground">{shelf.key === 'popular' ? 'No reported Call activity is available for this selection yet.' : 'No published update dates are available for this selection yet.'}</p> : <CarouselContent className="-ml-4 py-1">
          {shelf.entries.map(({ entry }) => {
            const item: SavedDirectoryTool = { entry, search: {} }
            return <CarouselItem key={entry.resource} className="basis-[85%] pl-4 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4">
              <div className="flex h-full flex-col gap-2.5">
                <DirectoryToolCard model={toDirectoryToolCardModel(entry)} onSave={() => onSave(item)} saved={isSaved(entry.resource)}
                  onCompare={() => onCompare(item)} comparing={isComparing(entry.resource)} compareDisabled={compareDisabled(entry.resource)} />
                {shelf.key === 'updated' && entry.provenance?.updatedAt !== undefined ? <p className="px-1 text-xs text-muted-foreground">Updated {directoryDate(entry.provenance.updatedAt)}</p> : null}
              </div>
            </CarouselItem>
          })}
        </CarouselContent>}
      </Carousel>
    </section>)}
    <AeCollectionRail
      kicker="Providers"
      title="Explore Providers"
      titleId={`${id}-providers`}
      deck="An A–Z selection, with catalogue-wide Tool counts."
      action={<Link to={marketPath} search={{ view: 'providers' }} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'min-h-touch rounded-full')}>All Providers<ArrowUpRight className="size-4" aria-hidden="true" /></Link>}
    >
      {overview.providers.length === 0 ? <p className="text-sm text-muted-foreground">No Provider hostnames are available for this selection.</p> : <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {overview.providers.map(provider => <li key={provider.key} className="min-w-0">
          <Card discoverLift className="h-full gap-0 border-border/70 py-0 shadow-none"><CardContent className="p-0">
            <Link to={marketPath} search={{ view: 'tools', provider: provider.key }} aria-label={`View Tools from ${provider.label}`} className="flex min-w-0 items-center gap-3 rounded-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <Avatar className="size-11 shrink-0 rounded-xl border border-border/60">
                {provider.iconUrl === undefined ? null : <AvatarImage src={provider.iconUrl} alt="Published service icon" referrerPolicy="no-referrer" className="object-cover" />}
                <AvatarFallback className="rounded-xl"><BracesIcon className="size-4" aria-hidden="true" /></AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={provider.label}>{provider.label}</p><p className="mt-1 text-xs text-muted-foreground">{provider.count.toLocaleString('en-AU')} {provider.count === 1 ? 'Tool' : 'Tools'}</p></div><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </CardContent></Card>
        </li>)}
      </ul>}
    </AeCollectionRail>
  </div>
}
