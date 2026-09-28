import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, ArrowRightIcon, CompassIcon, HeartIcon, ListFilterIcon, Loader2Icon, SearchIcon, StoreIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { degrade } from '@/lib/observability/degrade'
import { AeCollectionRail } from '@/components/ae/shared/AeCollectionRail'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { IndexedPaginationState, MarketReturnSearch } from './market-return-context'
import { MarketNavigationProvider, type MarketPath, useMarketPath } from './market-navigation-context'
import { DirectoryExplorerFilters } from './DirectoryExplorerFilters'
import type { DirectoryExplorerFilterPatch } from '@/modules/market/directory-filters.contracts'
import { DirectoryHero } from './DirectoryHero'
import { DirectoryHomeDiscovery } from './DirectoryHomeDiscovery'
import { DirectoryProviderHeader } from './DirectoryProviderHeader'
import type { X402DirectoryCatalogue, X402DirectoryCatalogueInput, X402DirectoryCatalogueOverview, X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'
import { readX402DirectoryCatalogueServer } from '@/modules/market/x402-directory-index.functions'
import { directoryCatalogueSearchValues } from '@/modules/market/x402-directory-navigation'
import { carryMarketCompare, marketCompareParam, marketHasBrowseOnlyFilters, marketToolSearchInput, toggleMarketCompareRef, type MarketCompareEntry, type MarketToolSearchState } from '@/modules/market/market-route-data'
import { directoryDate } from './directory-presentation'
import type { X402MarketplaceHome } from '@/modules/market/x402-marketplace-home'
import { DirectoryComparison } from './DirectoryComparison'
import { DirectoryFilters } from './DirectoryFilters'
import { DirectoryProviderList } from './DirectoryProviderList'
import { useProviderCataloguePages } from './useProviderCataloguePages'
import { DirectorySavedToolsProvider, useDirectorySavedTools } from './DirectorySavedTools'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { SavedDirectoryTool } from '@/modules/market/saved-tools.contracts'
import { DirectoryToolCard } from './DirectoryToolCard'
import { DirectoryToolList } from './DirectoryToolList'
import type { X402DirectoryEntry, X402DirectoryFilters, X402DirectoryInput, X402DirectoryPage } from '@/modules/market/x402-directory'
import { MARKET_COMPARE_MISSING_LABEL, MARKET_COMPARE_PENDING_LABEL } from './compare/compare.contracts'
import { useMarketCompare } from './compare/useMarketCompare'
import { searchMarketToolsServer } from '@/modules/market/market-tool-search.functions'
import type { ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'


type AeX402DirectoryProps = Readonly<{ page: X402DirectoryPage; compareEntries: readonly MarketCompareEntry[]; search: MarketReturnSearch; marketPath?: MarketPath; workspace?: boolean; activeView?: NonNullable<MarketReturnSearch['view']>; home?: X402MarketplaceHome; catalogue?: X402DirectoryCatalogue; overview?: X402DirectoryCatalogueOverview; providers?: X402DirectoryProvidersPage; jevRecipient?: string; chatRecipient?: string }>

function indexedPaginationState(indexed: boolean, catalogue: X402DirectoryCatalogue | undefined): IndexedPaginationState {
  return indexed && catalogue?.kind === 'ok'
    ? { source: catalogue, pages: [{ items: catalogue.page.items, cursor: catalogue.indexCursor, isDone: catalogue.isDone }], index: 0, status: 'idle' }
    : { source: catalogue, pages: [], index: 0, status: 'idle' }
}


function useIndexedPagination(indexed: boolean, catalogue: X402DirectoryCatalogue | undefined, filters: X402DirectoryCatalogueInput) {
  const [state, setState] = useState(() => indexedPaginationState(indexed, catalogue))
  useEffect(() => {
    setState(indexedPaginationState(indexed, catalogue))
  }, [catalogue, indexed])
  const current = state.pages[state.index]
  function showPreviousPage() {
    setState(currentState => currentState.index === 0 || currentState.status === 'loading' ? currentState : { ...currentState, index: currentState.index - 1, status: 'idle' })
  }
  async function loadNextPage() {
    if (state.status === 'loading') return
    const nextIndex = state.index + 1
    if (nextIndex < state.pages.length) {
      setState(currentState => ({ ...currentState, index: nextIndex, status: 'idle' }))
      return
    }
    const cursor = current?.cursor
    if (cursor === undefined || current?.isDone === true) return
    const source = catalogue
    const index = state.index
    setState(currentState => currentState.source === source && currentState.index === index ? { ...currentState, status: 'loading' } : currentState)
    try {
      const { indexCursor: _cursor, offset: _offset, ...query } = filters
      const result = await readX402DirectoryCatalogueServer({ data: { ...query, indexCursor: cursor } })
      if (result.kind !== 'ok' || result.source !== 'index') {
        setState(currentState => currentState.source === source && currentState.index === index ? { ...currentState, status: 'failed' } : currentState)
        return
      }
      setState(currentState => {
        if (currentState.source !== source || currentState.index !== index) return currentState
        const pages = [...currentState.pages, { items: result.page.items, cursor: result.indexCursor, isDone: result.isDone }]
        return { source, pages, index: pages.length - 1, status: 'idle' }
      })
    } catch (cause) {
      void cause
      setState(currentState => currentState.source === source && currentState.index === index ? { ...currentState, status: 'failed' } : currentState)
    }
  }
  return {
    state: {
      items: current?.items ?? [],
      isDone: current?.isDone ?? true,
      status: state.status,
      hasPrevious: state.index > 0,
      pageNumber: state.pages.length === 0 ? 0 : state.index + 1,
    },
    loadNextPage,
    showPreviousPage,
  }
}

function useCanonicalMarketSearch(search: MarketReturnSearch, enabled: boolean) {
  const { query, directoryCategory, provider, network, priceBand } = search
  const input = useMemo(() => marketToolSearchInput({ query, directoryCategory, provider, network, priceBand }), [query, directoryCategory, provider, network, priceBand])
  const key = JSON.stringify(input)
  const [state, setState] = useState<MarketToolSearchState>({ query: '', pages: [], index: 0, status: 'loading' })
  useEffect(() => {
    if (!enabled || query === undefined) return
    let cancelled = false
    setState({ query: key, pages: [], index: 0, status: 'loading' })
    void searchMarketToolsServer({ data: input }).then(result => {
      if (!cancelled) setState({ query: key, pages: [result], index: 0, status: 'idle' })
    }).catch(cause => {
      if (!cancelled) {
        degrade(cause, undefined, { site: 'useCanonicalMarketSearch.initial', reason: 'source_unavailable' })
        setState({ query: key, pages: [], index: 0, status: 'failed' })
      }
    })
    return () => { cancelled = true }
  }, [enabled, key, query, input])
  const current = state.query === key ? state.pages[state.index] : undefined
  async function nextPage(cursor: string, query: string) {
    if (state.status === 'loading' || query !== input.query) return
    if (state.index + 1 < state.pages.length) {
      setState(previous => previous.query === key ? { ...previous, index: previous.index + 1, status: 'idle' } : previous)
      return
    }
    const index = state.index
    setState(previous => previous.query === key && previous.index === index ? { ...previous, status: 'loading' } : previous)
    try {
      const result = await searchMarketToolsServer({ data: { ...input, query, cursor } })
      setState(previous => previous.query === key && previous.index === index
        ? { query: key, pages: [...previous.pages, result], index: previous.pages.length, status: 'idle' } : previous)
    } catch (cause) {
      degrade(cause, undefined, { site: 'useCanonicalMarketSearch.nextPage', reason: 'source_unavailable' })
      setState(previous => previous.query === key && previous.index === index ? { ...previous, status: 'failed' } : previous)
    }
  }
  async function retry() {
    if (state.status === 'loading') return
    setState({ query: key, pages: [], index: 0, status: 'loading' })
    try {
      const result = await searchMarketToolsServer({ data: input })
      setState(previous => previous.query === key ? { query: key, pages: [result], index: 0, status: 'idle' } : previous)
    } catch (cause) {
      degrade(cause, undefined, { site: 'useCanonicalMarketSearch.retry', reason: 'source_unavailable' })
      setState(previous => previous.query === key ? { query: key, pages: [], index: 0, status: 'failed' } : previous)
    }
  }
  return {
    result: current,
    loading: state.query !== key || state.status === 'loading',
    failed: state.query === key && state.status === 'failed',
    hasPrevious: state.index > 0,
    pageNumber: state.index + 1,
    previous: () => setState(previous => previous.query === key && previous.index > 0 ? { ...previous, index: previous.index - 1, status: 'idle' } : previous),
    nextPage,
    retry,
  }
}

function marketSearchFreshness(result: ToolChoiceSearchOutput['results'][number]): string {
  const freshness = result.freshness
  const source = result.source === 'coinbase' ? 'Coinbase Bazaar index' : 'AE supply projection'
  if (freshness === undefined) return `${source} · freshness unavailable`
  const date = freshness.completedAt === undefined ? 'completion unavailable' : `refreshed ${directoryDate(new Date(freshness.completedAt).toISOString())}`
  return `${source} · ${freshness.state} · ${date}`
}

export function AeX402Directory(props: AeX402DirectoryProps) {
  const marketPath = props.marketPath ?? '/market'
  return <MarketNavigationProvider path={marketPath}><DirectorySavedToolsProvider><DirectoryMarketplace {...props} /></DirectorySavedToolsProvider></MarketNavigationProvider>
}

const CATALOGUE_SORT_LABELS = {
  popular: 'Coinbase Bazaar reported calls · 30 days',
  adoption: 'Coinbase Bazaar reported payers · 30 days',
  price_asc: 'Lowest listed price',
  updated: 'Recently updated',
  relevance: 'Search relevance',
} as const

function catalogueSortLabel(_tab: 'tools' | 'providers', search: MarketReturnSearch): string {
  if (search.query !== undefined) return CATALOGUE_SORT_LABELS.relevance
  const sort = search.sort ?? 'popular'
  switch (sort) {
    case 'popular':
    case 'adoption':
    case 'price_asc':
    case 'updated':
    case 'relevance':
      return CATALOGUE_SORT_LABELS[sort]
    case 'momentum':
      return 'Momentum'
    default: {
      const exhaustive: never = sort
      return exhaustive
    }
  }
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

function DirectoryMarketplace({ page, compareEntries, search, workspace = false, activeView, home, catalogue, overview, jevRecipient, chatRecipient }: AeX402DirectoryProps) {
  const navigate = useNavigate()
  const marketPath = useMarketPath()
  const [compareOpen, setCompareOpen] = useState(false)
  const compareTrigger = useRef<HTMLButtonElement>(null)
  const saved = useDirectorySavedTools()
  const view = activeView ?? search.view ?? (home === undefined ? 'tools' : 'discover')
  const { query, offset, network, provider, maxUsdPrice } = search
  const canonicalSearch = useCanonicalMarketSearch(search, search.alternativeTo === undefined && (view === 'tools' || view === 'providers'))
  const sourceInput = useMemo(() => directoryInput({ query, offset, network, provider, maxUsdPrice }), [query, offset, network, provider, maxUsdPrice])
  const coverage = catalogue?.kind === 'ok' ? catalogue.coverage : overview?.kind === 'ok' ? overview.coverage : undefined
  const indexed = catalogue?.kind === 'ok' && catalogue.source === 'index'
  const filterValues = directoryCatalogueSearchValues(search)
  const browse = !Object.entries(filterValues).some(([key, value]) => !['sort', 'indexCursor', 'offset'].includes(key) && value !== undefined && value !== false)
  // Pages stay in component state. Convex pagination is cursor-based, and that
  // cursor is too large for the market URL, so Previous returns to a page
  // already fetched and Next asks for the following cursor. A new first page
  // from the loader (filter, sort, or query) drops the stack.
  const { state: loadMore, loadNextPage, showPreviousPage } = useIndexedPagination(indexed, catalogue, filterValues)
  const providerPages = useProviderCataloguePages(indexed && view === 'providers', catalogue, filterValues)
  const comparisonPool = useMemo(() => [
    ...loadMore.items,
    ...(page.kind === 'ok' ? page.items : []),
    ...(overview?.kind === 'ok' ? [...overview.popular, ...overview.recentlyUpdated].map(item => item.entry) : []),
  ], [loadMore.items, overview, page])
  const { refs: compareRefs, selections: comparison, availableEntries: comparisonEntries } = useMarketCompare({ compare: search.compare, resolvedEntries: compareEntries, loadedEntries: comparisonPool })
  function go(next: Record<string, unknown>) {
    void navigate({ to: marketPath, resetScroll: false, search: carryMarketCompare(search, next) })
  }
  // A query or filter changes what "the count" means: the catalogue total no
  // longer describes what's on screen, so switch to how many Tools matched.
  // The indexed catalogue already separates the two (coverage total here,
  // "N Tools on this page" in the results header below), so it keeps the
  // catalogue total here rather than a second, differently-scoped count.
  const count = search.query !== undefined
    ? undefined
    : !indexed && !browse
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
    void navigate({ to: marketPath, resetScroll: false, search: carryMarketCompare(search, {
      ...(search.query === undefined ? {} : { query: search.query }),
      view: view === 'providers' ? 'providers' : 'tools',
      ...(search.directoryCategory === undefined ? {} : { directoryCategory: search.directoryCategory }),
      ...(search.sort === undefined ? {} : { sort: search.sort }),
      ...(filters.network === undefined ? {} : { network: filters.network }),
      ...(filters.provider === undefined ? {} : { provider: filters.provider }),
      ...(filters.maxUsdPrice === undefined ? {} : { maxUsdPrice: filters.maxUsdPrice }),
    }) })
  }
  function indexedSearch() {
    const { indexCursor: _cursor, offset: _offset, ...filters } = filterValues
    return { ...filters }
  }
  function explore(filters: X402DirectoryCatalogueInput) {
    void navigate({ to: marketPath, resetScroll: false, search: carryMarketCompare(search, { ...filters, view: view === 'providers' ? 'providers' : 'tools' }) })
  }
  function applyExplorerFilters(patch: DirectoryExplorerFilterPatch) {
    const next = { ...indexedSearch(), ...patch, view: view === 'providers' ? 'providers' as const : 'tools' as const }
    for (const key of Object.keys(next)) if (next[key as keyof typeof next] === undefined) delete next[key as keyof typeof next]
    void navigate({ to: marketPath, resetScroll: false, search: carryMarketCompare(search, next) })
  }
  function toggleComparison(item: SavedDirectoryTool) {
    go({ ...search, compare: marketCompareParam(toggleMarketCompareRef(compareRefs, item.entry.resource)) })
  }
  function toolGrid(items: readonly SavedDirectoryTool[]) {
    return <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map(item => <li key={item.entry.resource} className="h-full min-w-0">
        <DirectoryToolCard model={toDirectoryToolCardModel(item.entry)} onSave={() => saved.toggleSavedTool(item)} saved={saved.isSaved(item.entry.resource)}
          onCompare={() => toggleComparison(item)} comparing={comparison.some(other => other.resource === item.entry.resource)} compareDisabled={comparison.length >= 4 && !comparison.some(other => other.resource === item.entry.resource)} />
      </li>)}
    </ul>
  }

  const comparisonTray = comparison.length === 0 ? null : (
    <section className="mt-8 flex w-fit max-w-full flex-wrap items-center gap-3 rounded-card border border-border bg-card px-4 py-3" aria-label="Selected comparison" data-compare-tray="flow">
      <span className="text-sm">{comparison.length} of 4 selected</span>
      {comparison.map(item => <Badge key={item.resource} variant="outline" className="gap-1.5 text-muted-foreground">
        {item.entry?.title ?? ('missing' in item ? MARKET_COMPARE_MISSING_LABEL : MARKET_COMPARE_PENDING_LABEL)}
        <Button size="icon-xs" variant="ghost" aria-label={'missing' in item ? 'Remove unavailable Tool from comparison' : item.entry === undefined ? 'Remove pending Tool from comparison' : `Remove ${item.entry.title} from selected comparison`} onClick={() => go({ ...search, compare: marketCompareParam(toggleMarketCompareRef(compareRefs, item.resource)) })}><XIcon /></Button>
      </Badge>)}
      <Button ref={compareTrigger} onClick={() => setCompareOpen(true)} disabled={comparisonEntries.length < 2}>Compare Tools</Button>
      <Button size="icon-sm" variant="ghost" onClick={() => go({ ...search, compare: undefined })} aria-label="Clear comparison"><XIcon /></Button>
    </section>
  )

  function canonicalResults() {
    const result = canonicalSearch.result
    if (canonicalSearch.loading && result === undefined) return <p role="status" className="py-8 text-sm text-muted-foreground">Searching admitted Tools and Coinbase Bazaar…</p>
    if (result === undefined) return <AeEmptyState icon={<SearchIcon />} title="Search is unavailable" description="This search could not complete. Your query is unchanged." action={<Button variant="outline" onClick={() => void canonicalSearch.retry()}>Retry search</Button>} />
    const continuation = result.next.find(action => action.action === 'next-page')
    const retry = result.next.find(action => action.action === 'retry')
    const broaden = result.next.find(action => action.action === 'broaden')
    return <div aria-label="Search verdict" className="flex flex-col gap-5" aria-busy={canonicalSearch.loading}>
      <p role="status" className="text-sm text-muted-foreground">
        {result.kind === 'match' ? 'Matching Tools' : result.kind === 'scoped' ? 'Search assessed a limited scope' : result.kind === 'noMatch' ? 'No matching Tool in the assessed catalogue' : 'Search unavailable'}
        {' · '}{result.assessed.examined.toLocaleString()} assessed · {result.assessed.source === 'all' ? 'AE + Coinbase Bazaar' : result.assessed.source === 'current' ? 'AE Tools' : 'Coinbase Bazaar'} · {result.assessed.coverage} coverage
      </p>
      {result.recipient === undefined ? null : <p className="text-xs text-muted-foreground">Search query and candidate Tool text went to {result.recipient.label} ({result.recipient.host}).</p>}
      {result.kind === 'scoped' || result.kind === 'noMatch' ? <p className="text-sm text-muted-foreground">{result.reason}</p> : null}
      {result.kind === 'unavailable' ? <p className="text-sm text-muted-foreground">The search could not complete. No recommendation was made.</p> : null}
      {marketHasBrowseOnlyFilters(search) ? <p className="text-sm text-muted-foreground">Price caps, adoption, curation and published-detail filters apply in catalogue browse only; they are not applied to this search.</p> : null}
      {result.results.length === 0 ? null : <ul className="divide-y divide-border rounded-card border border-border bg-card">
        {result.results.map(item => <li key={item.id} className="flex flex-col gap-2 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {item.toolRef !== undefined && item.access !== 'external_listing'
                ? <Link to="/tools/$toolRef" params={{ toolRef: item.toolRef }} state={{ fromMarket: true }} className="font-medium underline-offset-4 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring">{item.title}</Link>
                : <a href={item.detailRef} className="font-medium underline-offset-4 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring">{item.title}</a>}
              <p className="text-sm text-muted-foreground">{item.provider} · {item.summary}</p>
            </div>
            <Badge variant="outline">{item.access === 'ae_callable' ? `AE-callable · ${item.readiness}` : item.access === 'setup_required' ? 'Connect to call' : item.access === 'unavailable' ? 'Currently unavailable · inspect' : 'External listing · not AE-callable'}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{item.price.kind === 'indicative' ? `Indicative AUD · ${item.price.label}` : 'AUD estimate unavailable'}</span>
            {item.sourcePrice === undefined ? null : <span>Provider-listed source · {item.sourcePrice}</span>}
            <span>{marketSearchFreshness(item)}</span>
          </div>
        </li>)}
      </ul>}
      <nav aria-label="Search pages" className="flex items-center justify-between gap-3 border-t border-border pt-4">
        {canonicalSearch.hasPrevious ? <Button variant="outline" onClick={canonicalSearch.previous} disabled={canonicalSearch.loading}><ArrowLeftIcon />Previous page</Button> : <span />}
        <span className="text-sm text-muted-foreground">Page {canonicalSearch.pageNumber}</span>
        {continuation === undefined ? <span /> : <Button variant="outline" onClick={() => void canonicalSearch.nextPage(continuation.args.cursor, continuation.args.query)} disabled={canonicalSearch.loading} aria-label={canonicalSearch.failed ? 'Next page. Retry' : 'Next page'}>Next page<ArrowRightIcon /></Button>}
      </nav>
      {canonicalSearch.failed && result !== undefined ? <p role="alert" className="text-sm text-destructive">The next page could not load; this page is unchanged. Try Next page again.</p> : null}
      {retry === undefined ? null : <Button variant="outline" onClick={() => void canonicalSearch.retry()} disabled={canonicalSearch.loading}>Retry search</Button>}
      {broaden === undefined ? null : <Button variant="outline" onClick={() => go(search.directoryCategory !== undefined || search.provider !== undefined || search.network !== undefined || search.priceBand !== undefined || marketHasBrowseOnlyFilters(search)
        ? { view: 'tools', query: broaden.args.query, sort: 'relevance' }
        : { view: 'tools' })}>{search.directoryCategory !== undefined || search.provider !== undefined || search.network !== undefined || search.priceBand !== undefined || marketHasBrowseOnlyFilters(search) ? 'Broaden search' : 'Browse all Tools'}</Button>}
    </div>
  }

  return (
    <div className="ae-rail pb-page">
      <DirectoryHero {...(home === undefined ? {} : { home })} compact={workspace || view !== 'discover'} headingLevel={workspace ? 2 : 1} {...(workspace && view === 'tools' ? { compactTitle: 'Explore capabilities.' } : {})}>
        <form action="/t/new" method="get" aria-label="Start a conversation" className="mt-1 flex w-full max-w-2xl gap-2" onSubmit={event => {
          event.preventDefault()
          const q = new FormData(event.currentTarget).get('q')?.toString().trim() ?? ''
          const previous = window.sessionStorage.getItem('ae.chat.anonymous.active')
          if (previous !== null) window.sessionStorage.removeItem(`ae.chat.anonymous.${previous}`)
          window.sessionStorage.removeItem('ae.chat.anonymous.active')
          void navigate({ to: '/t/new', search: q === '' ? {} : { q } })
        }}>
          <InputGroup className="min-h-14 rounded-full bg-card pl-3 shadow-xs">
            <InputGroupAddon><SearchIcon aria-hidden="true" /></InputGroupAddon>
            <label htmlFor="x402-directory-search" className="sr-only">Ask about any tool or service</label>
            <InputGroupInput id="x402-directory-search" type="search" name="q" placeholder="Ask about any tool or service…" />
            <InputGroupAddon align="inline-end">
              <Button type="submit" className="mr-1 rounded-full" aria-label="Start conversation"><ArrowRightIcon aria-hidden="true" /><span className="hidden sm:inline">Ask</span></Button>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">Your question goes to {chatRecipient ?? 'the chat gateway'} to find a Tool. Do not include private data in the question.</p>
      </DirectoryHero>
      <Tabs value={view} onValueChange={value => {
        if (value === 'discover' || value === 'tools' || value === 'providers' || value === 'saved') {
          void navigate({ to: marketPath, resetScroll: false, search: carryMarketCompare(search, value === 'saved' || value === 'discover' ? { view: value } : {
            ...indexedSearch(), view: value,
          }) })
        }
      }}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-related border-b border-border pb-related">
          <TabsList variant="line" className="max-w-full shrink-0 justify-start overflow-x-auto overflow-y-hidden" aria-label="Browse the marketplace">
            <TabsTrigger value="discover" className="px-3 enabled:active:scale-100"><CompassIcon aria-hidden="true" />Collections</TabsTrigger>
            <TabsTrigger value="providers" className="px-3 enabled:active:scale-100"><StoreIcon aria-hidden="true" />Providers</TabsTrigger>
            <TabsTrigger value="tools" className="px-3 enabled:active:scale-100"><ListFilterIcon aria-hidden="true" />Tools</TabsTrigger>
            <TabsTrigger value="saved" className="px-3 enabled:active:scale-100"><HeartIcon aria-hidden="true" />Saved{saved.savedTools.length > 0 ? ` (${saved.savedTools.length})` : ''}</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-related">
            {count === undefined || view === 'saved' ? null : <p className="text-xs text-muted-foreground" role="status" aria-live="polite">{count}</p>}
            {view === 'saved' || view === 'discover' || indexed ? null : <DirectoryFilters search={search} onApply={applyFilters} />}
          </div>
        </div>
        {saved.saveError === undefined ? null : <p role="alert" className="py-3 text-sm text-destructive">{saved.saveError}</p>}
        <TabsContent value="discover" className="pt-7">
          {home === undefined ? <AeEmptyState title="Explore Tools" description="Browse the current directory, or search for a service above." action={<Link to={marketPath} search={carryMarketCompare(search, { view: 'tools' })} className={cn(buttonVariants({ variant: 'outline' }))}>See all Tools</Link>} /> : <DirectoryHomeDiscovery home={home} onSave={saved.toggleSavedTool} isSaved={saved.isSaved} onCompare={toggleComparison}
            isComparing={resource => compareRefs.includes(resource)} compareDisabled={resource => compareRefs.length >= 4 && !compareRefs.includes(resource)} />}
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
          {!saved.hydrated ? <p role="status">Loading saved Tools…</p> : saved.savedTools.length === 0 ? <AeEmptyState icon={<HeartIcon />} title="Keep a few possibilities close" description="Save a Tool from its card, then come back when your agent needs it." action={<Link to={marketPath} search={carryMarketCompare(search, { view: 'tools' })} className={cn(buttonVariants({ variant: 'outline' }))}>Browse Tools</Link>} /> : toolGrid(saved.savedTools)}
          {view === 'saved' ? comparisonTray : null}
        </TabsContent>
        {(['tools', 'providers'] as const).map(tab => {
        // Indexed Tools and Providers show one catalogue page at a time.
        // (An unavailable page never reaches the code below that reads
        // `tabItems`; the `[]` fallback here only satisfies the type.)
        const activePages = tab === 'providers' ? providerPages : loadMore
        const tabItems: readonly X402DirectoryEntry[] = (tab === 'tools' || tab === 'providers') && indexed ? activePages.items : page.kind === 'ok' ? page.items : []
        const railDeck = search.alternativeTo !== undefined ? 'Currently callable AE Tools other than the selected Tool' : search.query !== undefined ? 'AE-admitted Tools and Coinbase Bazaar listings' : [
          page.kind === 'ok' && tabItems.length > 0
            ? tab === 'providers'
              ? `${new Set(tabItems.map(entry => entry.provider)).size.toLocaleString()} Providers on this page`
              : indexed
                ? `${tabItems.length.toLocaleString()} Tools on this page`
                : page.mode === 'search' || !browse
                  ? `${page.items.length} matching Tools`
                  : `Showing ${page.offset + 1}–${page.offset + page.items.length}${page.total === undefined ? '' : ` of ${page.total.toLocaleString()}`}`
            : undefined,
        ].filter((line): line is string => line !== undefined).join(' · ') || undefined
        return <TabsContent key={tab} value={tab} className="pt-5">
          <div className="min-w-0">
          <section className="min-w-0" aria-label="Tool results">
          {indexed || search.query !== undefined ? <div className="sticky top-(--header-height) z-10 mb-related grid h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-related bg-background" role="group" aria-label="Catalogue ordering and display">
            {search.query !== undefined ? <p className="text-sm text-muted-foreground">Search relevance</p> : <Select value={search.sort ?? 'popular'} onValueChange={value => { if (value === 'popular' || value === 'updated' || value === 'relevance' || value === 'adoption' || value === 'price_asc') void navigate({ to: marketPath, search: carryMarketCompare(search, { ...indexedSearch(), view: tab, sort: value }) }) }}>
              <SelectTrigger className="h-11! w-full max-w-64 bg-card transition-[background-color,border-color,box-shadow] duration-fast ease-standard enabled:active:scale-100" aria-label={tab === 'providers' ? 'Sort Providers' : 'Sort Tools'}><span className="line-clamp-1">{catalogueSortLabel(tab, search)}</span></SelectTrigger><SelectContent><SelectGroup><SelectItem value="popular">Coinbase Bazaar reported calls · 30 days</SelectItem><SelectItem value="adoption">Coinbase Bazaar reported payers · 30 days</SelectItem><SelectItem value="price_asc">Lowest listed price</SelectItem><SelectItem value="updated">Recently updated</SelectItem></SelectGroup></SelectContent>
            </Select>}
            <DirectoryExplorerFilters search={search} {...(overview === undefined ? {} : { overview })} {...(jevRecipient === undefined || search.alternativeTo !== undefined ? {} : { jevRecipient })} onChange={applyExplorerFilters} onReset={() => explore({})} />
          </div> : null}
          {search.query === undefined && search.provider !== undefined && page.kind === 'ok' ? <div className="mb-8"><DirectoryProviderHeader provider={search.provider} entries={page.items} /></div> : null}
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
              search.alternativeTo !== undefined
                ? `Callable alternatives for “${search.query}”`
                : search.query !== undefined
                  ? `Results for “${search.query}”`
                : search.provider !== undefined
                  ? 'Tools from this Provider'
                  : tab === 'providers'
                    ? 'Explore Providers'
                    : search.directoryCategory === undefined
                      ? 'Explore the catalogue'
                      : `${search.directoryCategory} Tools`
            }
            {...(railDeck === undefined ? {} : { deck: railDeck })}
            {...(browse ? {} : { action: (
              <Link to={marketPath} search={carryMarketCompare(search, { view: tab })} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'rounded-full')}>
                <XIcon />Clear search & filters
              </Link>
            ) })}
            className="mb-5"
          />
          {search.query === undefined && (search.network !== undefined || search.maxUsdPrice !== undefined) ? <div className="mb-4 flex flex-wrap gap-2">{search.network === undefined ? null : <Badge variant="outline">Network: {overview?.kind === 'ok' ? overview.networks.find(item => item.key === search.network)?.label ?? search.network : search.network}</Badge>}{search.maxUsdPrice === undefined ? null : <Badge variant="outline">Provider-listed price: up to {search.maxUsdPrice} USDC</Badge>}</div> : null}
          {search.query !== undefined && search.alternativeTo === undefined ? canonicalResults() : page.kind === 'unavailable' ? <AeEmptyState icon={<SearchIcon />} title={page.reason === 'query_invalid' ? 'Check your search' : 'Catalogue temporarily unavailable'}
            description={page.reason === 'query_invalid' ? 'Use a service description without personal identifiers.' : search.indexCursor !== undefined ? 'This catalogue page could not be loaded. Refresh results to start again with the same search and filters.' : 'The discovery service could not be reached. Try again.'}
            action={<Link to={marketPath} reloadDocument search={carryMarketCompare(search, search.indexCursor === undefined ? search : { ...indexedSearch(), view: tab })} className={cn(buttonVariants({ variant: 'outline' }))}>{search.indexCursor === undefined ? "Try again" : "Refresh results"}</Link>} /> : <>
            {search.alternativeTo !== undefined && catalogue?.kind === 'ok' ? <p role="status" className="mb-4 text-sm text-muted-foreground">{activePages.isDone ? 'Current callable alternatives assessed.' : 'Callable alternatives assessed on this page; more results remain to check.'}</p> : null}
            {page.partialResults === true ? <p role="status" className="mb-4 text-sm text-muted-foreground">Coinbase returned its top matches. Refine your search to find more Tools.</p> : null}
            {tabItems.length === 0 ? <AeEmptyState title={search.alternativeTo !== undefined ? activePages.isDone ? 'No other callable Tool in the assessed catalogue' : 'No callable alternative on this page' : indexed && catalogue.kind === 'ok' && !catalogue.isDone ? 'More of the catalogue remains' : 'No matching Tools'} description={search.alternativeTo !== undefined ? activePages.isDone ? 'Try a different capability or broaden the search.' : 'Continue to the next page to assess more Tools.' : indexed && catalogue.kind === 'ok' && !catalogue.isDone ? 'No matches in this portion. Continue to the next page to check the remaining Tools.' : 'Try a different description or broaden your filters.'} /> : tab === 'providers'
              ? <DirectoryProviderList entries={tabItems} onSelect={provider => { void navigate({ to: marketPath, search: carryMarketCompare(search, { ...indexedSearch(), view: 'tools', provider }) }) }} />
              : <DirectoryToolList items={tabItems.map(entry => ({ entry, search: sourceInput }))} onSave={saved.toggleSavedTool} isSaved={saved.isSaved} onCompare={toggleComparison} isComparing={resource => compareRefs.includes(resource)} compareDisabled={resource => compareRefs.length >= 4 && !compareRefs.includes(resource)} />}
            {tab === 'tools' && view === 'tools' ? comparisonTray : null}
            {activePages.status === 'failed' && (tab === 'tools' || tab === 'providers') && indexed ? <p role="alert" className="mt-section text-right text-sm text-muted-foreground">The next page could not be loaded. This page is unchanged.</p> : null}
            <nav aria-label="Catalogue pages" className="mt-section grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-related border-t border-border pt-related">
              {(tab === 'tools' || tab === 'providers') && indexed ? <>
                <span className="justify-self-start">{activePages.hasPrevious ? <Button type="button" variant="outline" className="h-11 active:scale-100" onClick={tab === 'providers' ? providerPages.showPreviousPage : showPreviousPage} disabled={activePages.status === 'loading'}><ArrowLeftIcon />Previous page</Button> : null}</span>
                {activePages.pageNumber > 0 ? <p className="text-sm tabular-nums text-muted-foreground">Page {activePages.pageNumber}</p> : <span />}
                <span className="justify-self-end">{activePages.isDone ? null : <Button type="button" variant="outline" className="h-11 active:scale-100" onClick={() => void (tab === 'providers' ? providerPages.loadNextPage() : loadNextPage())} disabled={activePages.status === 'loading'} aria-busy={activePages.status === 'loading'} aria-label={activePages.status === 'failed' ? 'Next page. Try again.' : 'Next page'}>
                  {activePages.status === 'loading' ? <Loader2Icon className="animate-spin" /> : null}Next page<ArrowRightIcon />
                </Button>}</span>
              </> : <>
              <span className="justify-self-start">{page.previousOffset === undefined ? null : <Link to={marketPath} search={carryMarketCompare(search, { ...sourceInput, view: tab, offset: page.previousOffset })} className={cn(buttonVariants({ variant: 'outline' }), 'h-11 active:scale-100')}><ArrowLeftIcon />Previous page</Link>}</span>
              <span />
              <span className="justify-self-end">{page.nextOffset === undefined ? null : <Link to={marketPath} search={carryMarketCompare(search, { ...sourceInput, view: tab, offset: page.nextOffset })} className={cn(buttonVariants({ variant: 'outline' }), 'h-11 active:scale-100')}>Next page<ArrowRightIcon /></Link>}</span>
            </>}
            </nav>
            <p className="mt-4 text-xs text-muted-foreground">Directory: Coinbase Bazaar. Descriptions and payment requirements are published by providers.</p>
            {coverage === undefined ? null : <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{coverage.indexedTotal.toLocaleString()} Tools indexed · refreshed {directoryDate(new Date(coverage.completedAt).toISOString())}. {coverage.sourceChangedDuringScan ? 'The upstream directory changed during this refresh; counts reflect the Tools observed.' : 'Prices and service details can change after this refresh.'}</p>}
          </>}
          </section>
        </div>
        </TabsContent>
        })}
      </Tabs>
      <DirectoryComparison entries={comparisonEntries} open={compareOpen} onOpenChange={setCompareOpen} onCloseAutoFocus={event => {
        event.preventDefault()
        compareTrigger.current?.focus()
      }} />
    </div>
  )
}

export function X402DirectoryCards({ entries }: Readonly<{ entries: readonly X402DirectoryEntry[] }>) {
  return <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{entries.map(entry => <li key={entry.resource} className="h-full min-w-0"><DirectoryToolCard model={toDirectoryToolCardModel(entry)} /></li>)}</ul>
}
