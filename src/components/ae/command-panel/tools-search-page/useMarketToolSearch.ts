'use client'

import { useEffect, useState } from 'react'
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
import { formatDisplayPrice } from '@/modules/money/public'
import {
  TOOL_SEARCH_RESULT_LIMIT,
  searchMarketTools,
  type MarketToolSearchInput,
  type ToolChoiceSearchResult,
} from '../market-tools-client'

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

function mapCatalogSearchItemToRowModel(item: CatalogSearchItem): ToolSearchResultRowModel {
  const healthLabel = item.access === 'external_listing'
    ? 'External listing, not callable through AE'
    : item.readiness === 'ready'
      ? getStatusPresentation('operational').label
      : item.readiness === 'unavailable'
        ? getStatusPresentation('degraded').label
        : 'Unverified'
  return {
    toolRef: item.access === 'ae_callable' ? item.toolRef ?? item.detailRef : item.detailRef,
    title: item.title,
    providerLine: `${item.provider} · ${item.summary}`,
    healthLabel,
    sourceKind: item.access === 'ae_callable' ? 'admitted' : 'directory',
    priceLabel: item.price.kind === 'indicative' && item.price.label.startsWith('A$')
      ? item.price.label : formatDisplayPrice({ kind: 'unavailable' }) ?? 'AUD estimate temporarily unavailable',
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
}> {
  const [status, setStatus] = useState<MarketToolSearchStatus>({ kind: 'idle' })

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === '') {
      setStatus({ kind: 'idle' })
      return
    }
    const activePage = continuation?.forQuery === trimmed ? continuation : undefined

    let current = true
    setStatus({ kind: 'loading', query: trimmed })
    const timer = setTimeout(() => {
      void (async () => {
        setStatus({ kind: 'loading', query: trimmed })
        try {
          const result = await searchTools({
            query: activePage?.query ?? trimmed,
            limit: TOOL_SEARCH_RESULT_LIMIT,
            ...(activePage === undefined ? {} : { cursor: activePage.cursor }),
          })
          if (!current) return
          const next = result.next.find((action) => action.action === 'next-page')
          const nextPage = next?.action === 'next-page'
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
          if (result.kind === 'noMatch') {
            setStatus({
              kind: 'empty',
              query: trimmed,
              count: 0,
              message: 'No suitable Tools found in the assessed sources. Try different wording.',
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

  return { status, navigationItems }
}

export type { MarketToolSearchStatus } from './tools-search-page.contracts'
