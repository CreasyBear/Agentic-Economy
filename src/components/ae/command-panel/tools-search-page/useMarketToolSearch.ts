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
} from './tools-search-page.contracts'

type CatalogSearchItem = Extract<ToolChoiceSearchResult, { kind: 'matched' }>['results'][number]
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
  const healthLabel =
    item.readiness === 'ready'
      ? getStatusPresentation('operational').label
      : item.readiness === 'unavailable'
        ? getStatusPresentation('degraded').label
        : 'Unverified'
  return {
    toolRef: item.toolRef,
    title: item.title,
    providerLine: item.details === undefined
      ? item.summary : `${item.details.provider.name} · ${item.details.capabilityId}`,
    healthLabel,
    priceLabel: item.price.label,
  }
}

type UseMarketToolSearchOptions = Readonly<{
  query: string
  searchAttempt: number
  searchTools?: (
    input: MarketToolSearchInput,
  ) => Promise<ToolChoiceSearchResult>
}>

export function useMarketToolSearch({
  query,
  searchAttempt,
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

    let current = true
    setStatus({ kind: 'loading', query: trimmed })
    const timer = setTimeout(() => {
      void (async () => {
        setStatus({ kind: 'loading', query: trimmed })
        try {
          const result = await searchTools({
            query: trimmed,
            limit: TOOL_SEARCH_RESULT_LIMIT,
          })
          if (!current) return
          if (result.kind === 'unavailable') {
            setStatus({
              kind: 'error',
              query: trimmed,
              tone: 'recovery',
              message:
                'This search could not run. Try different wording or browse the current catalogue.',
            })
            return
          }
          if (result.kind === 'noMatch') {
            const nearMisses = result.nearMisses.map((item) => item.title).join(', ')
            setStatus({
              kind: 'empty',
              query: trimmed,
              count: 0,
              message: `${result.scope === 'page' ? 'No suitable Tools on this page' : 'No suitable Tools found'}.${nearMisses.length === 0 ? '' : ` Near misses (not matches): ${nearMisses}.`}`,
            })
            return
          }
          setStatus({
            kind: 'success',
            query: trimmed,
            count: result.results.length,
            items: result.results.map(mapCatalogSearchItemToRowModel),
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
  }, [query, searchAttempt, searchTools])

  return { status, navigationItems }
}

export type { MarketToolSearchStatus } from './tools-search-page.contracts'
