import Decimal from 'decimal.js'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { directoryProviderKey, directorySlugBase } from '@/modules/market/x402-directory-index'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { x402DirectoryFunctionalTitle } from '@/modules/market/x402-directory-title'

/** Formatting a published token amount does not turn it into an AE Quote. */
export function directoryPrice(entry: X402DirectoryEntry): string {
  const price = entry.prices[0]
  if (price === undefined) return 'Price on request'
  if (price.decimalAmount !== undefined && price.symbol !== undefined) {
    try { return `${new Decimal(price.decimalAmount).toFixed()} ${price.symbol}` } catch (cause) { captureRouteException(cause, { site: 'directoryPrice' }, 'warning') /* Retain the source label. */ }
  }
  return price.symbol === undefined || price.decimalAmount === undefined ? 'See payment details' : price.amount
}

/** Buyer-facing provenance for a directory price before AE admission and Quote. */
export function directoryPriceContext(entry: X402DirectoryEntry): string {
  if (entry.prices.length === 0) return 'No Provider price published'
  if (entry.prices.length > 1) return `${entry.prices.length} Provider payment options`
  return 'Provider price per Call'
}

export function directoryDate(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date) : value
}

export function directoryOutputLabel(entry: X402DirectoryEntry): string | undefined {
  const fields = entry.output?.fields.filter(field => field.path.split('/').length <= 3).slice(0, 3)
  if (fields?.length) return fields.map(field => field.name).join(' · ')
  return entry.output?.type ?? entry.outputSummary
}

/** Older indexed snapshots retain the same description and service identity. */
export function directoryTitle(entry: X402DirectoryEntry): string {
  if (entry.title !== entry.serviceName && entry.title.length <= 100) return entry.title
  const description = entry.description === 'The provider has not supplied a description.' ? undefined : entry.description
  return x402DirectoryFunctionalTitle({ description, serviceName: entry.serviceName, fallback: entry.title })
}

export type DirectoryToolCardModel = Readonly<{
  title: string
  providerHost: string
  slug: string
  providerLine: string
  priceLabel: string
  priceContext: string
  tags: readonly string[]
  description?: string
  outputLabel?: string
  activityLabel?: string
  activityTitle?: string
  iconUrl?: string
}>

export function toDirectoryToolCardModel(entry: X402DirectoryEntry): DirectoryToolCardModel {
  const title = directoryTitle(entry)
  const slug = entry.slug ?? directorySlugBase(entry.resource)
  const providerHost = directoryProviderKey(entry.provider)
  const rawDescription = entry.description !== title ? entry.description : entry.schemaSummary
  const outputLabel = directoryOutputLabel(entry)
  const calls30d = entry.activity?.calls30d
  const activity =
    calls30d !== undefined && calls30d > 0
      ? {
          activityLabel: 'Used recently by other agents',
          activityTitle: 'Reported by Coinbase Bazaar in the past 30 days',
        }
      : entry.provenance?.updatedAt !== undefined
        ? { activityLabel: `Verified ${directoryDate(entry.provenance.updatedAt)}` }
        : {}
  return {
    title,
    providerHost,
    slug,
    providerLine: entry.serviceName === undefined ? entry.provider : `${entry.serviceName} · ${entry.provider}`,
    priceLabel: directoryPrice(entry),
    priceContext: directoryPriceContext(entry),
    tags: [...new Set([...(entry.category === undefined ? [] : [entry.category]), ...(entry.tags ?? [])])].slice(0, 2),
    ...(rawDescription !== undefined && rawDescription !== '' ? { description: rawDescription } : {}),
    ...(outputLabel === undefined ? {} : { outputLabel }),
    ...activity,
    ...(entry.iconUrl === undefined ? {} : { iconUrl: entry.iconUrl }),
  }
}
