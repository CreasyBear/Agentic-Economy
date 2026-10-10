'use client'

import { useEffect, useState } from 'react'
import { recordProductJourney } from '@/lib/observability/product-journey'
import {
  Activity,
  CheckCircle2,
  CircleHelp,
  Compass,
  CreditCard,
  Key,
  MessageSquare,
  Settings,
  WalletCards,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { APP_NAVIGATION, type AppDestinationId } from '@/lib/navigation/app-navigation'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import { formatExactAmount, parseDecimalExactAmount } from '@/modules/money/public'
import {
  TOOL_SEARCH_RESULT_LIMIT,
  searchMarketTools,
  type MarketToolSearchInput,
  type ToolChoiceSearchResult,
} from '../market-tools-client'
import { isExhaustiveMarketNoMatch } from '@/modules/market-demand/market-demand.functions'

import {
  type CommandNavigationItem,
  TOOLS_SEARCH_DEBOUNCE_MS,
  type MarketToolSearchStatus,
  type ToolSearchResultRowModel,
  type ToolSearchContinuation,
} from './tools-search-page.contracts'

type CatalogSearchItem = Extract<ToolChoiceSearchResult, { kind: 'match' }>['results'][number]
const navigationIcons: Readonly<Record<AppDestinationId, LucideIcon>> = {
  market: Compass,
  chat: MessageSquare,
  agents: Key,
  calls: Activity,
  credit: CreditCard,
  tools: Wrench,
  earnings: WalletCards,
  settings: Settings,
  support: CircleHelp,
  status: CheckCircle2,
}

const navigationItems: readonly CommandNavigationItem[] = APP_NAVIGATION.map((destination) => ({
  href: `${destination.to}${destination.hash ?? ''}`,
  label: destination.label,
  keywords: destination.keywords,
  icon: navigationIcons[destination.id],
}))

function usdSourcePrice(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const decimal = /^(\d+(?:\.\d+)?) USDC$/u.exec(value)?.[1]
    ?? /^USDC (\d+(?:\.\d+)?)$/u.exec(value)?.[1]
  const amount = decimal === undefined ? undefined : parseDecimalExactAmount('USDC', decimal, 6)
  const formatted = amount === undefined ? undefined : formatExactAmount(amount)
  if (formatted === undefined) return undefined
  const normalized = formatted.includes('.') ? formatted.replace(/0+$/u, '').replace(/\.$/u, '') : formatted
  return `US$${normalized}`
}

function mapCatalogSearchItemToRowModel(item: CatalogSearchItem): ToolSearchResultRowModel {
  const healthLabel = item.access === 'external_listing'
    ? 'External listing, not callable through AE'
    : item.readiness === 'ready'
      ? getStatusPresentation('operational').label
      : item.readiness === 'unavailable'
        ? getStatusPresentation('degraded').label
        : 'Unverified'
  const freshAudPrice = item.price.kind === 'indicative' && item.price.label.startsWith('A$')
    && item.price.validUntil !== undefined && item.price.validUntil > Date.now() ? item.price.label : undefined
  const priceLabel = freshAudPrice ?? usdSourcePrice(item.sourcePrice)
    ?? (item.price.kind === 'indicative' ? usdSourcePrice(item.price.label) : undefined) ?? ''
  return {
    toolRef: item.access === 'ae_callable' ? item.toolRef ?? item.detailRef : item.detailRef,
    title: item.title,
    providerLine: `${item.provider} · ${item.summary}`,
    healthLabel,
    sourceKind: item.access === 'ae_callable' ? 'admitted' : 'directory',
    priceLabel,
  }
}


type UseMarketToolSearchOptions = Readonly<{
  query: string
  searchAttempt: number
  continuation?: ToolSearchContinuation
  searchTools?: (
    input: MarketToolSearchInput,
  ) => Promise<ToolChoiceSearchResult>
}>

export function useMarketToolSearch({
  query,
  searchAttempt,
  continuation,
  searchTools = searchMarketTools,
}: UseMarketToolSearchOptions): Readonly<{
  status: MarketToolSearchStatus
  navigationItems: readonly CommandNavigationItem[]
  saveNeed?: Readonly<{ query: string }>
}> {
  const [status, setStatus] = useState<MarketToolSearchStatus>({ kind: 'idle' })
  const [saveNeed, setSaveNeed] = useState<Readonly<{ query: string }>>()

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === '') {
      setSaveNeed(undefined)
      setStatus({ kind: 'idle' })
      return
    }
    const activePage = continuation?.forQuery === trimmed ? continuation : undefined

    let current = true
    setSaveNeed(undefined)
    setStatus({ kind: 'loading', query: trimmed })
    const timer = setTimeout(() => {
      void (async () => {
        setStatus({ kind: 'loading', query: trimmed })
        try {
          const searchInput: MarketToolSearchInput = {
            query: activePage?.query ?? trimmed,
            limit: TOOL_SEARCH_RESULT_LIMIT,
            ...(activePage === undefined ? {} : { cursor: activePage.cursor }),
          }
          recordProductJourney({ action: 'search_requested', phase: 'attempted', surface: 'command_search', queryLength: trimmed.length })
          const result = await searchTools(searchInput)
          if (!current) return
          recordProductJourney({ action: 'search_observed', phase: result.kind === 'unavailable' ? 'failed' : 'observed', surface: 'command_search', queryLength: trimmed.length, resultCount: result.kind === 'unavailable' || result.kind === 'noMatch' ? 0 : result.results.length, callableCount: result.kind === 'unavailable' || result.kind === 'noMatch' ? 0 : result.results.filter(r => r.access === 'ae_callable').length })
          const next = result.pagination.hasMore ? result.next.find((action) => action.action === 'registry.tools.search' && action.args.cursor !== undefined) : undefined
          const nextPage = next?.action === 'registry.tools.search' && next.args.cursor !== undefined
            ? { query: next.args.query, cursor: next.args.cursor }
            : undefined
          if (result.kind === 'unavailable') {
            setStatus({
              kind: 'error',
              query: trimmed,
              tone: 'recovery',
              message: 'Tool search is unavailable. Try again.',
            })
            return
          }
          setSaveNeed(
            activePage === undefined && result.query === searchInput.query && isExhaustiveMarketNoMatch(result)
              ? { query: searchInput.query }
              : undefined,
          )
          if (result.kind === 'noMatch') {
            setStatus({
              kind: 'empty',
              query: trimmed,
              count: 0,
              message: isExhaustiveMarketNoMatch(result)
                ? 'No suitable Tools found in the assessed sources. Try different wording.'
                : 'This search has not assessed every source yet. Try different wording or browse the catalogue.',
            })
            return
          }
          if (result.kind === 'scoped' && result.results.length === 0) {
            setStatus({
              kind: 'empty',
              query: trimmed,
              count: 0,
              message: `No suitable Tools in the assessed ${result.assessed.source} ${result.assessed.scope}; more supply may exist. Try different wording or browse the catalogue.`,
              ...(nextPage === undefined ? {} : { nextPage }),
            })
            return
          }
          setStatus({
            kind: 'success',
            query: trimmed,
            count: result.results.length,
            items: result.results.map(mapCatalogSearchItemToRowModel),
            ...(result.kind === 'scoped' ? { scopeLabel: `Assessed ${result.assessed.source} ${result.assessed.scope}; other supply may exist` } : {}),
            ...(nextPage === undefined ? {} : { nextPage }),
          })
        } catch (error) {
          if (!current) return
          recordProductJourney({ action: 'search_observed', phase: 'failed', surface: 'command_search', queryLength: trimmed.length })
          setStatus({
            kind: 'error',
            query: trimmed,
            tone: 'alert',
            message:
              error instanceof Error && error.message === 'catalog_search_result_invalid'
                ? 'The catalog returned something unreadable. Try again.'
                : 'The catalog is temporarily unavailable. Try again.',
          })
        }
      })()
    }, TOOLS_SEARCH_DEBOUNCE_MS)

    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query, searchAttempt, searchTools, continuation])

  return { status, navigationItems, ...(saveNeed === undefined ? {} : { saveNeed }) }
}

export type { MarketToolSearchStatus } from './tools-search-page.contracts'
