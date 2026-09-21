import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, ArrowRightIcon, CompassIcon, HeartIcon, ListFilterIcon, Loader2Icon, SearchIcon, StoreIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeCollectionRail } from '@/components/ae/shared/AeCollectionRail'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { MarketReturnSearch } from './market-return-context'
import { MarketNavigationProvider, type MarketPath, useMarketPath } from './market-navigation-context'
import { DirectoryExplorerFilters } from './DirectoryExplorerFilters'
import type { DirectoryExplorerFilterPatch } from '@/modules/market/directory-filters.contracts'
import { DirectoryHero } from './DirectoryHero'
import { DirectoryIndexDiscovery } from './DirectoryIndexDiscovery'
import { DirectoryHomeDiscovery } from './DirectoryHomeDiscovery'
import { DirectoryProvidersIndex } from './DirectoryProvidersIndex'
import { DirectoryProviderHeader } from './DirectoryProviderHeader'
import type { X402DirectoryCatalogue, X402DirectoryCatalogueInput, X402DirectoryCatalogueOverview, X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'
import { readX402DirectoryCatalogueServer } from '@/modules/market/x402-directory-index.functions'
import { directoryCatalogueSearchValues } from '@/modules/market/x402-directory-navigation'
import {
  carryMarketCompare,
  marketCompareParam,
  parseMarketCompareRefs,
  toggleMarketCompareRef,
} from '@/modules/market/market-route-data'
import { directoryDate } from './directory-presentation'
import type { X402MarketplaceHome } from '@/modules/market/x402-marketplace-home'
import { DirectoryComparison } from './DirectoryComparison'
import { DirectoryFilters } from './DirectoryFilters'
import { DirectoryProviderCards } from './DirectoryProviderCards'
import { DirectorySavedToolsProvider, useDirectorySavedTools } from './DirectorySavedTools'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { SavedDirectoryTool } from '@/modules/market/saved-tools.contracts'
import { DirectoryToolCard } from './DirectoryToolCard'
import type { X402DirectoryEntry, X402DirectoryFilters, X402DirectoryInput, X402DirectoryPage } from '@/modules/market/x402-directory'

type DirectorySearch = MarketReturnSearch

type AeX402DirectoryProps = Readonly<{ page: X402DirectoryPage; search: DirectorySearch; marketPath?: MarketPath; workspace?: boolean; activeView?: NonNullable<DirectorySearch['view']>; home?: X402MarketplaceHome; catalogue?: X402DirectoryCatalogue; overview?: X402DirectoryCatalogueOverview; providers?: X402DirectoryProvidersPage }>
type IndexedPaginationState = Readonly<{
  source: X402DirectoryCatalogue | undefined
  items: readonly X402DirectoryEntry[]
  cursor: string | undefined
  isDone: boolean
  status: 'idle' | 'loading' | 'failed'
}>

function indexedPaginationState(indexed: boolean, catalogue: X402DirectoryCatalogue | undefined): IndexedPaginationState {
  return indexed && catalogue?.kind === 'ok'
    ? { source: catalogue, items: catalogue.page.items, cursor: catalogue.indexCursor, isDone: catalogue.isDone, status: 'idle' }
    : { source: catalogue, items: [], cursor: undefined, isDone: true, status: 'idle' }
}

function useIndexedPagination(indexed: boolean, catalogue: X402DirectoryCatalogue | undefined, filters: X402DirectoryCatalogueInput) {
  const [state, setState] = useState(() => indexedPaginationState(indexed, catalogue))
  useEffect(() => {
    setState(indexedPaginationState(indexed, catalogue))
  }, [catalogue, indexed])
  async function loadNextPage() {
    if (state.cursor === undefined || state.status === 'loading') return
    const cursor = state.cursor
    const source = catalogue
    setState(current => current.source === source && current.cursor === cursor ? { ...current, status: 'loading' } : current)
    try {
      const { indexCursor: _cursor, offset: _offset, ...query } = filters
      const result = await readX402DirectoryCatalogueServer({ data: { ...query, indexCursor: cursor } })
      if (result.kind !== 'ok' || result.source !== 'index') {
        setState(current => current.source === source && current.cursor === cursor ? { ...current, status: 'failed' } : current)
        return
      }
      setState(current => current.source === source && current.cursor === cursor
        ? { source, items: [...current.items, ...result.page.items], cursor: result.indexCursor, isDone: result.isDone, status: 'idle' }
        : current)
    } catch (cause) {
      void cause;
      setState(current => current.source === source && current.cursor === cursor ? { ...current, status: 'failed' } : current)
    }
  }
  return { state, loadNextPage }
}

export function AeX402Directory(props: AeX402DirectoryProps) {
  const marketPath = props.marketPath ?? '/market'
  return <MarketNavigationProvider path={marketPath}><DirectorySavedToolsProvider><DirectoryMarketplace {...props} /></DirectorySavedToolsProvider></MarketNavigationProvider>
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

function DirectoryMarketplace({ page, search, workspace = false, activeView, home, catalogue, overview, providers }: AeX402DirectoryProps) {
  const navigate = useNavigate()
  const marketPath = useMarketPath()
  const [compareOpen, setCompareOpen] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const compareTrigger = useRef<HTMLButtonElement>(null)
  const saved = useDirectorySavedTools()
  const view = activeView ?? search.view ?? (home === undefined ? 'tools' : 'discover')
  const { query, offset, network, provider, maxUsdPrice } = search
  const sourceInput = useMemo(() => directoryInput({ query, offset, network, provider, maxUsdPrice }), [query, offset, network, provider, maxUsdPrice])
  const coverage = catalogue?.kind === 'ok' ? catalogue.coverage : overview?.kind === 'ok' ? overview.coverage : undefined
  const indexed = catalogue?.kind === 'ok' && catalogue.source === 'index'
  const filterValues = directoryCatalogueSearchValues(search)
  const browse = !Object.entries(filterValues).some(([key, value]) => !['sort', 'indexCursor', 'offset'].includes(key) && value !== undefined && value !== false)
  // "Load more" appends pages in component state instead of putting Convex's
  // cursor in the URL (Convex pagination is cursor-based, so there is no
  // offset URL to link to - this mirrors Convex's own usePaginatedQuery
  // model). Reset whenever the server loader hands back a new first page
  // (a real filter/sort/query navigation), never by this component's own
  // appends.
  const { state: loadMore, loadNextPage } = useIndexedPagination(indexed, catalogue, filterValues)
  const compareRefs = parseMarketCompareRefs(search.compare) ?? []
  const comparisonPool = useMemo(() => [
    ...loadMore.items,
    ...(page.kind === 'ok' ? page.items : []),
    ...(overview?.kind === 'ok' ? [...overview.popular, ...overview.recentlyUpdated].map(item => item.entry) : []),
  ], [loadMore.items, overview, page])
  const comparison = useMemo(() => compareRefs.flatMap(ref => {
    const found = comparisonPool.find(entry => entry.resource === ref)
    return found === undefined ? [] : [{ entry: found, search: sourceInput }]
  }), [compareRefs, comparisonPool, sourceInput])
  function go(next: Record<string, unknown>) {
    void navigate({ to: marketPath, resetScroll: false, search: carryMarketCompare(search, next) })
  }
  // A query or filter changes what "the count" means: the catalogue total no
  // longer describes what's on screen, so switch to how many Tools matched.
  // The indexed catalogue already separates the two (coverage total here,
  // "N Tools on this page" in the results header below), so it keeps the
  // catalogue total here rather than a second, differently-scoped count.
  const count = !indexed && !browse
    ? page.kind === 'ok'
      ? page.total !== undefined
        ? `Showing ${page.total.toLocaleString()} matching Tools`
        : `${page.items.length.toLocaleString()} matching Tools on this page`
      : undefined
    : coverage !== undefined ? `${coverage.indexedTotal.toLocaleString()} Tools in the catalogue` : page.kind === 'ok' && page.total !== undefined ? `${page.total.toLocaleString()} Tools` : undefined

  // Filter changes stay on the current Market route and only narrow the same list the user
  // is already looking at, so they keep the current scroll position instead
  // of resetting to the top the way a real page navigation would.
  function applyFilters(filters: X402DirectoryFilters) {
    void navigate({ to: marketPath, resetScroll: false, search: {
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
    void navigate({ to: marketPath, resetScroll: false, search: { ...filters, view: 'tools' } })
  }
  function applyExplorerFilters(patch: DirectoryExplorerFilterPatch) {
    const next = { ...indexedSearch(), ...patch, view: 'tools' as const }
    for (const key of Object.keys(next)) if (next[key as keyof typeof next] === undefined) delete next[key as keyof typeof next]
    void navigate({ to: marketPath, resetScroll: false, search: carryMarketCompare(search, next) })
  }
  function toggleComparison(item: SavedDirectoryTool) {
    go({ ...search, compare: marketCompareParam(toggleMarketCompareRef(compareRefs, item.entry.resource)) })
  }
  function toolGrid(items: readonly SavedDirectoryTool[]) {
    return <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map(item => <li key={item.entry.resource} className="min-w-0">
        <DirectoryToolCard model={toDirectoryToolCardModel(item.entry)} onSave={() => saved.toggleSavedTool(item)} saved={saved.isSaved(item.entry.resource)}
          onCompare={() => toggleComparison(item)} comparing={comparison.some(other => other.entry.resource === item.entry.resource)} compareDisabled={comparison.length >= 4 && !comparison.some(other => other.entry.resource === item.entry.resource)} />
      </li>)}
    </ul>
  }

  const comparisonTray = comparison.length === 0 ? null : (
    <div className="mt-8 flex w-fit max-w-full items-center gap-3 rounded-card border border-border bg-card px-4 py-3" aria-label="Selected comparison" data-compare-tray="flow">
      <span className="text-sm">{comparison.length} of 4 selected</span>
      <Button ref={compareTrigger} onClick={() => setCompareOpen(true)} disabled={comparison.length < 2}>Compare Tools</Button>
      <Button size="icon-sm" variant="ghost" onClick={() => go({ ...search, compare: undefined })} aria-label="Clear comparison"><XIcon /></Button>
    </div>
  )

  return (
    <div className="ae-rail pb-page">
      <DirectoryHero {...(home === undefined ? {} : { home })} compact={workspace || view !== 'discover'} headingLevel={workspace ? 2 : 1} {...(view === 'tools' ? { compactTitle: 'Explore capabilities.' } : {})}>
        <form action={marketPath} method="get" role="search" className="mt-1 flex w-full max-w-2xl gap-2" onSubmit={event => {
          event.preventDefault()
          const query = new FormData(event.currentTarget).get('query')?.toString().trim() ?? ''
          const { query: _query, sort: _sort, ...filters } = indexedSearch()
          void navigate({ to: marketPath, search: carryMarketCompare(search, {
            ...filters,
            ...(query === '' ? {} : { query }),
            view: 'tools',
          }) })
        }}>
          {search.compare === undefined ? null : <input type="hidden" name="compare" value={search.compare} />}
          <input type="hidden" name="view" value="tools" />
          {search.directoryCategory === undefined ? null : <input type="hidden" name="directoryCategory" value={search.directoryCategory} />}
          {search.network === undefined ? null : <input type="hidden" name="network" value={search.network} />}
          {search.provider === undefined ? null : <input type="hidden" name="provider" value={search.provider} />}
          {search.maxUsdPrice === undefined ? null : <input type="hidden" name="maxUsdPrice" value={search.maxUsdPrice} />}
          <InputGroup className="min-h-14 rounded-full bg-card pl-3 shadow-xs">
            <InputGroupAddon><SearchIcon aria-hidden="true" /></InputGroupAddon>
            <label htmlFor="x402-directory-search" className="sr-only">Search Tools</label>
            <InputGroupInput ref={searchInput} id="x402-directory-search" key={search.query ?? ''} type="search" name="query" placeholder="Describe what you need done…" defaultValue={search.query ?? ''} />
            <InputGroupAddon align="inline-end">
              {search.query === undefined ? null : <InputGroupButton type="button" size="icon-sm" variant="ghost" aria-label="Clear search" onClick={() => {
                if (searchInput.current) searchInput.current.value = ''
                const { query: _query, sort: _sort, ...filters } = indexedSearch()
                void navigate({ to: marketPath, resetScroll: false, search: carryMarketCompare(search, { ...filters, view: 'tools' }) })
              }}><XIcon aria-hidden="true" /></InputGroupButton>}
              <Button type="submit" className="mr-1 rounded-full" aria-label="Search Tools"><SearchIcon aria-hidden="true" /><span className="hidden sm:inline">Search</span></Button>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </DirectoryHero>
      <Tabs value={view} onValueChange={value => {
        if (value === 'discover' || value === 'tools' || value === 'providers' || value === 'saved') {
          void navigate({ to: marketPath, search: carryMarketCompare(search, value === 'saved' || value === 'discover' || value === 'providers' ? { view: value } : {
            ...indexedSearch(), view: value,
          }) })
        }
      }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <TabsList variant="line" className="max-w-full shrink-0 justify-start overflow-x-auto overflow-y-hidden" aria-label="Browse the marketplace">
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
          {overview?.kind === 'ok' ? <DirectoryIndexDiscovery overview={overview} onSave={saved.toggleSavedTool} isSaved={saved.isSaved} onCompare={toggleComparison}
            isComparing={resource => comparison.some(item => item.entry.resource === resource)} compareDisabled={resource => comparison.length >= 4 && !comparison.some(item => item.entry.resource === resource)} /> : null}
          {home === undefined ? <AeEmptyState title="Explore the Tool catalogue" description="Open All Tools to browse the current directory, or search for a service above." action={<Link to={marketPath} search={{ view: 'tools' }} className={cn(buttonVariants({ variant: 'outline' }))}>Browse all Tools</Link>} /> : <DirectoryHomeDiscovery home={home} onSave={saved.toggleSavedTool} isSaved={saved.isSaved} onCompare={toggleComparison}
            isComparing={resource => comparison.some(item => item.entry.resource === resource)} compareDisabled={resource => comparison.length >= 4 && !comparison.some(item => item.entry.resource === resource)} />}
          {view === 'discover' ? comparisonTray : null}
        </TabsContent>
        <TabsContent value="saved" className="pt-5">
          <AeCollectionRail
            kicker="Saved"
            title="Your saved Tools"
            action={
              <p className="max-w-xs text-right text-xs text-muted-foreground">
                {saved.storageState === 'session' ? 'Saved for this session only' : 'Saved on this browser'} · Prices may have changed
              </p>
            }
            className="mb-5"
          />
          {!saved.hydrated ? <p role="status">Loading saved Tools…</p> : saved.savedTools.length === 0 ? <AeEmptyState icon={<HeartIcon />} title="Keep a few possibilities close" description="Save a Tool from its card, then come back when your agent needs it." action={<Link to={marketPath} search={{ view: 'tools' }} className={cn(buttonVariants({ variant: 'outline' }))}>Browse Tools</Link>} /> : toolGrid(saved.savedTools)}
          {view === 'saved' ? comparisonTray : null}
        </TabsContent>
        {(['tools', 'providers'] as const).map(tab => {
        // Only the indexed "tools" tab accumulates via "Load more" - the
        // Providers fallback (no `providers` prop) keeps offset pagination.
        // (An unavailable page never reaches the code below that reads
        // `tabItems`; the `[]` fallback here only satisfies the type.)
        const tabItems: readonly X402DirectoryEntry[] = tab === 'tools' && indexed ? loadMore.items : page.kind === 'ok' ? page.items : []
        const railDeck = [
          indexed && search.query !== undefined ? 'Keyword search across the catalogue' : undefined,
          page.kind === 'ok' && tabItems.length > 0
            ? indexed
              ? `${tabItems.length.toLocaleString()} Tools loaded`
              : page.mode === 'search' || !browse
                ? `${page.items.length} matching Tools`
                : `Showing ${page.offset + 1}–${page.offset + page.items.length}${page.total === undefined ? '' : ` of ${page.total.toLocaleString()}`}`
            : undefined,
        ].filter((line): line is string => line !== undefined).join(' · ') || undefined
        return <TabsContent key={tab} value={tab} className="pt-5">
          {tab === 'providers' && providers !== undefined ? <DirectoryProvidersIndex result={providers} /> : <div className={indexed && tab === 'tools' ? 'grid min-w-0 items-start gap-5 md:grid-cols-[13rem_minmax(0,1fr)] lg:gap-7' : 'min-w-0'}>
          {indexed && tab === 'tools' ? <DirectoryExplorerFilters search={search} {...(overview === undefined ? {} : { overview })} onChange={applyExplorerFilters} onReset={() => explore({})} /> : null}
          <section className="min-w-0" aria-label="Tool results">
          {indexed ? <div className="mb-5 flex flex-wrap items-center justify-between gap-3" aria-label="Catalogue ordering and display">
            <Select value={search.query === undefined ? search.sort ?? 'adoption' : 'relevance'} onValueChange={value => { if (value === 'popular' || value === 'updated' || value === 'relevance' || value === 'adoption' || value === 'price_asc') void navigate({ to: marketPath, search: carryMarketCompare(search, { ...indexedSearch(), view: tab, sort: value }) }) }}>
              <SelectTrigger className="min-h-10 bg-card" aria-label="Sort Tools"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{search.query === undefined ? <><SelectItem value="adoption">Broader adoption · 30 days</SelectItem><SelectItem value="price_asc">Lowest listed price</SelectItem><SelectItem value="updated">Recently updated</SelectItem>{search.sort === 'popular' ? <SelectItem value="popular">Call volume · 30 days</SelectItem> : null}</> : <SelectItem value="relevance">Search relevance</SelectItem>}</SelectGroup></SelectContent>
            </Select>
          </div> : null}
          {search.provider !== undefined && page.kind === 'ok' ? <div className="mb-8"><DirectoryProviderHeader provider={search.provider} entries={page.items} /></div> : null}
          <AeCollectionRail
            kicker={
              search.query !== undefined
                ? 'Search'
                : search.provider !== undefined
                  ? 'Provider'
                  : tab === 'providers'
                    ? 'Providers'
                    : search.directoryCategory === undefined
                      ? 'Catalogue'
                      : 'Category'
            }
            title={
              search.provider !== undefined
                ? 'Tools from this Provider'
                : search.query === undefined
                  ? tab === 'providers'
                    ? 'Explore Providers'
                    : search.directoryCategory === undefined
                      ? 'Explore the catalogue'
                      : `${search.directoryCategory} Tools`
                  : `Results for “${search.query}”`
            }
            {...(railDeck === undefined ? {} : { deck: railDeck })}
            {...(browse ? {} : { action: (
              <Link to={marketPath} search={{ view: tab }} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'rounded-full')}>
                <XIcon />Clear search & filters
              </Link>
            ) })}
            className="mb-5"
          />
          {search.network !== undefined || search.maxUsdPrice !== undefined ? <div className="mb-4 flex flex-wrap gap-2">{search.network === undefined ? null : <Badge variant="outline">Network: {overview?.kind === 'ok' ? overview.networks.find(item => item.key === search.network)?.label ?? search.network : search.network}</Badge>}{search.maxUsdPrice === undefined ? null : <Badge variant="outline">Up to {search.maxUsdPrice} USDC</Badge>}</div> : null}
          {page.kind === 'unavailable' ? <AeEmptyState icon={<SearchIcon />} title={page.reason === 'query_invalid' ? 'Check your search' : 'Catalogue temporarily unavailable'}
            description={page.reason === 'query_invalid' ? 'Use a service description without personal identifiers.' : search.indexCursor !== undefined ? 'This catalogue page could not be loaded. Refresh results to start again with the same search and filters.' : 'The discovery service could not be reached. Try again.'}
            action={<Link to={marketPath} reloadDocument search={search.indexCursor === undefined ? search : { ...indexedSearch(), view: tab }} className={cn(buttonVariants({ variant: 'outline' }))}>{search.indexCursor === undefined ? "Try again" : "Refresh results"}</Link>} /> : <>
            {page.partialResults === true ? <p role="status" className="mb-4 text-sm text-muted-foreground">Coinbase returned its top matches. Refine your search to find more Tools.</p> : null}
            {tabItems.length === 0 ? <AeEmptyState title={indexed && catalogue.kind === 'ok' && !catalogue.isDone ? 'More of the catalogue remains' : 'No matching Tools'} description={indexed && catalogue.kind === 'ok' && !catalogue.isDone ? 'No matches in this portion. Continue to the next page to check the remaining Tools.' : 'Try a different description or broaden your filters.'} /> : tab === 'providers'
              ? <DirectoryProviderCards entries={tabItems} onSelect={provider => { void navigate({ to: marketPath, search: carryMarketCompare(search, { ...sourceInput, provider, offset: 0 }) }) }} />
              : toolGrid(tabItems.map(entry => ({ entry, search: sourceInput })))}
            {tab === 'tools' && view === 'tools' ? comparisonTray : null}
            <nav aria-label="Catalogue pages" className="mt-8 flex justify-between gap-4 border-t border-border pt-5">
              {tab === 'tools' && indexed ? <>
                <span />
                {loadMore.isDone ? null : <div className="flex flex-col items-end gap-2">
                {loadMore.status === 'failed' ? <p role="alert" className="max-w-md text-right text-sm text-muted-foreground">More Tools could not be loaded. Your current results and filters are unchanged.</p> : null}
                <Button type="button" variant="outline" onClick={() => void loadNextPage()} disabled={loadMore.status === 'loading'} aria-busy={loadMore.status === 'loading'} aria-label={loadMore.status === 'failed' ? 'Try loading more again' : 'Load more'}>
                  {loadMore.status === 'loading' ? <Loader2Icon className="animate-spin" /> : null}Load more<ArrowRightIcon />
                </Button></div>}
              </> : <>
              <span>{page.previousOffset === undefined ? null : <Link to={marketPath} search={{ ...sourceInput, view: tab, offset: page.previousOffset }} className={cn(buttonVariants({ variant: 'outline' }))}><ArrowLeftIcon />Previous page</Link>}</span>
              {page.nextOffset === undefined ? null : <Link to={marketPath} search={{ ...sourceInput, view: tab, offset: page.nextOffset }} className={cn(buttonVariants({ variant: 'outline' }))}>Next page<ArrowRightIcon /></Link>}
            </>}
            </nav>
            <p className="mt-4 text-xs text-muted-foreground">Directory: Coinbase Bazaar. Descriptions and payment requirements are published by providers.</p>
            {coverage === undefined ? null : <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{coverage.indexedTotal.toLocaleString()} Tools indexed · refreshed {directoryDate(new Date(coverage.completedAt).toISOString())}. {coverage.sourceChangedDuringScan ? 'The upstream directory changed during this refresh; counts reflect the Tools observed.' : 'Prices and service details can change after this refresh.'}</p>}
          </>}
          </section>
        </div>}
        </TabsContent>
        })}
      </Tabs>
      <DirectoryComparison entries={comparison.map(item => item.entry)} open={compareOpen} onOpenChange={setCompareOpen} onCloseAutoFocus={event => {
        event.preventDefault()
        compareTrigger.current?.focus()
      }} />
    </div>
  )
}

export function X402DirectoryCards({ entries }: Readonly<{ entries: readonly X402DirectoryEntry[] }>) {
  return <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{entries.map(entry => <li key={entry.resource} className="min-w-0"><DirectoryToolCard model={toDirectoryToolCardModel(entry)} /></li>)}</ul>
}
