import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, ArrowRightIcon, CompassIcon, HeartIcon, ListFilterIcon, SearchIcon, StoreIcon, XIcon } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buildMarketReturnContext, type MarketReturnSearch } from './market-return-context'
import { DirectoryExplorerFilters, type DirectoryExplorerFilterPatch } from './DirectoryExplorerFilters'
import { DirectoryHero } from './DirectoryHero'
import { DirectoryIndexDiscovery } from './DirectoryIndexDiscovery'
import { DirectoryHomeDiscovery } from './DirectoryHomeDiscovery'
import { DirectoryProvidersIndex } from './DirectoryProvidersIndex'
import { DirectoryProviderHeader } from './DirectoryProviderHeader'
import type { X402DirectoryCatalogue, X402DirectoryCatalogueInput, X402DirectoryCatalogueOverview, X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'
import { directoryCatalogueSearchValues } from '@/modules/market/x402-directory-navigation'
import { directoryDate } from './directory-presentation'
import type { X402MarketplaceHome } from '@/modules/market/x402-marketplace-home'
import { DirectoryComparison } from './DirectoryComparison'
import { DirectoryFilters } from './DirectoryFilters'
import { DirectoryProviderCards } from './DirectoryProviderCards'
import { DirectorySavedToolsProvider, useDirectorySavedTools, type SavedDirectoryTool } from './DirectorySavedTools'
import { DirectoryToolCard } from './DirectoryToolCard'
import type { X402DirectoryEntry, X402DirectoryFilters, X402DirectoryInput, X402DirectoryPage } from '@/modules/market/x402-directory'

type DirectorySearch = MarketReturnSearch

type DirectoryProps = Readonly<{ page: X402DirectoryPage; search: DirectorySearch; home?: X402MarketplaceHome; catalogue?: X402DirectoryCatalogue; overview?: X402DirectoryCatalogueOverview; providers?: X402DirectoryProvidersPage }>

export function AeX402Directory(props: DirectoryProps) {
  return <DirectorySavedToolsProvider><DirectoryMarketplace {...props} /></DirectorySavedToolsProvider>
}

function directoryInput(search: X402DirectoryInput) {
  return {
    ...(search.query === undefined ? {} : { query: search.query }),
    ...(search.offset === undefined ? {} : { offset: search.offset }),
    ...(search.network === undefined ? {} : { network: search.network }),
    ...(search.provider === undefined ? {} : { provider: search.provider }),
    ...(search.maxUsdPrice === undefined ? {} : { maxUsdPrice: search.maxUsdPrice }),
  }
}

function DirectoryMarketplace({ page, search, home, catalogue, overview, providers }: DirectoryProps) {
  const navigate = useNavigate()
  const [comparison, setComparison] = useState<readonly SavedDirectoryTool[]>([])
  const [compareOpen, setCompareOpen] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const compareTrigger = useRef<HTMLButtonElement>(null)
  const saved = useDirectorySavedTools()
  const view = search.view ?? (home === undefined ? 'tools' : 'discover')
  const { query, offset, network, provider, maxUsdPrice } = search
  const sourceInput = useMemo(() => directoryInput({ query, offset, network, provider, maxUsdPrice }), [query, offset, network, provider, maxUsdPrice])
  const coverage = catalogue?.kind === 'ok' ? catalogue.coverage : overview?.kind === 'ok' ? overview.coverage : undefined
  const indexed = catalogue?.kind === 'ok' && catalogue.source === 'index'
  const count = coverage !== undefined ? `${coverage.indexedTotal.toLocaleString()} Tools in the catalogue` : page.kind === 'ok' && page.total !== undefined ? `${page.total.toLocaleString()} Tools` : undefined
  const filterValues = directoryCatalogueSearchValues(search)
  const browse = !Object.entries(filterValues).some(([key, value]) => !['sort', 'indexCursor', 'offset'].includes(key) && value !== undefined && value !== false)
  // The one Tool detail surface is the `/tools/$toolRef` page; back-navigation
  // from it returns here, to the current browse view (not to a single entry).
  const { resource: _resource, ...returnSearch } = search
  const returnTo = buildMarketReturnContext(returnSearch, 'tools')

  function applyFilters(filters: X402DirectoryFilters) {
    void navigate({ to: '/market', search: {
      ...(search.query === undefined ? {} : { query: search.query }),
      view: view === 'providers' ? 'providers' : 'tools',
      ...(search.directoryCategory === undefined ? {} : { directoryCategory: search.directoryCategory }),
      ...(search.sort === undefined ? {} : { sort: search.sort }),
      ...(filters.network === undefined ? {} : { network: filters.network }),
      ...(filters.provider === undefined ? {} : { provider: filters.provider }),
      ...(filters.maxUsdPrice === undefined ? {} : { maxUsdPrice: filters.maxUsdPrice }),
    } })
  }
  function indexedSearch() {
    const { indexCursor: _cursor, offset: _offset, ...filters } = filterValues
    return { ...filters }
  }
  function explore(filters: X402DirectoryCatalogueInput) {
    void navigate({ to: '/market', search: { ...filters, view: 'tools' } })
  }
  function applyExplorerFilters(patch: DirectoryExplorerFilterPatch) {
    const next = { ...indexedSearch(), ...patch, view: 'tools' as const }
    for (const key of Object.keys(next)) if (next[key as keyof typeof next] === undefined) delete next[key as keyof typeof next]
    void navigate({ to: '/market', search: next })
  }
  function toggleComparison(item: SavedDirectoryTool) {
    setComparison(current => current.some(other => other.entry.resource === item.entry.resource)
      ? current.filter(other => other.entry.resource !== item.entry.resource)
      : current.length < 4 ? [...current, item] : current)
  }
  function toolGrid(items: readonly SavedDirectoryTool[]) {
    return <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map(item => <li key={item.entry.resource} className="min-w-0">
        <DirectoryToolCard entry={item.entry} returnTo={returnTo} onSave={() => saved.toggleSavedTool(item)} saved={saved.isSaved(item.entry.resource)}
          onCompare={() => toggleComparison(item)} comparing={comparison.some(other => other.entry.resource === item.entry.resource)} compareDisabled={comparison.length >= 4 && !comparison.some(other => other.entry.resource === item.entry.resource)} />
      </li>)}
    </ul>
  }

  return (
    <div className="ae-rail pb-page">
      <DirectoryHero {...(home === undefined ? {} : { home })} compact={view !== 'discover'} {...(view === 'tools' ? { compactTitle: 'Explore capabilities.' } : {})}>
        <form action="/market" method="get" role="search" className="mt-1 flex w-full max-w-2xl gap-2" onSubmit={event => {
          event.preventDefault()
          const query = new FormData(event.currentTarget).get('query')?.toString().trim() ?? ''
          const { query: _query, sort: _sort, ...filters } = indexedSearch()
          void navigate({ to: '/market', search: {
            ...filters,
            ...(query === '' ? {} : { query }),
            view: 'tools',
          } })
        }}>
          <input type="hidden" name="view" value="tools" />
          {search.directoryCategory === undefined ? null : <input type="hidden" name="directoryCategory" value={search.directoryCategory} />}
          {search.network === undefined ? null : <input type="hidden" name="network" value={search.network} />}
          {search.provider === undefined ? null : <input type="hidden" name="provider" value={search.provider} />}
          {search.maxUsdPrice === undefined ? null : <input type="hidden" name="maxUsdPrice" value={search.maxUsdPrice} />}
          <InputGroup className="min-h-14 rounded-full bg-card pl-3 shadow-xs">
            <InputGroupAddon><SearchIcon aria-hidden="true" /></InputGroupAddon>
            <label htmlFor="x402-directory-search" className="sr-only">Search Tools</label>
            <InputGroupInput ref={searchInput} id="x402-directory-search" key={search.query ?? ''} type="search" name="query" placeholder="Describe what you need done…" defaultValue={search.query ?? ''} />
            <InputGroupAddon align="inline-end"><Button type="submit" className="mr-1 rounded-full" aria-label="Search Tools"><SearchIcon aria-hidden="true" /><span className="hidden sm:inline">Search</span></Button></InputGroupAddon>
          </InputGroup>
        </form>
      </DirectoryHero>
      <Tabs value={view} onValueChange={value => {
        if (value === 'discover' || value === 'tools' || value === 'providers' || value === 'saved') {
          void navigate({ to: '/market', search: value === 'saved' || value === 'discover' || value === 'providers' ? { view: value } : {
            ...indexedSearch(), ...(search.indexCursor === undefined ? {} : { indexCursor: search.indexCursor }), view: value,
          } })
        }
      }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <TabsList variant="line" className="max-w-full justify-start overflow-x-auto overflow-y-hidden" aria-label="Browse the marketplace">
            <TabsTrigger value="tools" className="px-3"><ListFilterIcon aria-hidden="true" />Tools</TabsTrigger>
            <TabsTrigger value="discover" className="px-3"><CompassIcon aria-hidden="true" />Collections</TabsTrigger>
            <TabsTrigger value="providers" className="px-3"><StoreIcon aria-hidden="true" />Providers</TabsTrigger>
            <TabsTrigger value="saved" className="px-3"><HeartIcon aria-hidden="true" />Saved{saved.savedTools.length > 0 ? ` (${saved.savedTools.length})` : ''}</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-3">
            {count === undefined || view === 'saved' ? null : <span className="text-xs text-muted-foreground">{count}</span>}
            {view === 'saved' || view === 'discover' || indexed ? null : <DirectoryFilters search={search} onApply={applyFilters} />}
          </div>
        </div>
        {saved.saveError === undefined ? null : <p role="alert" className="py-3 text-sm text-destructive">{saved.saveError}</p>}
        <TabsContent value="discover" className="pt-7">
          {overview?.kind === 'ok' ? <DirectoryIndexDiscovery overview={overview} returnTo={returnTo} onSave={saved.toggleSavedTool} isSaved={saved.isSaved} onCompare={toggleComparison}
            isComparing={resource => comparison.some(item => item.entry.resource === resource)} compareDisabled={resource => comparison.length >= 4 && !comparison.some(item => item.entry.resource === resource)} /> : null}
          {home === undefined ? <AeEmptyState title="Explore the Tool catalogue" description="Open All Tools to browse the current directory, or search for a service above." action={<Button asChild variant="outline"><Link to="/market" search={{ view: 'tools' }}>Browse all Tools</Link></Button>} /> : <DirectoryHomeDiscovery home={home} returnTo={returnTo} onSave={saved.toggleSavedTool} isSaved={saved.isSaved} onCompare={toggleComparison}
            isComparing={resource => comparison.some(item => item.entry.resource === resource)} compareDisabled={resource => comparison.length >= 4 && !comparison.some(item => item.entry.resource === resource)} />}
        </TabsContent>
        <TabsContent value="saved" className="pt-5">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-medium tracking-tight">Your saved Tools</h2>
            <p className="text-xs text-muted-foreground">{saved.storageState === 'session' ? 'Saved for this session only' : 'Saved on this browser'} · Prices may have changed</p>
          </div>
          {!saved.hydrated ? <p role="status">Loading saved Tools…</p> : saved.savedTools.length === 0 ? <AeEmptyState icon={<HeartIcon />} title="Keep a few possibilities close" description="Save a Tool from its card, then come back when your agent needs it." /> : toolGrid(saved.savedTools)}
        </TabsContent>
        {(['tools', 'providers'] as const).map(tab => <TabsContent key={tab} value={tab} className="pt-5">
          {tab === 'providers' && providers !== undefined ? <DirectoryProvidersIndex result={providers} /> : <div className={indexed && tab === 'tools' ? 'grid min-w-0 items-start gap-5 md:grid-cols-[13rem_minmax(0,1fr)] lg:gap-7' : 'min-w-0'}>
          {indexed && tab === 'tools' ? <DirectoryExplorerFilters search={search} {...(overview === undefined ? {} : { overview })} onChange={applyExplorerFilters} onReset={() => explore({})} /> : null}
          <section className="min-w-0" aria-label="Tool results">
          {indexed ? <div className="mb-5 flex flex-wrap items-center justify-between gap-3" aria-label="Catalogue ordering and display">
            <Select value={search.query === undefined ? search.sort ?? 'adoption' : 'relevance'} onValueChange={value => { if (value === 'popular' || value === 'updated' || value === 'relevance' || value === 'adoption' || value === 'price_asc') void navigate({ to: '/market', search: { ...indexedSearch(), view: tab, sort: value } }) }}>
              <SelectTrigger className="min-h-10 bg-card" aria-label="Sort Tools"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{search.query === undefined ? <><SelectItem value="adoption">Broader adoption · 30 days</SelectItem><SelectItem value="price_asc">Lowest listed price</SelectItem><SelectItem value="updated">Recently updated</SelectItem>{search.sort === 'popular' ? <SelectItem value="popular">Call volume · 30 days</SelectItem> : null}</> : <SelectItem value="relevance">Search relevance</SelectItem>}</SelectGroup></SelectContent>
            </Select>
          </div> : null}
          {search.provider !== undefined && page.kind === 'ok' ? <div className="mb-8"><DirectoryProviderHeader provider={search.provider} entries={page.items} /></div> : null}
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-medium tracking-tight">{search.provider !== undefined ? `Tools from this Provider` : search.query === undefined ? tab === 'providers' ? 'Explore Providers' : search.directoryCategory === undefined ? 'Explore the catalogue' : `${search.directoryCategory} Tools` : `Results for “${search.query}”`}</h2>
              {indexed && search.query !== undefined ? <p className="mt-1 text-xs text-muted-foreground">Keyword search across the catalogue</p> : null}
              {page.kind === 'ok' && page.items.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">{indexed ? `${page.items.length} Tools on this page` : page.mode === 'search' || !browse ? `${page.items.length} matching Tools` : `Showing ${page.offset + 1}–${page.offset + page.items.length}${page.total === undefined ? '' : ` of ${page.total.toLocaleString()}`}`}</p> : null}
            </div>
            {!browse ? <Button asChild variant="ghost" size="sm"><Link to="/market" search={{ view: tab }}><XIcon />Clear search & filters</Link></Button> : null}
          </div>
          {search.network !== undefined || search.maxUsdPrice !== undefined ? <div className="mb-4 flex flex-wrap gap-2">{search.network === undefined ? null : <Badge variant="outline">Network: {overview?.kind === 'ok' ? overview.networks.find(item => item.key === search.network)?.label ?? search.network : search.network}</Badge>}{search.maxUsdPrice === undefined ? null : <Badge variant="outline">Up to {search.maxUsdPrice} USDC</Badge>}</div> : null}
          {page.kind === 'unavailable' ? <AeEmptyState icon={<SearchIcon />} title={page.reason === 'query_invalid' ? 'Check your search' : 'Catalogue temporarily unavailable'}
            description={page.reason === 'query_invalid' ? 'Use a service description without personal identifiers.' : search.indexCursor !== undefined ? 'This catalogue page could not be loaded. Refresh results to start again with the same search and filters.' : 'The discovery service could not be reached. Try again.'}
            action={<Button asChild variant="outline"><Link to="/market" reloadDocument search={search.indexCursor === undefined ? search : { ...indexedSearch(), view: tab }}>{search.indexCursor === undefined ? "Try again" : "Refresh results"}</Link></Button>} /> : <>
            {page.partialResults === true ? <p role="status" className="mb-4 text-sm text-muted-foreground">Coinbase returned its top matches. Refine your search to find more Tools.</p> : null}
            {page.items.length === 0 ? <AeEmptyState title={indexed && catalogue.kind === 'ok' && !catalogue.isDone ? 'More of the catalogue remains' : 'No matching Tools'} description={indexed && catalogue.kind === 'ok' && !catalogue.isDone ? 'No matches in this portion. Continue to the next page to check the remaining Tools.' : 'Try a different description or broaden your filters.'} /> : tab === 'providers'
              ? <DirectoryProviderCards entries={page.items} onSelect={provider => { void navigate({ to: '/market', search: { ...sourceInput, provider, offset: 0 } }) }} />
              : toolGrid(page.items.map(entry => ({ entry, search: sourceInput })))}
            <nav aria-label="Catalogue pages" className="mt-8 flex justify-between gap-4 border-t border-border pt-5">
              {indexed ? <>
                <span>{search.indexCursor === undefined ? null : <Button asChild variant="outline"><Link to="/market" search={{ ...indexedSearch(), view: tab }}><ArrowLeftIcon />First page</Link></Button>}</span>
                {catalogue.indexCursor === undefined ? null : <Button asChild variant="outline"><Link to="/market" search={{ ...indexedSearch(), view: tab, indexCursor: catalogue.indexCursor }}>Next page<ArrowRightIcon /></Link></Button>}
              </> : <>
              <span>{page.previousOffset === undefined ? null : <Button asChild variant="outline"><Link to="/market" search={{ ...sourceInput, view: tab, offset: page.previousOffset }}><ArrowLeftIcon />Previous page</Link></Button>}</span>
              {page.nextOffset === undefined ? null : <Button asChild variant="outline"><Link to="/market" search={{ ...sourceInput, view: tab, offset: page.nextOffset }}>Next page<ArrowRightIcon /></Link></Button>}
            </>}
            </nav>
            <p className="mt-4 text-xs text-muted-foreground">Directory: Coinbase Bazaar. Descriptions and payment requirements are published by providers.</p>
            {coverage === undefined ? null : <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{coverage.indexedTotal.toLocaleString()} Tools indexed · refreshed {directoryDate(new Date(coverage.completedAt).toISOString())}. {coverage.sourceChangedDuringScan ? 'The upstream directory changed during this refresh; counts reflect the Tools observed.' : 'Prices and service details can change after this refresh.'}</p>}
          </>}
          </section>
        </div>}
        </TabsContent>)}
      </Tabs>
      {comparison.length === 0 ? null : <div className="sticky bottom-5 z-20 mx-auto mt-6 flex w-fit max-w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-float" aria-label="Selected comparison">
        <span className="text-sm">{comparison.length} of 4 selected</span>
        <Button ref={compareTrigger} onClick={() => setCompareOpen(true)} disabled={comparison.length < 2}>Compare Tools</Button>
        <Button size="icon-sm" variant="ghost" onClick={() => setComparison([])} aria-label="Clear comparison"><XIcon /></Button>
      </div>}
      <DirectoryComparison entries={comparison.map(item => item.entry)} open={compareOpen} onOpenChange={setCompareOpen} onCloseAutoFocus={event => {
        event.preventDefault()
        compareTrigger.current?.focus()
      }} returnTo={returnTo} />
    </div>
  )
}

export function X402DirectoryCards({ entries }: Readonly<{ entries: readonly X402DirectoryEntry[] }>) {
  return <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{entries.map((entry, index) => <li key={`${entry.resource}:${index}`} className="min-w-0"><DirectoryToolCard entry={entry} /></li>)}</ul>
}
