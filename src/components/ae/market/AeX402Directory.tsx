import { formatCount } from '@/lib/ui/format-time'
import { useAuth } from '@clerk/tanstack-react-start'
import { Await, Link, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { ArrowLeftIcon, ArrowRightIcon, HeartIcon, Loader2Icon, XIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { Alert } from '@/components/arc/alert/alert'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import { AeToolRows, LandingRowsSkeleton } from '@/components/ae/home/AeToolRows'
import type { LandingRow } from '@/components/ae/home/landing.functions'
import { Select } from '@/components/ae/shared/base-ui/select/select'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import { PUBLIC_SURFACE } from '@/content/brand-copy'
import { recordProductJourney } from '@/lib/observability/product-journey'
import { cn } from '@/lib/utils'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'
import type { DirectoryExplorerFilterPatch } from '@/modules/market/directory-filters.contracts'
import { toSavedDirectoryRowModel } from '@/modules/market/directory-card.view-model'
import { isPublicToolRef } from '@/modules/common/tool-ref'
import { carryMarketCompare, marketCompareParam, parseMarketCompareRefs, toggleMarketCompareRef, validateMarketSearch, marketToolSearchInput, marketUsesCanonicalSearch, type MarketCompareEntry, type MarketCanonicalSearchPage } from '@/modules/market/market-route-data'
import type { SavedDirectoryTool, SavedToolListItem, SavedToolSaveInput } from '@/modules/market/saved-tools.contracts'
import type { X402DirectoryEntry, X402DirectoryInput, X402DirectoryPage } from '@/modules/market/x402-directory'
import type { X402DirectoryCatalogue, X402DirectoryCatalogueOverview, X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'
import { directoryProviderKey } from '@/modules/market/x402-directory-index'
import { directoryCatalogueSearchValues } from '@/modules/market/x402-directory-navigation'
import './MarketComposition.css'
import { CanonicalSearchResults } from './CanonicalSearchResults'
import { MARKET_COMPARE_MISSING_LABEL, MARKET_COMPARE_PENDING_LABEL } from './compare/compare.contracts'
import { directoryCompareReference, searchCompareReference } from './compare/market-compare-reference'
import { useMarketCompare } from './compare/useMarketCompare'
import { DirectoryComparison } from './DirectoryComparison'
import { DirectoryDiscoveryFilters } from './DirectoryExplorerFilters'
import { DirectoryProviderHeader } from './DirectoryProviderHeader'
import { DirectoryProvidersIndex } from './DirectoryProvidersIndex'
import { DirectorySavedNeeds } from './DirectorySavedNeeds'
import { DirectorySavedToolsProvider, useDirectorySavedTools } from './DirectorySavedTools'
import { DirectoryToolList } from './DirectoryToolList'
import { directoryDate } from './directory-presentation'
import { MARKET_LINK_STATE, type MarketReturnSearch } from './market-return-context'
import { MarketNavigationProvider, type MarketPath, useMarketPath } from './market-navigation-context'
import { parseMarketSaveIntent } from './market-save-intent'
import { MarketCategoryRow } from './MarketCategoryRow'
import { MarketSearchPill } from './MarketSearchPill'
import { MarketSavedNeedAction } from './MarketSavedNeedAction'
import { useRankedSearch } from './useRankedSearch'

type AeX402DirectoryProps = Readonly<{
  /** Best-match ranking: a deferred loader promise, or an already settled page. */
  canonicalSearch?: MarketCanonicalSearchPage | Promise<MarketCanonicalSearchPage>
  /** Default browse only: the landing's titled rows, deferred so the grid never waits. */
  landingRows?: Promise<readonly LandingRow[]>
  /** The same view is reloading (sort, filters, paging): dim the results in place. */
  loading?: boolean
  page: X402DirectoryPage
  compareEntries: readonly MarketCompareEntry[]
  search: MarketReturnSearch
  marketPath?: MarketPath
  workspace?: boolean
  defaultLayout?: 'table' | 'grid'
  activeView?: NonNullable<MarketReturnSearch['view']>
  pendingView?: NonNullable<MarketReturnSearch['view']>
  catalogue?: X402DirectoryCatalogue
  overview?: X402DirectoryCatalogueOverview
  providers?: X402DirectoryProvidersPage
  jevRecipient?: string
  /** The page link's index cursor had expired, so the loader returned page 1. */
  cursorReset?: boolean
}>
type BrowseView = 'tools' | 'providers' | 'saved'

export function AeX402Directory(props: AeX402DirectoryProps) {
  const marketPath = props.marketPath ?? '/market'
  return <MarketNavigationProvider path={marketPath}><DirectorySavedToolsProvider><DirectoryMarketplace {...props} /></DirectorySavedToolsProvider></MarketNavigationProvider>
}

const DIRECTORY_SORT_OPTIONS = [
  { value: 'adoption', label: 'Popular' },
  { value: 'price_asc', label: 'Cheapest' },
  { value: 'active', label: 'Recently called' },
] as const

/** Placeholder listings stay searchable but never lead: the default browse drops them, search sorts them last. */
const PLACEHOLDER_LISTING = /\b(test|testing|demo|poc|prototype|sandbox|dummy)\b/iu
const isPlaceholder = (entry: X402DirectoryEntry) => [directoryProviderKey(entry.provider), entry.serviceName ?? '', entry.title].some(text => PLACEHOLDER_LISTING.test(text))

/**
 * Default browse only: drop duplicate and placeholder listings, then deal providers round-robin
 * across every band, so hosts alternate down the page and no loaded row is thrown away.
 * Described listings lead each band.
 */
function curateBrowse(items: readonly X402DirectoryEntry[]): readonly X402DirectoryEntry[] {
  const seen = new Set<string>()
  const byProvider = new Map<string, X402DirectoryEntry[]>()
  for (const entry of items) {
    const provider = directoryProviderKey(entry.provider)
    // The same service is often listed on several hosts under one name.
    const identity = `${(entry.serviceName ?? provider).trim().toLowerCase()} ${entry.title.trim().toLowerCase()}`
    if (seen.has(entry.resource) || seen.has(identity)) continue
    seen.add(entry.resource)
    seen.add(identity)
    if (isPlaceholder(entry)) continue
    byProvider.set(provider, [...(byProvider.get(provider) ?? []), entry])
  }
  const described = (entry: X402DirectoryEntry) => entry.description.trim() !== '' || entry.schemaSummary !== undefined || entry.outputSummary !== undefined
  const groups = [...byProvider.values()]
  const bands = Math.max(0, ...groups.map(tools => tools.length))
  const shown: X402DirectoryEntry[] = []
  for (let band = 0; band < bands; band += 1) {
    const dealt = groups.flatMap(tools => tools.slice(band, band + 1))
    shown.push(...dealt.filter(described), ...dealt.filter(entry => !described(entry)))
  }
  return shown
}

/** Keyword results keep their order, with test and demo listings moved to the end of the page. */
function placeholdersLast(items: readonly X402DirectoryEntry[]): readonly X402DirectoryEntry[] {
  return [...items.filter(entry => !isPlaceholder(entry)), ...items.filter(isPlaceholder)]
}

/** Provider prefixes are hostnames: lower case, no scheme, spaces or path. */
const HOST_PREFIX = /^[a-z0-9][a-z0-9.-]*$/u

function directoryInput(search: X402DirectoryInput) {
  return {
    ...(search.query === undefined ? {} : { query: search.query }),
    ...(search.offset === undefined ? {} : { offset: search.offset }),
    ...(search.network === undefined ? {} : { network: search.network }),
    ...(search.provider === undefined ? {} : { provider: search.provider }),
    ...(search.maxUsdPrice === undefined ? {} : { maxUsdPrice: search.maxUsdPrice }),
  }
}

function browseView(view: MarketReturnSearch['view']): BrowseView {
  return view === 'providers' || view === 'saved' ? view : 'tools'
}

function ResultsSkeleton() {
  return <ul className="ae-browse-skeleton" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6, 7].map(index => <li key={index}><div className="ae-browse-skeleton-media" /><Skeleton lines={3} /></li>)}</ul>
}

function DirectoryMarketplace({ canonicalSearch: rankedSource, landingRows, loading = false, page, compareEntries, search, workspace = false, defaultLayout = 'grid', activeView, pendingView, catalogue, overview, providers, jevRecipient, cursorReset = false }: AeX402DirectoryProps) {
  const navigate = useNavigate()
  const router = useRouter()
  const marketPath = useMarketPath()
  const [compareOpen, setCompareOpen] = useState(false)
  const [draftQuery, setDraftQuery] = useState(search.query ?? '')
  const [queryError, setQueryError] = useState<string>()
  const queryRef = useRef<HTMLInputElement>(null)
  const layout = search.layout ?? defaultLayout
  useEffect(() => { setDraftQuery(search.query ?? ''); setQueryError(undefined) }, [search.query])
  const compareTrigger = useRef<HTMLButtonElement>(null)
  const saved = useDirectorySavedTools()
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const view = browseView(activeView ?? search.view)
  const displayView = pendingView === undefined ? view : browseView(pendingView)
  const ranked = useRankedSearch(view === 'tools' && marketUsesCanonicalSearch(search) ? rankedSource : undefined)
  const { query, offset, network, provider, maxUsdPrice } = search
  const sourceInput = useMemo(() => directoryInput({ query, offset, network, provider, maxUsdPrice }), [query, offset, network, provider, maxUsdPrice])
  const coverage = catalogue?.kind === 'ok' ? catalogue.coverage : overview?.kind === 'ok' ? overview.coverage : providers?.kind === 'ok' ? providers.coverage : undefined
  const indexed = catalogue?.kind === 'ok' && catalogue.source === 'index'
  const filterValues = directoryCatalogueSearchValues(search)
  const browse = !Object.entries(filterValues).some(([key, value]) => !['sort', 'indexCursor', 'offset'].includes(key) && value !== undefined && value !== false)

  // Tools pages live in the URL: the index cursor is the page, so a shared or reloaded link renders that page on the server.
  const pageNumber = cursorReset || search.indexCursor === undefined ? 1 : Math.max(2, search.page ?? 2)
  const storedTrail = useRouterState({ select: state => state.location.state.marketCursorTrail })
  const cursorTrail = storedTrail?.length === pageNumber - 1 ? storedTrail : undefined
  const nextCursor = indexed ? catalogue.indexCursor : undefined
  const pageDone = !indexed || catalogue.isDone || nextCursor === undefined
  const loadedItems = useMemo(() => page.kind === 'ok' ? page.items : [], [page])
  const defaultBrowse = indexed && view === 'tools' && search.query === undefined && search.provider === undefined && (search.sort ?? 'adoption') === 'adoption'
  const shownItems = useMemo(() => defaultBrowse ? curateBrowse(loadedItems) : search.query === undefined ? loadedItems : placeholdersLast(loadedItems), [defaultBrowse, loadedItems, search.query])

  const comparisonPool = useMemo(() => [
    ...loadedItems,
    ...(overview?.kind === 'ok' ? overview.popular.map(item => item.entry) : []),
  ], [loadedItems, overview])
  const { refs: compareRefs, selections: comparison, availableEntries: comparisonEntries, availableTools: comparisonTools } = useMarketCompare({ compare: search.compare, resolvedEntries: compareEntries, loadedEntries: comparisonPool })
  const inputForNeed = marketToolSearchInput(search)
  const saveIntent = parseMarketSaveIntent(search.save)
  const signInSearch = { redirect: router.buildLocation({ to: marketPath, search }).href }
  function signInFor(identity: SavedToolSaveInput) {
    return { redirect: router.buildLocation({ to: marketPath, search: { ...search, save: JSON.stringify(identity) } }).href }
  }
  function comparingResource(resource: string) {
    const entry = comparisonPool.find(item => item.resource === resource)
    return compareRefs.includes(entry === undefined ? resource : directoryCompareReference(entry))
  }
  function compareResourceDisabled(resource: string) {
    return compareRefs.length >= 4 && !comparingResource(resource)
  }
  function go(next: Record<string, unknown>) {
    void navigate({ to: marketPath, resetScroll: false, search: carryMarketCompare(search, next) })
  }
  function indexedSearch() {
    const { indexCursor: _cursor, offset: _offset, ...filters } = filterValues
    return { ...filters }
  }
  function viewDestination(value: BrowseView) {
    if (value === 'saved') return carryMarketCompare(search, { view: 'saved' })
    if (value === 'providers') return carryMarketCompare(search, { view: 'providers' })
    return carryMarketCompare(search, view === 'tools' ? indexedSearch() : {})
  }
  function applyExplorerFilters(patch: DirectoryExplorerFilterPatch) {
    // Independent facet writes can arrive before a loader rerenders. Merge
    // against the router's current filters, never the previous render's copy.
    void navigate({ to: marketPath, resetScroll: false, viewTransition: false, search: current => {
      const marketSearch = validateMarketSearch(current)
      const { indexCursor: _cursor, offset: _offset, ...filters } = directoryCatalogueSearchValues(marketSearch)
      const next: Record<string, unknown> = { ...filters, ...patch, ...(marketSearch.view === 'providers' ? { view: 'providers' as const } : {}) }
      for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
      return carryMarketCompare(marketSearch, next)
    } })
  }
  // Read the router's latest search for every activation: rapid selections must accumulate before a loader rerenders.
  function changeComparison(resource?: string) {
    void navigate({ to: marketPath, resetScroll: false, search: current => {
      const marketSearch = validateMarketSearch(current)
      const { compare: _compare, ...rest } = marketSearch
      const compare = resource === undefined ? undefined
        : marketCompareParam(toggleMarketCompareRef(parseMarketCompareRefs(marketSearch.compare) ?? [], resource))
      return { ...rest, ...(compare === undefined ? {} : { compare }) }
    } })
  }
  function toggleComparison(item: SavedDirectoryTool) {
    changeComparison(directoryCompareReference(item.entry))
  }
  function saveDirectoryTool(item: SavedDirectoryTool) {
    if (!authLoaded) return
    if (!isSignedIn) {
      const reference = directoryCompareReference(item.entry)
      const identity: SavedToolSaveInput = reference === item.entry.resource ? { kind: 'external_listing', resource: reference } : { kind: 'ae_callable', toolRef: reference }
      void navigate({ to: '/sign-in/$', params: { _splat: '' }, search: signInFor(identity) }); return
    }
    saved.toggleSavedTool(item)
  }

  // Best-match ranking settles after the keyword grid. Insert it only while the reader has not moved;
  // otherwise offer it, so the grid never jumps under someone who is reading or clicking.
  const rankedResult = ranked.status === 'ready' ? ranked.page.result : undefined
  const rankedMatches = rankedResult !== undefined && rankedResult.kind !== 'unavailable' && rankedResult.kind !== 'noMatch' && rankedResult.results.length > 0 ? rankedResult : undefined
  const rankedPage = rankedMatches !== undefined && ranked.status === 'ready' ? ranked.page : undefined
  const [revealedPage, setRevealedPage] = useState<MarketCanonicalSearchPage>()
  const refreshFailed = rankedPage?.refreshFailed === true
  // A failed refresh carries the same last-good ranking, so it stays revealed rather than collapsing behind a button.
  const revealed = rankedPage !== undefined && (revealedPage === rankedPage || (refreshFailed && revealedPage?.result === rankedPage.result))
  const resultsRef = useRef<HTMLDivElement>(null)
  const jumpToRanked = useRef(false)
  useLayoutEffect(() => {
    if (rankedPage === undefined || revealedPage === rankedPage) return
    const moved = window.scrollY > 0 || resultsRef.current?.contains(document.activeElement) === true
    if (!moved) setRevealedPage(rankedPage)
  }, [rankedPage, revealedPage])
  useEffect(() => {
    if (!revealed || !jumpToRanked.current) return
    jumpToRanked.current = false
    const heading = document.getElementById('market-best-matches')
    heading?.scrollIntoView({ block: 'start' })
    heading?.focus({ preventScroll: true })
  }, [revealed])

  const providerSearch = displayView === 'providers'
  // The landing owns the headline; the browse names what it lists, with the live count when the index reports one.
  const title = displayView === 'saved' ? 'Saved tools'
    : providerSearch ? 'Providers'
    // "See similar tools" excludes the tool it came from and keeps only tools aecon runs; the page says so.
    : search.query !== undefined && search.alternativeTo !== undefined ? `Ready-to-call alternatives for “${search.query}”`
    : search.query !== undefined ? `Tools for “${search.query}”`
    : search.provider !== undefined ? `Tools from ${search.provider}`
    : 'All tools'
  const subtitle = displayView === 'saved' ? 'Tools you saved, with their current prices.'
    : providerSearch ? search.query === undefined ? 'The services behind each tool. Open one to see everything it lists.' : `Providers whose address starts with “${search.query}”.`
    : browse && coverage !== undefined ? `${formatCount(coverage.indexedTotal)} paid APIs, data feeds and services, each priced per call.`
    : 'Each tool is priced per call. Tools marked Ready now run through aecon once you sign in.'

  const viewLinks: readonly { value: BrowseView; label: string }[] = [
    { value: 'tools', label: 'Tools' },
    { value: 'providers', label: 'Providers' },
    { value: 'saved', label: saved.savedTools.length > 0 ? `Saved (${saved.savedTools.length})` : 'Saved' },
  ]

  function toolGrid(items: readonly SavedToolListItem[]) {
    return <ul className="arc-tool-grid">
      {items.map(item => {
        const model = toSavedDirectoryRowModel(item)
        const key = item.identity.kind === 'ae_callable' ? item.identity.toolRef : item.identity.resource
        return <li key={key} className="ae-browse-saved-card">
          <p className="text-xs text-muted-foreground">{model.provider}</p>
          {model.toolRef !== undefined
            ? <Link to="/tools/$toolRef" params={{ toolRef: model.toolRef }} state={MARKET_LINK_STATE} className="flex min-h-touch items-center break-words font-medium underline-offset-4 hover:underline">{model.title}</Link>
            : model.providerHost !== undefined && model.slug !== undefined
              ? <Link to="/tools/$providerHost/$slug" params={{ providerHost: model.providerHost, slug: model.slug }} state={MARKET_LINK_STATE} className="flex min-h-touch items-center break-words font-medium underline-offset-4 hover:underline">{model.title}</Link>
              : <p className="break-words font-medium">{model.title}</p>}
          <p className="text-xs text-muted-foreground">{model.access}</p>
          <p className="mt-auto text-sm font-medium tabular-nums">{model.price}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={saved.pending(item.identity)} aria-busy={saved.pending(item.identity)} onClick={() => saved.toggleIdentity(item.identity)}>Remove</Button>
            {item.detail.kind !== 'found' ? null : <Button type="button" variant="ghost" size="sm" onClick={() => changeComparison(key)} disabled={compareRefs.length >= 4 && !compareRefs.includes(key)} aria-pressed={compareRefs.includes(key)}>{compareRefs.includes(key) ? 'Remove from compare' : 'Compare'}</Button>}
          </div>
        </li>
      })}
    </ul>
  }

  const comparisonTray = comparison.length === 0 ? null : (
    <section className="arc-comparison-tray" aria-label="Compare tools" data-compare-tray="flow">
      <span className="text-sm">{comparison.length} of 4 selected</span>
      {comparison.map(item => <Badge key={item.resource} tone="neutral" className="gap-1.5 text-muted-foreground">
        {item.tool?.listing.label ?? item.entry?.title ?? ('missing' in item ? MARKET_COMPARE_MISSING_LABEL : MARKET_COMPARE_PENDING_LABEL)}
        <Button type="button" size="sm" variant="ghost" aria-label={'missing' in item ? 'Remove unavailable tool from comparison' : item.tool !== undefined ? `Remove ${item.tool.listing.label} from comparison` : item.entry === undefined ? 'Remove pending tool from comparison' : `Remove ${item.entry.title} from comparison`} onClick={() => changeComparison(item.resource)}><XIcon /></Button>
      </Badge>)}
      <Button type="button" variant="primary" ref={compareTrigger} onClick={() => setCompareOpen(true)} disabled={comparisonEntries.length + comparisonTools.length < 2}>Compare tools</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => changeComparison()} aria-label="Clear comparison"><XIcon /></Button>
    </section>
  )

  /** One fixed-height slot in the heading row, so ranking never moves the grid. A failed ranking says nothing. */
  function rankingStatus() {
    if (ranked.status === 'pending') return <p role="status" className="ae-browse-status"><Loader2Icon className="ae-browse-spin" aria-hidden="true" />Finding best matches</p>
    if (rankedMatches !== undefined) return revealed
      ? <p role="status" className="ae-browse-status">Best matches first</p>
      : <div className="ae-browse-status"><Button type="button" variant="secondary" size="sm" onClick={() => { jumpToRanked.current = true; setRevealedPage(rankedPage) }}>Show {rankedMatches.results.length} best matches</Button></div>
    return <div className="ae-browse-status" />
  }

  function rankedSection() {
    if (!revealed || rankedMatches === undefined) return null
    const result = rankedMatches
    return <section className="ae-browse-section" aria-labelledby="market-best-matches">
      <header className="ae-browse-section-head">
        <h2 id="market-best-matches" tabIndex={-1}>Best matches</h2>
        <p>{result.kind === 'scoped' ? result.reason : `Ranked for “${result.query}” across ${formatCount(result.assessed.examined)} tools.`}</p>
        {refreshFailed ? <p role="status" className="ae-browse-status">
          Best matches couldn’t refresh, so these are the last ones that loaded.
          <Button type="button" variant="secondary" size="sm" onClick={() => void router.invalidate()}>Try again</Button>
        </p> : null}
      </header>
      <CanonicalSearchResults layout={layout} results={result.results} renderActions={item => {
        const identity = isPublicToolRef(item.toolRef)
          ? { kind: 'ae_callable' as const, toolRef: item.toolRef }
          : { kind: 'external_listing' as const, id: item.id }
        const compareRef = searchCompareReference(item)
        return <>
          {authLoaded && isSignedIn
            ? <Button type="button" variant="secondary" size="sm" disabled={saved.status !== 'ready' || saved.pending(identity)} aria-busy={saved.pending(identity)} {...(saved.status === 'failed' ? {} : { 'aria-pressed': saved.isSavedIdentity(identity) })} onClick={() => saved.toggleIdentity(identity)}>{saved.status === 'failed' ? 'Saved status unavailable' : saved.isSavedIdentity(identity) ? 'Saved' : 'Save'}</Button>
            : <Link to="/sign-in/$" params={{ _splat: '' }} search={signInFor(identity)} className={cn(actionLinkClassName('secondary', 'sm'))}>Sign in to save</Link>}
          <Button type="button" variant="ghost" size="sm" disabled={compareRef === undefined || (compareRefs.length >= 4 && !compareRefs.includes(compareRef))} aria-pressed={compareRef !== undefined && compareRefs.includes(compareRef)} onClick={() => { if (compareRef !== undefined) changeComparison(compareRef) }}>{compareRef !== undefined && compareRefs.includes(compareRef) ? 'Remove from compare' : 'Compare'}</Button>
        </>
      }} />
    </section>
  }

  function footnote() {
    const ranking = displayView === 'tools' && search.query !== undefined && jevRecipient !== undefined && marketUsesCanonicalSearch(search)
    if (coverage === undefined && !ranking) return null
    return <p className="ae-browse-footnote">
      {coverage === undefined ? null : `Listings refreshed ${directoryDate(new Date(coverage.completedAt).toISOString())}. Providers set their own descriptions and prices.`}
      {ranking ? ` Your search is sent to ${jevRecipient} to sort results.` : null}
    </p>
  }

  function toolPagination() {
    if (!indexed) {
      if (page.kind !== 'ok' || (page.previousOffset === undefined && page.nextOffset === undefined)) return null
      return <nav aria-label="Result pages" className="ae-browse-pages">
        <span className="justify-self-start">{page.previousOffset === undefined ? null : <Link to={marketPath} search={carryMarketCompare(search, { ...sourceInput, offset: page.previousOffset })} className={actionLinkClassName('secondary', 'md')}><ArrowLeftIcon />Previous</Link>}</span>
        <span />
        <span className="justify-self-end">{page.nextOffset === undefined ? null : <Link to={marketPath} search={carryMarketCompare(search, { ...sourceInput, offset: page.nextOffset })} className={actionLinkClassName('secondary', 'md')}>Next<ArrowRightIcon /></Link>}</span>
      </nav>
    }
    if (pageNumber === 1 && pageDone) return null
    const previous = pageNumber === 1 ? null
      : cursorTrail === undefined
        ? <Link to={marketPath} search={carryMarketCompare(search, indexedSearch())} className={actionLinkClassName('secondary', 'md')}><ArrowLeftIcon />First page</Link>
        : <Link to={marketPath} search={carryMarketCompare(search, { ...indexedSearch(), ...(pageNumber > 2 ? { indexCursor: cursorTrail[pageNumber - 2], page: pageNumber - 1 } : {}) })} state={{ marketCursorTrail: cursorTrail.slice(0, pageNumber - 2) }} className={actionLinkClassName('secondary', 'md')}><ArrowLeftIcon />Previous</Link>
    return <nav aria-label="Result pages" className="ae-browse-pages">
      <span className="justify-self-start">{previous}</span>
      <p className="text-sm tabular-nums text-muted-foreground">Page {pageNumber}</p>
      <span className="justify-self-end">{pageDone ? null : <Link to={marketPath} search={carryMarketCompare(search, { ...indexedSearch(), indexCursor: nextCursor, page: pageNumber + 1 })} state={{ marketCursorTrail: [...(cursorTrail ?? []), search.indexCursor ?? ''] }} className={actionLinkClassName('secondary', 'md')}>Next<ArrowRightIcon /></Link>}</span>
    </nav>
  }

  function toolResults() {
    if (page.kind === 'unavailable') return <EmptyState role="alert" titleAs="h2" title={page.reason === 'query_invalid' ? 'Check your search' : 'Tools didn’t load'}
      description={page.reason === 'query_invalid' ? 'Describe the job without personal details, such as names or account numbers.' : 'We couldn’t reach the tool index. Try again.'}
      action={<Link to={marketPath} reloadDocument search={carryMarketCompare(search, indexedSearch())} className={actionLinkClassName('secondary', 'md')}>Try again</Link>} />
    const items = shownItems
    const empty = items.length === 0
    const cardControls = { onSave: saveDirectoryTool, isSaved: saved.isSavedTool, saveDisabled: authLoaded && isSignedIn === true && saved.status !== 'ready', saveUnknown: authLoaded && isSignedIn === true && saved.status === 'failed' }
    const rowsLead = landingRows !== undefined && pageNumber === 1
    return <div ref={resultsRef} className="ae-browse-results" data-loading={loading || undefined} aria-busy={loading || undefined}>
      {cursorReset ? <p role="status" className="ae-browse-ranking">That page link has expired, so this is page 1.</p> : null}
      {/* Airbnb's home: titled rows of real listings, each with Show all, then the full grid. */}
      {rowsLead ? <div className="ae-browse-rows"><Await promise={landingRows} fallback={<LandingRowsSkeleton grid={false} />}>{rows => <AeToolRows rows={rows} controls={cardControls} />}</Await></div> : null}
      {rankedSection()}
      {search.query === undefined && search.provider !== undefined ? <div className="mb-8"><DirectoryProviderHeader provider={search.provider} entries={loadedItems} /></div> : null}
      <section className="ae-browse-section" aria-labelledby="market-keyword-results">
        {/* The page heading already says "All tools"; only best matches need a second visible title here. */}
        <h2 id="market-keyword-results" className={revealed && !empty ? 'ae-browse-section-title' : 'sr-only'}>{revealed ? 'All keyword matches' : 'Results'}</h2>
        {page.partialResults === true ? <p role="status" className="ae-browse-ranking">Showing the provider’s top matches. Add a word or two to narrow them.</p> : null}
        {empty ? (!pageDone
          ? <EmptyState title="Nothing on this page" description="More of the index is still to check." action={<Link to={marketPath} search={carryMarketCompare(search, { ...indexedSearch(), indexCursor: nextCursor, page: pageNumber + 1 })} className={actionLinkClassName('secondary', 'md')}>Next page</Link>} />
          : revealed ? null : <EmptyState
            title={search.query === undefined ? 'No tools match these filters' : search.alternativeTo !== undefined ? `No other tool ready to call for “${search.query}”` : `No tools match “${search.query}”`}
            description={search.query === undefined ? 'Remove a filter to see more tools.' : 'Try fewer or different words, or ask us to find a tool for this job.'}
            action={<div className="ae-browse-empty-actions">
              {search.query === undefined ? null : <MarketSavedNeedAction input={{ query: search.query, ...(inputForNeed.filters === undefined ? {} : { filters: inputForNeed.filters }) }} signInSearch={signInSearch} />}
              <Link to={marketPath} search={carryMarketCompare(search, {})} resetScroll={false} className={actionLinkClassName('ghost', 'md')}>Clear search and filters</Link>
            </div>} />)
          : <DirectoryToolList layout={layout} items={items.map(entry => ({ entry, search: sourceInput }))} onSave={saveDirectoryTool} isSaved={saved.isSavedTool} saveDisabled={authLoaded && isSignedIn && saved.status !== 'ready'} saveUnknown={authLoaded && isSignedIn && saved.status === 'failed'} onCompare={toggleComparison} isComparing={comparingResource} compareDisabled={compareResourceDisabled}
            sort={search.sort} {...(indexed && search.query === undefined ? { onSortChange: (sort: 'price_asc') => go({ ...indexedSearch(), sort }) } : {})} />}
      </section>
      {toolPagination()}
      {empty ? null : footnote()}
    </div>
  }

  function providerResults() {
    if (providers === undefined) return <div role="status" aria-label="Loading providers"><ResultsSkeleton /></div>
    return <div className="ae-browse-results" data-loading={loading || undefined} aria-busy={loading || undefined}>
      <DirectoryProvidersIndex result={providers} search={search} />
      {providers.kind === 'ok' && providers.page.length > 0 ? footnote() : null}
    </div>
  }

  function savedResults() {
    return <>
      <DirectorySavedNeeds />
      {saved.status === 'signed_out'
        ? <EmptyState title="Save tools to come back to" description="Sign in to keep a shortlist across devices and agents." action={<Link to="/sign-in/$" params={{ _splat: '' }} search={signInSearch} className={actionLinkClassName('primary', 'md')}>Sign in</Link>} />
        : saved.status === 'loading' ? <div role="status" aria-label="Loading saved tools"><ResultsSkeleton /></div>
          : saved.status === 'failed' ? <EmptyState role="alert" title="Saved tools didn’t load" description="Your saved tools are unchanged." action={<Button type="button" variant="secondary" onClick={saved.refresh}>Try again</Button>} />
            : saved.savedTools.length === 0 ? <EmptyState title="Nothing saved yet" description="Tap the heart on any tool to keep it here." action={<Link to={marketPath} search={carryMarketCompare(search, {})} className={actionLinkClassName('secondary', 'md')}>Browse tools</Link>} /> : toolGrid(saved.savedTools)}
    </>
  }

  const sortValue = DIRECTORY_SORT_OPTIONS.find(option => option.value === search.sort)?.value ?? 'adoption'
  const arrange = pendingView !== undefined || displayView === 'saved' ? null : <div className="ae-browse-arrange" role="group" aria-label="Arrange results">
    {displayView === 'providers' ? null
      : search.query !== undefined ? rankingStatus()
      : indexed ? <div className="ae-browse-sort"><Select label="Sort by" value={sortValue} options={[...DIRECTORY_SORT_OPTIONS]} onValueChange={value => {
        if (!DIRECTORY_SORT_OPTIONS.some(option => option.value === value)) return
        go({ ...indexedSearch(), sort: value })
      }} /></div> : null}
    {/* Phones get the grid only, as Airbnb does. */}
    <div className="ae-browse-layout"><SegmentedControl label="Layout" options={[{ value: 'grid', label: 'Grid' }, { value: 'table', label: 'List' }]} value={layout} onValueChange={value => {
      if (value !== 'table' && value !== 'grid') return
      void navigate({ to: marketPath, resetScroll: false, search: current => ({ ...validateMarketSearch(current), layout: value }) })
    }} /></div>
  </div>

  const Heading = workspace ? 'h2' : 'h1'
  return (
    <div className="arc-market ae-browse ae-rail pb-page">
      <div className="ae-browse-bar" inert={pendingView !== undefined}>
        <MarketSearchPill ref={queryRef} label={providerSearch ? 'Search providers' : PUBLIC_SURFACE.searchLabel} value={draftQuery} onValueChange={value => { setDraftQuery(value); setQueryError(undefined) }}
          field={{
            placeholder: providerSearch ? 'Search providers' : PUBLIC_SURFACE.searchPlaceholder(coverage === undefined ? undefined : formatCount(coverage.indexedTotal)),
            'aria-invalid': queryError !== undefined,
            ...(providerSearch ? { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } : {}),
            ...(queryError === undefined ? {} : { 'aria-describedby': 'market-search-error' }),
          }}
          onSubmit={event => {
          event.preventDefault()
          if (pendingView !== undefined) return
          const next = providerSearch ? draftQuery.trim().toLowerCase() : draftQuery.trim()
          if (next.length > SEARCH_QUERY_MAX_LENGTH) {
            setQueryError(`Use ${SEARCH_QUERY_MAX_LENGTH} characters or fewer.`)
            queryRef.current?.focus()
            return
          }
          if (providerSearch && next !== '' && !HOST_PREFIX.test(next)) {
            setQueryError('Type the start of a provider’s web address, such as api.')
            queryRef.current?.focus()
            return
          }
          setQueryError(undefined)
          if (providerSearch) { go({ view: 'providers', query: next || undefined }); return }
          recordProductJourney({ action: 'search_requested', phase: 'attempted', surface: 'market', queryLength: next.length })
          go({ ...indexedSearch(), query: next || undefined, sort: next ? 'relevance' : undefined })
        }} />
        <nav aria-label="Browse" className="ae-browse-views">
          {/* Every view shares the path, so the router would mark the Tools link current on every view; only the shown view is. */}
          {viewLinks.map(link => <Link key={link.value} to={marketPath} search={viewDestination(link.value)} resetScroll={false} viewTransition={false} activeOptions={{ exact: true }} aria-current={displayView === link.value ? 'page' : undefined}>
            {link.value === 'saved' ? <HeartIcon aria-hidden="true" /> : null}{link.label}
          </Link>)}
        </nav>
      </div>
      {queryError === undefined ? null : <p id="market-search-error" role="alert" className="ae-browse-error">{queryError}</p>}

      {/* Airbnb's composition: categories in one row with Filters at its end. Each category is a search that works today. */}
      {displayView !== 'tools' ? null : <div className="ae-browse-filterbar" inert={pendingView !== undefined}>
        <MarketCategoryRow selected={search.query} linkSearch={next => carryMarketCompare(search, { ...indexedSearch(), query: next, sort: next === undefined ? undefined : 'relevance' })} />
        <DirectoryDiscoveryFilters search={search} {...(overview === undefined ? {} : { overview })} onChange={applyExplorerFilters} onReset={() => go(search.query === undefined ? {} : { query: search.query, sort: 'relevance' })} />
      </div>}

      <header className="ae-browse-head">
        <div className="ae-browse-heading">
          <Heading>{title}</Heading>
          <p>{subtitle}</p>
        </div>
        {arrange}
      </header>

      {saveIntent !== undefined && authLoaded && isSignedIn ? <Alert tone="info" title="Finish saving the tool you picked" className="ae-browse-alert">
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={saved.status !== 'ready' || saved.pending(saveIntent) || saved.isSavedIdentity(saveIntent)} onClick={() => { if (!saved.isSavedIdentity(saveIntent)) saved.toggleIdentity(saveIntent) }}>{saved.isSavedIdentity(saveIntent) ? 'Saved' : 'Save it'}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { void navigate({ to: marketPath, resetScroll: false, search: current => { const { save: _save, ...rest } = validateMarketSearch(current); return rest } }) }}>Dismiss</Button>
        </div>
      </Alert> : null}
      {saved.status === 'failed' && displayView !== 'saved' ? <Alert tone="warning" title="Saved tools didn’t load" className="ae-browse-alert">{saved.saveError ?? 'Hearts may not show what you saved.'}<div><Button type="button" variant="secondary" size="sm" className="mt-3" onClick={saved.refresh}>Try again</Button></div></Alert> : saved.saveError === undefined ? null : <p role="alert" className="ae-browse-error">{saved.saveError}</p>}

      {pendingView !== undefined ? <div role="status" aria-label={`Loading ${displayView === 'saved' ? 'saved tools' : displayView}`}><ResultsSkeleton /></div>
        : displayView === 'saved' ? savedResults() : displayView === 'providers' ? providerResults() : toolResults()}
      {pendingView === undefined ? comparisonTray : null}
      <DirectoryComparison entries={comparisonEntries} tools={comparisonTools} open={compareOpen} onOpenChange={setCompareOpen} onCloseAutoFocus={event => {
        event.preventDefault()
        compareTrigger.current?.focus()
      }} />
    </div>
  )
}
