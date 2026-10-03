import { useAuth } from '@clerk/tanstack-react-start'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, ArrowRightIcon, CompassIcon, HeartIcon, ListFilterIcon, Loader2Icon, MessageSquareIcon, SearchIcon, StoreIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { degrade } from '@/lib/observability/degrade'
import { AeCollectionRail } from '@/components/ae/shared/AeCollectionRail'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/arc/button/button'
import { ProductListing } from '@/components/arc/market/ProductListing'
import './MarketComposition.css'
import buttonStyles from '@/components/arc/button/button.module.css'
import { SearchField } from '@/components/arc/search-field/search-field'
import { Select } from '@/components/arc/select/select'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/Tabs'
import { MARKET_LINK_STATE, type IndexedPaginationState, type MarketReturnSearch } from './market-return-context'
import { MarketNavigationProvider, type MarketPath, useMarketPath } from './market-navigation-context'
import { DirectoryExplorerFilters } from './DirectoryExplorerFilters'
import type { DirectoryExplorerFilterPatch } from '@/modules/market/directory-filters.contracts'
import { DirectoryHero } from './DirectoryHero'
import { DirectoryHomeDiscovery } from './DirectoryHomeDiscovery'
import { DirectoryProviderHeader } from './DirectoryProviderHeader'
import type { X402DirectoryCatalogue, X402DirectoryCatalogueInput, X402DirectoryCatalogueOverview, X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'
import { readX402DirectoryCatalogueServer } from '@/modules/market/x402-directory-index.functions'
import { directoryCatalogueSearchValues } from '@/modules/market/x402-directory-navigation'
import { carryMarketCompare, marketCompareParam, parseMarketCompareRefs, marketHasBrowseOnlyFilters, marketToolSearchInput, marketUsesCanonicalSearch, toggleMarketCompareRef, type MarketCompareEntry, type MarketToolSearchState } from '@/modules/market/market-route-data'
import { directoryDate } from './directory-presentation'
import type { X402MarketplaceHome } from '@/modules/market/x402-marketplace-home'
import { DirectoryComparison } from './DirectoryComparison'
import { DirectoryFilters } from './DirectoryFilters'
import { DirectoryProviderList } from './DirectoryProviderList'
import { useProviderCataloguePages } from './useProviderCataloguePages'
import { DirectorySavedToolsProvider, useDirectorySavedTools } from './DirectorySavedTools'
import { toDirectoryToolCardModel, toSavedDirectoryRowModel, type MarketNeedSaveState } from '@/modules/market/directory-card.view-model'
import { isExhaustiveMarketNoMatch, recordOwnerMarketDemand } from '@/modules/market-demand/market-demand.functions'
import type { SavedDirectoryTool, SavedToolListItem } from '@/modules/market/saved-tools.contracts'
import { DirectoryToolCard } from './DirectoryToolCard'
import { DirectoryToolList } from './DirectoryToolList'
import type { X402DirectoryEntry, X402DirectoryFilters, X402DirectoryInput, X402DirectoryPage } from '@/modules/market/x402-directory'
import { MARKET_COMPARE_MISSING_LABEL, MARKET_COMPARE_PENDING_LABEL } from './compare/compare.contracts'
import { useMarketCompare } from './compare/useMarketCompare'
import { searchMarketToolsServer } from '@/modules/market/market-tool-search.functions'
import type { ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'


type AeX402DirectoryProps = Readonly<{ page: X402DirectoryPage; compareEntries: readonly MarketCompareEntry[]; search: MarketReturnSearch; marketPath?: MarketPath; workspace?: boolean; activeView?: NonNullable<MarketReturnSearch['view']>; pendingView?: NonNullable<MarketReturnSearch['view']>; home?: X402MarketplaceHome; catalogue?: X402DirectoryCatalogue; overview?: X402DirectoryCatalogueOverview; providers?: X402DirectoryProvidersPage; jevRecipient?: string; chatRecipient?: string }>

function indexedPaginationState(indexed: boolean, catalogue: X402DirectoryCatalogue | undefined): IndexedPaginationState {
  return indexed && catalogue?.kind === 'ok'
    ? { source: catalogue, pages: [{ items: catalogue.page.items, cursor: catalogue.indexCursor, isDone: catalogue.isDone }], index: 0, status: 'idle' }
    : { source: catalogue, pages: [], index: 0, status: 'idle' }
}


function useIndexedPagination(indexed: boolean, catalogue: X402DirectoryCatalogue | undefined, filters: X402DirectoryCatalogueInput, requestedPage: number) {
  const [state, setState] = useState(() => indexedPaginationState(indexed, catalogue))
  const [walkTarget, setWalkTarget] = useState(requestedPage)
  const catalogueIdentity = useRef(catalogue)
  useEffect(() => {
    setState(indexedPaginationState(indexed, catalogue))
  }, [catalogue, indexed])
  useEffect(() => {
    if (catalogueIdentity.current !== catalogue) {
      catalogueIdentity.current = catalogue
      setWalkTarget(1)
      return
    }
    setWalkTarget(requestedPage)
  }, [catalogue, requestedPage])
  const current = state.pages[state.index]
  const showPreviousPage = useCallback(() => {
    setState(currentState => currentState.index === 0 || currentState.status === 'loading' ? currentState : { ...currentState, index: currentState.index - 1, status: 'idle' })
  }, [])
  const loadNextPage = useCallback(async () => {
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
  }, [catalogue, current, filters, state])
  useEffect(() => {
    if (!indexed) return
    const target = walkTarget - 1
    if (target < 0 || state.status === 'loading' || target < state.pages.length) return
    if (state.status === 'failed' || state.pages.at(-1)?.isDone === true) return
    void loadNextPage()
  }, [indexed, walkTarget, state.pages, state.status, loadNextPage])
  return {
    state: {
      items: current?.items ?? [],
      isDone: current?.isDone ?? true,
      status: state.status,
      hasPrevious: state.index > 0,
      pageNumber: state.pages.length === 0 ? 0 : state.index + 1,
      loadedCount: state.pages.length,
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
  const current = enabled && state.query === key ? state.pages[state.index] : undefined
  async function nextPage(cursor: string, query: string) {
    if (!enabled || state.status === 'loading' || query !== input.query) return
    if (state.index + 1 < state.pages.length) {
      setState(previous => previous.query === key ? { ...previous, index: previous.index + 1, status: 'idle' } : previous)
      return
    }
    const index = state.index
    setState(previous => previous.query === key && previous.index === index ? { ...previous, status: 'loading' } : previous)
    try {
      const result = await searchMarketToolsServer({ data: { ...input, query, cursor } })
      if (result.kind === 'unavailable') {
        setState(previous => previous.query === key && previous.index === index ? { ...previous, status: 'failed' } : previous)
        return
      }
      setState(previous => previous.query === key && previous.index === index
        ? { query: key, pages: [...previous.pages, result], index: previous.pages.length, status: 'idle' } : previous)
    } catch (cause) {
      degrade(cause, undefined, { site: 'useCanonicalMarketSearch.nextPage', reason: 'source_unavailable' })
      setState(previous => previous.query === key && previous.index === index ? { ...previous, status: 'failed' } : previous)
    }
  }
  async function retry() {
    if (!enabled || state.status === 'loading') return
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

const DIRECTORY_SORT_OPTIONS = [
  { value: 'adoption', label: 'Most used' },
  { value: 'popular', label: 'Busiest' },
  { value: 'active', label: 'Recently paid' },
  { value: 'repeat', label: 'Repeat buyers' },
  { value: 'price_asc', label: 'Cheapest' },
] as const

function directoryInput(search: X402DirectoryInput) {
  return {
    ...(search.query === undefined ? {} : { query: search.query }),
    ...(search.offset === undefined ? {} : { offset: search.offset }),
    ...(search.network === undefined ? {} : { network: search.network }),
    ...(search.provider === undefined ? {} : { provider: search.provider }),
    ...(search.maxUsdPrice === undefined ? {} : { maxUsdPrice: search.maxUsdPrice }),
  }
}

function DirectoryMarketplace({ page, compareEntries, search, workspace = false, activeView, pendingView, home, catalogue, overview, jevRecipient }: AeX402DirectoryProps) {
  const navigate = useNavigate()
  const marketPath = useMarketPath()
  const [compareOpen, setCompareOpen] = useState(false)
  const [draftQuery, setDraftQuery] = useState(search.query ?? '')
  const [queryError, setQueryError] = useState<string>()
  const queryRef = useRef<HTMLInputElement>(null)
  const layout = search.layout ?? 'table'
  useEffect(() => { setDraftQuery(search.query ?? ''); setQueryError(undefined) }, [search.query])
  const compareTrigger = useRef<HTMLButtonElement>(null)
  const saved = useDirectorySavedTools()
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const [needSave, setNeedSave] = useState<MarketNeedSaveState>()
  const view = activeView ?? search.view ?? (home === undefined ? 'tools' : 'discover')
  const displayView = pendingView ?? view
  const { query, offset, network, provider, maxUsdPrice } = search
  const canonicalSearchEnabled = marketUsesCanonicalSearch(search) && (view === 'tools' || view === 'providers')
  const canonicalSearch = useCanonicalMarketSearch(search, canonicalSearchEnabled)
  const sourceInput = useMemo(() => directoryInput({ query, offset, network, provider, maxUsdPrice }), [query, offset, network, provider, maxUsdPrice])
  const coverage = catalogue?.kind === 'ok' ? catalogue.coverage : overview?.kind === 'ok' ? overview.coverage : undefined
  const indexed = catalogue?.kind === 'ok' && catalogue.source === 'index'
  const filterValues = directoryCatalogueSearchValues(search)
  const browse = !Object.entries(filterValues).some(([key, value]) => !['sort', 'indexCursor', 'offset'].includes(key) && value !== undefined && value !== false)
  // The page number is shareable. The index cursor stays out of the URL, and a
  // refresh walks forward from the first page until that number or the list ends.
  const requestedPage = search.page ?? 1
  const { state: loadMore, loadNextPage, showPreviousPage } = useIndexedPagination(indexed, catalogue, filterValues, view === 'tools' ? requestedPage : 1)
  const providerPages = useProviderCataloguePages(indexed && view === 'providers', catalogue, filterValues, requestedPage)
  const publishedPage = useRef('')
  const urlPage = search.page ?? 1
  const visiblePageNumber = view === 'providers' ? providerPages.pageNumber : loadMore.pageNumber
  const visiblePageStatus = view === 'providers' ? providerPages.status : loadMore.status
  const visiblePageDone = view === 'providers' ? providerPages.isDone : loadMore.isDone
  useEffect(() => {
    if (pendingView !== undefined || !indexed || (view !== 'tools' && view !== 'providers')) return
    if (visiblePageStatus === 'loading' || visiblePageNumber < 1 || visiblePageNumber === urlPage) return
    if (visiblePageNumber < urlPage && !visiblePageDone) return
    const signature = `${view}:${visiblePageNumber}`
    if (publishedPage.current === signature) return
    publishedPage.current = signature
    const { indexCursor: _cursor, offset: _offset, ...filters } = filterValues
    void navigate({
      to: marketPath,
      resetScroll: false,
      search: carryMarketCompare(search, { ...filters, view, ...(visiblePageNumber > 1 ? { page: visiblePageNumber } : {}) }),
    })
  }, [filterValues, indexed, marketPath, navigate, pendingView, search, urlPage, view, visiblePageDone, visiblePageNumber, visiblePageStatus])
  const comparisonPool = useMemo(() => [
    ...loadMore.items,
    ...(page.kind === 'ok' ? page.items : []),
    ...(overview?.kind === 'ok' ? overview.popular.map(item => item.entry) : []),
  ], [loadMore.items, overview, page])
  const { refs: compareRefs, selections: comparison, availableEntries: comparisonEntries } = useMarketCompare({ compare: search.compare, resolvedEntries: compareEntries, loadedEntries: comparisonPool })
  const inputForNeed = marketToolSearchInput(search)
  const noMatchKey = canonicalSearch.result?.kind === 'noMatch'
    ? JSON.stringify({ query: canonicalSearch.result.query, source: 'all', filters: inputForNeed.filters ?? null })
    : undefined
  async function saveMissingNeed() {
    if (!authLoaded || !isSignedIn || !canonicalSearch.result || !isExhaustiveMarketNoMatch(canonicalSearch.result) || noMatchKey === undefined || (needSave?.key === noMatchKey && (needSave.status === 'saving' || needSave.status === 'saved'))) return
    const idempotencyKey = needSave?.key === noMatchKey ? needSave.idempotencyKey : globalThis.crypto.randomUUID()
    setNeedSave({ key: noMatchKey, idempotencyKey, status: 'saving' })
    try {
      const result = await recordOwnerMarketDemand({ data: { query: canonicalSearch.result.query, ...(inputForNeed.filters === undefined ? {} : { filters: inputForNeed.filters }), idempotencyKey } })
      if (result.kind === 'refused') {
        setNeedSave({ key: noMatchKey, idempotencyKey, status: 'idle', error: result.code === 'current_match_exists' ? 'A Tool now matches this need. Search again to see it.' : 'This need could not be saved. Try again.' })
      } else {
        setNeedSave({ key: noMatchKey, idempotencyKey, status: 'saved' })
      }
    } catch (cause) {
      degrade(cause, undefined, { site: 'DirectoryMarketplace.saveMissingNeed', reason: 'source_unavailable' })
      setNeedSave({ key: noMatchKey, idempotencyKey, status: 'idle', error: 'This need could not be saved. Try again.' })
    }
  }
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
  // Read the router's latest search for every activation: rapid selections must
  // accumulate before a loader rerenders, and Collections stays Collections.
  function changeComparison(resource?: string) {
    void navigate({ to: marketPath, resetScroll: false, search: current => {
      const { compare: _compare, ...rest } = current
      const compare = resource === undefined ? undefined
        : marketCompareParam(toggleMarketCompareRef(parseMarketCompareRefs(current.compare) ?? [], resource))
      return { ...rest, view: current.view ?? view, ...(compare === undefined ? {} : { compare }) }
    } })
  }
  function prepareNewChat() {
    const previous = window.sessionStorage.getItem('ae.chat.anonymous.active')
    if (previous !== null) window.sessionStorage.removeItem(`ae.chat.anonymous.${previous}`)
    window.sessionStorage.removeItem('ae.chat.anonymous.active')
  }
  function toggleComparison(item: SavedDirectoryTool) {
    changeComparison(item.entry.resource)
  }
  function saveDirectoryTool(item: SavedDirectoryTool) {
    if (!authLoaded || !isSignedIn) { void navigate({ to: '/sign-in/$', params: { _splat: '' } }); return }
    saved.toggleSavedTool(item)
  }
  function toolGrid(items: readonly SavedToolListItem[]) {
    return <ul className="arc-tool-grid">
      {items.map(item => {
        const model = toSavedDirectoryRowModel(item)
        const key = item.identity.kind === 'ae_callable' ? item.identity.toolRef : item.identity.resource
        const externalEntry = item.detail.kind === 'found' && 'entry' in item.detail ? item.detail.entry : undefined
        return <li key={key} className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-card p-gutter">
          <p className="text-xs text-muted-foreground">{model.provider}</p>
          {model.toolRef !== undefined
            ? <Link to="/tools/$toolRef" params={{ toolRef: model.toolRef }} className="break-words font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring">{model.title}</Link>
            : model.providerHost !== undefined && model.slug !== undefined
              ? <Link to="/tools/$providerHost/$slug" params={{ providerHost: model.providerHost, slug: model.slug }} state={MARKET_LINK_STATE} className="break-words font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring">{model.title}</Link>
              : <p className="break-words font-medium">{model.title}</p>}
          <p className="text-xs text-muted-foreground">{model.access}</p>
          <p className="mt-auto text-sm font-medium tabular-nums">{model.price}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={saved.pending(item.identity)} aria-busy={saved.pending(item.identity)} onClick={() => saved.toggleIdentity(item.identity)}>Remove saved Tool</Button>
            {externalEntry === undefined ? null
              : <Button type="button" variant="ghost" size="sm" onClick={() => toggleComparison({ entry: externalEntry, search: {} })} disabled={comparison.length >= 4 && !comparison.some(other => other.resource === externalEntry.resource)}>{comparison.some(other => other.resource === externalEntry.resource) ? 'Remove comparison' : 'Compare'}</Button>}
          </div>
        </li>
      })}
    </ul>
  }

  const comparisonTray = comparison.length === 0 ? null : (
    <section className="arc-comparison-tray" aria-label="Selected comparison" data-compare-tray="flow">
      <span className="text-sm">{comparison.length} of 4 selected</span>
      {comparison.map(item => <Badge key={item.resource} variant="secondary" className="gap-1.5 text-muted-foreground">
        {item.entry?.title ?? ('missing' in item ? MARKET_COMPARE_MISSING_LABEL : MARKET_COMPARE_PENDING_LABEL)}
        <Button type="button" size="sm" variant="ghost" aria-label={'missing' in item ? 'Remove unavailable Tool from comparison' : item.entry === undefined ? 'Remove pending Tool from comparison' : `Remove ${item.entry.title} from selected comparison`} onClick={() => changeComparison(item.resource)}><XIcon /></Button>
      </Badge>)}
      <Button type="button" ref={compareTrigger} onClick={() => setCompareOpen(true)} disabled={comparisonEntries.length < 2}>Compare Tools</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => changeComparison()} aria-label="Clear comparison"><XIcon /></Button>
    </section>
  )

  function canonicalResults() {
    const result = canonicalSearch.result
    if (canonicalSearch.loading && result === undefined) return <p role="status" className="py-8 text-sm text-muted-foreground">Searching admitted Tools and Coinbase Bazaar…</p>
    if (result === undefined) return <AeEmptyState icon={<SearchIcon />} title="Search is unavailable" description="This search could not complete. Your query is unchanged." action={<Button type="button" variant="secondary" onClick={() => void canonicalSearch.retry()}>Retry search</Button>} />
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
      {isExhaustiveMarketNoMatch(result) ? <div className="flex flex-wrap items-center gap-3">
        {authLoaded && isSignedIn
          ? <Button type="button" variant="secondary" disabled={needSave !== undefined && needSave.key === noMatchKey && (needSave.status === 'saving' || needSave.status === 'saved')} aria-busy={needSave !== undefined && needSave.key === noMatchKey && needSave.status === 'saving'} onClick={() => void saveMissingNeed()}>{needSave !== undefined && needSave.key === noMatchKey && needSave.status === 'saved' ? 'Need saved' : 'Save this need'}</Button>
          : <Link to="/sign-in/$" params={{ _splat: '' }} className={cn(buttonStyles.button, buttonStyles.secondary, buttonStyles.md)}>Sign in to save this need</Link>}
        {needSave !== undefined && needSave.key === noMatchKey && needSave.error ? <p role="alert" className="text-sm text-destructive">{needSave.error}</p> : null}
      </div> : null}
      {result.kind === 'unavailable' ? <p className="text-sm text-muted-foreground">The search could not complete. No recommendation was made.</p> : null}
      {marketHasBrowseOnlyFilters(search) ? <p className="text-sm text-muted-foreground">Price caps, adoption, curation and published-detail filters apply in catalogue browse only; they are not applied to this search.</p> : null}
      {result.results.length === 0 ? null : <ul className="arc-search-results">
        {result.results.map(item => {
          const identity = item.toolRef !== undefined && item.access !== 'external_listing'
            ? { kind: 'ae_callable' as const, toolRef: item.toolRef }
            : { kind: 'external_listing' as const, id: item.id }
          return <li key={item.id} className="arc-search-result">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {item.toolRef !== undefined && item.access !== 'external_listing'
                ? <Link to="/tools/$toolRef" params={{ toolRef: item.toolRef }} state={{ fromMarket: true }} className="font-medium underline-offset-4 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring">{item.title}</Link>
                : <a href={item.detailRef} className="font-medium underline-offset-4 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring">{item.title}</a>}
              <p className="text-sm text-muted-foreground">{item.provider} · {item.summary}</p>
            </div>
            <Badge variant="secondary">{item.access === 'ae_callable' ? `AE-callable · ${item.readiness}` : item.access === 'setup_required' ? 'Connect to call' : item.access === 'unavailable' ? 'Currently unavailable · inspect' : 'External listing · not AE-callable'}</Badge>
            {authLoaded && isSignedIn
              ? <Button type="button" variant="secondary" size="sm" disabled={saved.status !== 'ready' || saved.pending(identity)} aria-busy={saved.pending(identity)} {...(saved.status === 'failed' ? {} : { 'aria-pressed': saved.isSavedIdentity(identity) })} onClick={() => saved.toggleIdentity(identity)}>{saved.status === 'failed' ? 'Saved status unavailable' : saved.isSavedIdentity(identity) ? 'Remove saved Tool' : 'Save Tool'}</Button>
              : <Link to="/sign-in/$" params={{ _splat: '' }} className={cn(buttonStyles.button, buttonStyles.secondary, buttonStyles.sm)}>Sign in to save</Link>}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {item.price.kind === 'indicative' ? <span>{item.price.label.startsWith('A$') ? `Indicative AUD · ${item.price.label}` : `Provider price · ${item.price.label}`}</span> : null}
            {item.sourcePrice === undefined ? null : <span>Provider-listed source · {item.sourcePrice}</span>}
            <span>{marketSearchFreshness(item)}</span>
          </div>
        </li>})}
      </ul>}
      <nav aria-label="Search pages" className="flex items-center justify-between gap-3 border-t border-border pt-4">
        {canonicalSearch.hasPrevious ? <Button type="button" variant="secondary" onClick={canonicalSearch.previous} disabled={canonicalSearch.loading}><ArrowLeftIcon />Previous page</Button> : <span />}
        <span className="text-sm text-muted-foreground">Page {canonicalSearch.pageNumber}</span>
        {continuation === undefined ? <span /> : <Button type="button" variant="secondary" onClick={() => void canonicalSearch.nextPage(continuation.args.cursor, continuation.args.query)} disabled={canonicalSearch.loading} aria-label={canonicalSearch.failed ? 'Next page. Retry' : 'Next page'}>Next page<ArrowRightIcon /></Button>}
      </nav>
      {canonicalSearch.failed && result !== undefined ? <p role="alert" className="text-sm text-destructive">The next page could not load; this page is unchanged. Try Next page again.</p> : null}
      {retry === undefined ? null : <Button type="button" variant="secondary" onClick={() => void canonicalSearch.retry()} disabled={canonicalSearch.loading}>Retry search</Button>}
      {broaden === undefined ? null : <Button type="button" variant="secondary" onClick={() => go(search.directoryCategory !== undefined || search.provider !== undefined || search.network !== undefined || search.priceBand !== undefined || marketHasBrowseOnlyFilters(search)
        ? { view: 'tools', query: broaden.args.query, sort: 'relevance' }
        : { view: 'tools' })}>{search.directoryCategory !== undefined || search.provider !== undefined || search.network !== undefined || search.priceBand !== undefined || marketHasBrowseOnlyFilters(search) ? 'Broaden search' : 'Browse all Tools'}</Button>}
    </div>
  }

  return (
    <div className="arc-market arc-market-page ae-rail pb-page">
      <DirectoryHero {...(home === undefined ? {} : { home })} compact={workspace || view !== 'discover'} headingLevel={workspace ? 2 : 1}>
        <form aria-label="Search the Tool market" className="arc-market-search-form" onSubmit={event => {
          event.preventDefault()
          const query = draftQuery.trim()
          if (query.length > SEARCH_QUERY_MAX_LENGTH) {
            setQueryError(`Use ${SEARCH_QUERY_MAX_LENGTH} characters or fewer. Shorten your search and try again.`)
            queryRef.current?.focus()
            return
          }
          setQueryError(undefined)
          go({ ...indexedSearch(), view: 'tools', query: query || undefined, sort: query ? 'relevance' : undefined })
        }}>
          <SearchField ref={queryRef} label="Search Tools" value={draftQuery} onValueChange={value => { setDraftQuery(value); setQueryError(undefined) }} placeholder="Weather forecasts, document analysis…" enterKeyHint="search" aria-invalid={queryError !== undefined} aria-describedby={queryError === undefined ? 'market-search-recipient' : 'market-search-error market-search-recipient'} />
          <Button type="submit" variant="secondary">Search<SearchIcon aria-hidden="true" /></Button>
        </form>
        <Link to="/t/new" className={cn(buttonStyles.button, buttonStyles.ghost, buttonStyles.md)} onClick={event => {
          if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) prepareNewChat()
        }}><MessageSquareIcon aria-hidden="true" />Ask an Agent</Link>
      </DirectoryHero>
      {queryError === undefined ? null : <p id="market-search-error" role="alert" className="text-sm text-destructive">{queryError}</p>}
      <p id="market-search-recipient" className="arc-market-search-hint">{search.reviewedProvidersOnly === true ? 'Search matches published listings from reviewed providers.' : jevRecipient === undefined || search.alternativeTo !== undefined ? 'Search assesses Market Tool listings and published candidate descriptions.' : `Search query and candidate Tool text go to ${jevRecipient}.`}</p>
      <Tabs value={displayView} animateContent={false} onValueChange={value => {
        if (value === 'discover' || value === 'tools' || value === 'providers' || value === 'saved') {
          void navigate({ to: marketPath, resetScroll: false, search: carryMarketCompare(search, value === 'saved' || value === 'discover' ? { view: value } : {
            ...indexedSearch(), view: value,
          }) })
        }
      }}>
        <div className="arc-market-navigation grid grid-cols-1 items-center gap-related pb-related sm:grid-cols-[minmax(0,1fr)_auto]">
          <TabsList className="arc-market-tabs" aria-label="Browse the marketplace">
            <TabsTrigger value="discover" className="min-w-0 whitespace-normal px-3 enabled:active:scale-100"><CompassIcon aria-hidden="true" />Collections</TabsTrigger>
            <TabsTrigger value="tools"><ListFilterIcon aria-hidden="true" />Tools</TabsTrigger>
            <TabsTrigger value="providers"><StoreIcon aria-hidden="true" />Providers</TabsTrigger>
            <TabsTrigger value="saved" className="min-w-0 whitespace-normal px-3 enabled:active:scale-100"><HeartIcon aria-hidden="true" />Saved{saved.savedTools.length > 0 ? ` (${saved.savedTools.length})` : ''}</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-related justify-end">
            {count === undefined || pendingView !== undefined || displayView === 'saved' ? null : <p className="text-xs text-muted-foreground" role="status" aria-live="polite">{count}</p>}
            {view === 'saved' || view === 'discover' || indexed ? null : <DirectoryFilters search={search} onApply={applyFilters} />}
          </div>
        </div>
        {pendingView === undefined ? <>
        {saved.status === 'failed' ? <div role="alert" className="flex flex-wrap items-center gap-3 py-3"><p className="text-sm text-destructive">{saved.saveError ?? 'Saved Tools could not be loaded. Save status is unknown.'}</p><Button type="button" variant="secondary" onClick={saved.refresh}>Try again</Button></div> : saved.saveError === undefined ? null : <p role="alert" className="py-3 text-sm text-destructive">{saved.saveError}</p>}
        <TabsContent value="discover" className="pt-7">
          {home === undefined ? <AeEmptyState title="Explore Tools" description="Browse the current directory, or search for a service above." action={<Link to={marketPath} search={carryMarketCompare(search, { view: 'tools' })} className={cn(cn(buttonStyles.button, buttonStyles.secondary, buttonStyles.md))}>See all Tools</Link>} /> : <DirectoryHomeDiscovery home={home} onSave={saveDirectoryTool} isSaved={saved.isSavedTool} saveDisabled={authLoaded && isSignedIn && saved.status !== 'ready'} saveUnknown={authLoaded && isSignedIn && saved.status === 'failed'} onCompare={toggleComparison}
            isComparing={resource => compareRefs.includes(resource)} compareDisabled={resource => compareRefs.length >= 4 && !compareRefs.includes(resource)} />}
          {view === 'discover' ? comparisonTray : null}
        </TabsContent>
        <TabsContent value="saved" className="pt-5">
          <AeCollectionRail
            title="Your saved Tools"
            action={<p className="max-w-xs text-right text-xs text-muted-foreground">Saved to your account · Current details and AUD estimates on each visit</p>}
            className="mb-5"
          />
          {saved.status === 'signed_out'
            ? <AeEmptyState icon={<HeartIcon />} title="Save Tools to your account" description="Sign in to keep Tools across browsers and connected Agents." action={<Link to="/sign-in/$" params={{ _splat: '' }} className={cn(cn(buttonStyles.button, buttonStyles.secondary, buttonStyles.md))}>Sign in</Link>} />
            : saved.status === 'loading' ? <div role="status" aria-label="Loading saved Tools" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(index => <div key={index} className="h-40 rounded-card border border-border bg-card" />)}</div>
              : saved.status === 'failed' ? <AeEmptyState icon={<HeartIcon />} title="Saved Tools could not be loaded" description="Your saved identities are unchanged." action={<Button type="button" variant="secondary" onClick={saved.refresh}>Try again</Button>} />
                : saved.savedTools.length === 0 ? <AeEmptyState icon={<HeartIcon />} title="Keep a few possibilities close" description="Save a Tool from its card, then come back from any connected device." action={<Link to={marketPath} search={carryMarketCompare(search, { view: 'tools' })} className={cn(cn(buttonStyles.button, buttonStyles.secondary, buttonStyles.md))}>Browse Tools</Link>} /> : toolGrid(saved.savedTools)}
          {view === 'saved' ? comparisonTray : null}
        </TabsContent>
        {(['tools', 'providers'] as const).map(tab => {
        // Indexed Tools and Providers show one catalogue page at a time.
        // (An unavailable page never reaches the code below that reads
        // `tabItems`; the `[]` fallback here only satisfies the type.)
        const activePages = tab === 'providers' ? providerPages : loadMore
        const tabItems: readonly X402DirectoryEntry[] = (tab === 'tools' || tab === 'providers') && indexed ? activePages.items : page.kind === 'ok' ? page.items : []
        const railDeck = search.alternativeTo !== undefined ? 'Currently callable AE Tools other than the selected Tool' : search.query !== undefined ? search.reviewedProvidersOnly === true ? 'Published listings from reviewed providers' : 'AE-admitted Tools and Coinbase Bazaar listings' : [
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
          <div className="arc-market-result-controls" role="group" aria-label="Catalogue ordering and display">
            {search.query !== undefined ? <p className="text-sm text-muted-foreground">Search relevance</p> : indexed ? <Select label="Sort results" value={search.sort ?? 'adoption'} options={[...DIRECTORY_SORT_OPTIONS]} onValueChange={value => {
              if (!DIRECTORY_SORT_OPTIONS.some(option => option.value === value)) return
              go({ ...indexedSearch(), view: tab, sort: value })
            }} /> : null}
            {!canonicalSearchEnabled ? <SegmentedControl label="Result layout" options={[{ value: 'table', label: 'Table' }, { value: 'grid', label: 'Grid' }]} value={layout} onValueChange={value => {
              if (value !== 'table' && value !== 'grid') return
              void navigate({ to: marketPath, resetScroll: false, search: current => ({ ...current, layout: value }) })
            }} /> : null}
            {indexed || search.query !== undefined ? <DirectoryExplorerFilters search={search} showQuery={false} {...(overview === undefined ? {} : { overview })} onChange={applyExplorerFilters} onReset={() => explore({})} /> : null}
          </div>
          {search.query === undefined && search.provider !== undefined && page.kind === 'ok' ? <div className="mb-8"><DirectoryProviderHeader provider={search.provider} entries={page.items} /></div> : null}
          <AeCollectionRail
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
              <Link to={marketPath} search={carryMarketCompare(search, { view: tab })} className={cn(cn(buttonStyles.button, buttonStyles.ghost, buttonStyles.sm), 'rounded-full')}>
                <XIcon />Clear search & filters
              </Link>
            ) })}
            className="mb-5"
          />
          {search.query === undefined && (search.network !== undefined || search.maxUsdPrice !== undefined) ? <div className="mb-4 flex flex-wrap gap-2">{search.network === undefined ? null : <Badge variant="secondary">Network: {overview?.kind === 'ok' ? overview.networks.find(item => item.key === search.network)?.label ?? search.network : search.network}</Badge>}{search.maxUsdPrice === undefined ? null : <Badge variant="secondary">Provider-listed price: up to {search.maxUsdPrice} USDC</Badge>}</div> : null}
          {canonicalSearchEnabled ? canonicalResults() : page.kind === 'unavailable' ? <AeEmptyState icon={<SearchIcon />} title={page.reason === 'query_invalid' ? 'Check your search' : 'Catalogue temporarily unavailable'}
            description={page.reason === 'query_invalid' ? 'Use a service description without personal identifiers.' : search.indexCursor !== undefined ? 'This catalogue page could not be loaded. Refresh results to start again with the same search and filters.' : 'The discovery service could not be reached. Try again.'}
            action={<Link to={marketPath} reloadDocument search={carryMarketCompare(search, search.indexCursor === undefined ? search : { ...indexedSearch(), view: tab })} className={cn(cn(buttonStyles.button, buttonStyles.secondary, buttonStyles.md))}>{search.indexCursor === undefined ? "Try again" : "Refresh results"}</Link>} /> : <>
            {search.alternativeTo !== undefined && catalogue?.kind === 'ok' ? <p role="status" className="mb-4 text-sm text-muted-foreground">{activePages.isDone ? 'Current callable alternatives assessed.' : 'Callable alternatives assessed on this page; more results remain to check.'}</p> : null}
            {page.partialResults === true ? <p role="status" className="mb-4 text-sm text-muted-foreground">Coinbase returned its top matches. Refine your search to find more Tools.</p> : null}
            {tabItems.length === 0 ? <AeEmptyState title={search.alternativeTo !== undefined ? activePages.isDone ? 'No other callable Tool in the assessed catalogue' : 'No callable alternative on this page' : indexed && catalogue.kind === 'ok' && !catalogue.isDone ? 'More of the catalogue remains' : 'No matching Tools'} description={search.alternativeTo !== undefined ? activePages.isDone ? 'Try a different capability or broaden the search.' : 'Continue to the next page to assess more Tools.' : indexed && catalogue.kind === 'ok' && !catalogue.isDone ? 'No matches in this portion. Continue to the next page to check the remaining Tools.' : 'Try a different description or broaden your filters.'} /> : tab === 'providers'
              ? <DirectoryProviderList layout={layout} entries={tabItems} onSelect={provider => { void navigate({ to: marketPath, search: carryMarketCompare(search, { ...indexedSearch(), view: 'tools', provider }) }) }} />
              : <DirectoryToolList layout={layout} items={tabItems.map(entry => ({ entry, search: sourceInput }))} onSave={saveDirectoryTool} isSaved={saved.isSavedTool} saveDisabled={authLoaded && isSignedIn && saved.status !== 'ready'} saveUnknown={authLoaded && isSignedIn && saved.status === 'failed'} onCompare={toggleComparison} isComparing={resource => compareRefs.includes(resource)} compareDisabled={resource => compareRefs.length >= 4 && !compareRefs.includes(resource)} />}
            {tab === 'tools' && view === 'tools' ? comparisonTray : null}
            {activePages.status === 'failed' && (tab === 'tools' || tab === 'providers') && indexed ? <p role="alert" className="mt-section text-right text-sm text-muted-foreground">The next page could not be loaded. This page is unchanged.</p> : null}
            <nav aria-label="Catalogue pages" className="mt-section grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-related border-t border-border pt-related">
              {(tab === 'tools' || tab === 'providers') && indexed ? <>
                <span className="justify-self-start">{activePages.hasPrevious ? <Button type="button" variant="secondary" className="h-11 active:scale-100" onClick={() => {
                  const nextPage = activePages.pageNumber - 1
                  if (tab === 'providers') providerPages.showPreviousPage()
                  else showPreviousPage()
                  void navigate({ to: marketPath, resetScroll: false, search: carryMarketCompare(search, { ...indexedSearch(), view: tab, ...(nextPage > 1 ? { page: nextPage } : {}) }) })
                }} disabled={activePages.status === 'loading'}><ArrowLeftIcon />Previous page</Button> : null}</span>
                {activePages.pageNumber > 0 ? <p className="text-sm tabular-nums text-muted-foreground">Page {activePages.pageNumber}</p> : <span />}
                <span className="justify-self-end">{activePages.isDone ? null : <Button type="button" variant="secondary" className="h-11 active:scale-100" onClick={() => { void (tab === 'providers' ? providerPages.loadNextPage() : loadNextPage()) }} disabled={activePages.status === 'loading'} aria-busy={activePages.status === 'loading'} aria-label={activePages.status === 'failed' ? 'Next page. Try again.' : 'Next page'}>
                  {activePages.status === 'loading' ? <Loader2Icon className="animate-spin" /> : null}Next page<ArrowRightIcon />
                </Button>}</span>
              </> : <>
              <span className="justify-self-start">{page.previousOffset === undefined ? null : <Link to={marketPath} search={carryMarketCompare(search, { ...sourceInput, view: tab, offset: page.previousOffset })} className={cn(cn(buttonStyles.button, buttonStyles.secondary, buttonStyles.md), 'h-11 active:scale-100')}><ArrowLeftIcon />Previous page</Link>}</span>
              <span />
              <span className="justify-self-end">{page.nextOffset === undefined ? null : <Link to={marketPath} search={carryMarketCompare(search, { ...sourceInput, view: tab, offset: page.nextOffset })} className={cn(cn(buttonStyles.button, buttonStyles.secondary, buttonStyles.md), 'h-11 active:scale-100')}>Next page<ArrowRightIcon /></Link>}</span>
            </>}
            </nav>
            <p className="mt-4 text-xs text-muted-foreground">Directory: Coinbase Bazaar. Descriptions and payment requirements are published by providers.</p>
            {coverage === undefined ? null : <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{coverage.indexedTotal.toLocaleString()} Tools indexed · refreshed {directoryDate(new Date(coverage.completedAt).toISOString())}. {coverage.sourceChangedDuringScan ? 'The upstream directory changed during this refresh; counts reflect the Tools observed.' : 'Prices and service details can change after this refresh.'}</p>}
          </>}
          </section>
        </div>
        </TabsContent>
        })}
        </> : <TabsContent key={`pending-${pendingView}`} value={pendingView} className="pt-5" aria-busy="true">
          <p role="status" className="py-8 text-sm text-muted-foreground">Loading {pendingView === 'discover' ? 'Collections' : pendingView === 'tools' ? 'Tools' : pendingView === 'providers' ? 'Providers' : 'saved Tools'}…</p>
        </TabsContent>}
      </Tabs>
      <DirectoryComparison entries={comparisonEntries} open={compareOpen} onOpenChange={setCompareOpen} onCloseAutoFocus={event => {
        event.preventDefault()
        compareTrigger.current?.focus()
      }} />
    </div>
  )
}

export function X402DirectoryCards({ entries }: Readonly<{ entries: readonly X402DirectoryEntry[] }>) {
  return <ProductListing>{entries.map(entry => <li key={entry.resource} className="h-full min-w-0"><DirectoryToolCard model={toDirectoryToolCardModel(entry)} entry={entry} /></li>)}</ProductListing>
}
