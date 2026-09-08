import { Link } from '@tanstack/react-router'
import { ArrowUpRight, BracesIcon, TrophyIcon } from 'lucide-react'
import { useId } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'
import type { MarketWindow } from '@/modules/market/contracts'
import type { X402DirectoryCatalogueOverview } from '@/modules/market/x402-directory-catalogue'
import type { SavedDirectoryTool } from './DirectorySavedTools'
import { DirectoryToolCard } from './DirectoryToolCard'
import { directoryDate } from './directory-presentation'

type Props = Readonly<{
  overview: Extract<X402DirectoryCatalogueOverview, { kind: 'ok' }>
  window: MarketWindow
  onSelect: (item: SavedDirectoryTool) => void
  onSave: (item: SavedDirectoryTool) => void
  isSaved: (resource: string) => boolean
  onCompare: (item: SavedDirectoryTool) => void
  isComparing: (resource: string) => boolean
  compareDisabled: (resource: string) => boolean
}>

/** Ranks and Provider counts come directly from the complete observed directory index. */
export function DirectoryIndexDiscovery({ overview, window, onSelect, onSave, isSaved, onCompare, isComparing, compareDisabled }: Props) {
  const id = useId()
  const shelves = [
    { key: 'popular', title: 'Popular Tools', description: 'Most Calls reported in the last 30 days.', entries: overview.popular, sort: 'popular' },
    { key: 'updated', title: 'Recently updated', description: 'Service details ordered by the Provider’s published update date.', entries: overview.recentlyUpdated, sort: 'updated' },
  ] as const

  return <div className="grid min-w-0 gap-12 pb-10 sm:gap-16">
    <div className="-mb-6 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Find your next favourite. See what other agents use.</p><Button asChild variant="outline" size="sm" className="rounded-full"><Link to="/market" search={{ window, view: 'leaderboard' }}><TrophyIcon className="size-4" />Explore the leaderboard<ArrowUpRight className="size-4" /></Link></Button></div>
    {shelves.map(shelf => <section key={shelf.key} className="min-w-0">
      <Carousel opts={{ align: 'start', loop: false }} aria-labelledby={`${id}-${shelf.key}`}>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl"><h2 id={`${id}-${shelf.key}`} className="text-2xl font-medium tracking-tight sm:text-3xl">{shelf.title}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{shelf.description}</p></div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="mr-1 rounded-full"><Link to="/market" search={{ window, view: 'tools', sort: shelf.sort }} aria-label={`View all ${shelf.title.toLowerCase()}`}>View all<ArrowUpRight className="size-4" /></Link></Button>
            {shelf.entries.length === 0 ? null : <><CarouselPrevious className="static size-9 translate-y-0" aria-label={`Previous ${shelf.title}`} /><CarouselNext className="static size-9 translate-y-0" aria-label={`Next ${shelf.title}`} /></>}
          </div>
        </div>
        {shelf.entries.length === 0 ? <p className="rounded-xl border border-dashed border-border px-5 py-8 text-sm text-muted-foreground">{shelf.key === 'popular' ? 'No reported Call activity is available for this selection yet.' : 'No published update dates are available for this selection yet.'}</p> : <CarouselContent className="-ml-4 py-1">
          {shelf.entries.map(({ entry }) => {
            const item: SavedDirectoryTool = { entry, search: {} }
            return <CarouselItem key={entry.resource} className="basis-[85%] pl-4 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4">
              <div className="flex h-full flex-col gap-2.5">
                <DirectoryToolCard entry={entry} onSelect={() => onSelect(item)} onSave={() => onSave(item)} saved={isSaved(entry.resource)}
                  onCompare={() => onCompare(item)} comparing={isComparing(entry.resource)} compareDisabled={compareDisabled(entry.resource)} />
                {shelf.key === 'updated' && entry.provenance?.updatedAt !== undefined ? <p className="px-1 text-xs text-muted-foreground">Updated {directoryDate(entry.provenance.updatedAt)}</p> : null}
              </div>
            </CarouselItem>
          })}
        </CarouselContent>}
      </Carousel>
    </section>)}
    <section aria-labelledby={`${id}-providers`}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><h2 id={`${id}-providers`} className="text-2xl font-medium tracking-tight sm:text-3xl">Explore Providers</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">An A–Z selection, with catalogue-wide Tool counts.</p></div>
        <Button asChild variant="ghost" size="sm" className="rounded-full"><Link to="/market" search={{ window, view: 'providers' }}>All Providers<ArrowUpRight className="size-4" /></Link></Button>
      </div>
      {overview.providers.length === 0 ? <p className="text-sm text-muted-foreground">No Provider hostnames are available for this selection.</p> : <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {overview.providers.map(provider => <li key={provider.key} className="min-w-0">
          <Card className="h-full gap-0 border-border/70 py-0 shadow-none"><CardContent className="p-0">
            <Link to="/market" search={{ window, view: 'tools', provider: provider.key }} aria-label={`View Tools from ${provider.label}`} className="flex min-w-0 items-center gap-3 rounded-[inherit] p-4 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <Avatar className="size-11 shrink-0 rounded-xl border border-border/60">
                {provider.iconUrl === undefined ? null : <AvatarImage src={provider.iconUrl} alt="Published service icon" referrerPolicy="no-referrer" className="object-cover" />}
                <AvatarFallback className="rounded-xl"><BracesIcon className="size-4" aria-hidden="true" /></AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={provider.label}>{provider.label}</p><p className="mt-1 text-xs text-muted-foreground">{provider.count.toLocaleString('en-AU')} {provider.count === 1 ? 'Tool' : 'Tools'}</p></div><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </CardContent></Card>
        </li>)}
      </ul>}
    </section>
  </div>
}
