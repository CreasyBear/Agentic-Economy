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
import type { ListingSearchItem } from '@/modules/registry/public'

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
function mapListingToRow(item: ListingSearchItem): ToolSearchResultRowModel {
  const { listing } = item
  const sourceKind = listing.sources[0].kind
  const identity = listing.identity
  const price = listing.facts.price
  const priceLabel = price.kind === 'absent' ? 'Price not provided'
    : price.value.kind === 'quote_required' ? 'Quote required'
      : price.value.kind === 'range' ? `${price.value.currency} ${price.value.minimum}–${price.value.maximum} / Call`
        : `${price.value.currency} ${price.value.amount} / Call`
  const host = identity.hostName.kind === 'present' ? identity.hostName.value : 'Unattributed host'
  const provider = identity.providerName.kind === 'present' ? identity.providerName.value : 'Unattributed Provider'
  return {
    toolRef: listing.canonicalToolRef.kind === 'present' ? listing.canonicalToolRef.value : item.href,
    title: identity.title.kind === 'present' ? identity.title.value : 'Untitled listing',
    providerLine: sourceKind === 'directory' ? `Host: ${host} · Coinbase Bazaar`
      : sourceKind === 'business_catalogue' ? `Provider: ${provider} · Business catalogue`
        : `${listing.providerPage.kind === 'present' ? 'Provider' : 'Publisher'}: ${provider} · AE admitted`,
    healthLabel: sourceKind === 'admitted'
      ? listing.facts.readiness.kind === 'present' && listing.facts.readiness.value.posture === 'routeable'
        ? getStatusPresentation('operational').label
        : 'Readiness unknown'
      : sourceKind === 'directory'
        ? 'Directory listing, not callable through AE'
        : 'Catalogue endpoint, not callable through AE',
    sourceKind,
    priceLabel,
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
          if (result.groups !== undefined) {
            const groups = result.groups
            const items = [...groups.buyThroughAe.items, ...groups.listedElsewhere.items].map(mapListingToRow)
            setStatus(groups.total === 0 ? {
              kind: 'empty', query: trimmed, count: 0,
              message: 'No matching listings in the searched source pages. Try different wording.',
            } : {
              kind: 'success', query: trimmed, count: groups.total, items,
              groups: { buyThroughAe: groups.buyThroughAe.count, listedElsewhere: groups.listedElsewhere.count },
            })
            return
          }
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
