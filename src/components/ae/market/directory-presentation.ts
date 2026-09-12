import Decimal from 'decimal.js'
import { x402DirectoryFunctionalTitle } from '@/modules/market/x402-directory-title'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { captureRouteException } from '@/lib/observability/capture-route-exception'

/** Formatting a published token amount does not turn it into an AE Quote. */
export function directoryPrice(entry: X402DirectoryEntry): string {
  const price = entry.prices[0]
  if (price === undefined) return 'Price on request'
  if (price.decimalAmount !== undefined && price.symbol !== undefined) {
    try { return `${new Decimal(price.decimalAmount).toFixed()} ${price.symbol}` } catch (cause) { captureRouteException(cause, { site: 'directoryPrice' }, 'warning') /* Retain the source label. */ }
  }
  return price.symbol === undefined || price.decimalAmount === undefined ? 'See payment details' : price.amount
}

export function directoryCount(value: number): string {
  return new Intl.NumberFormat('en-AU', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
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

export function directoryNetworkLabel(entry: X402DirectoryEntry): string | undefined {
  const price = entry.prices[0]
  if (price === undefined) return undefined
  if (/^solana:[A-Za-z0-9]{1,44}$/u.test(price.network)) return price.networkLabel === 'Solana Devnet' ? price.networkLabel : 'Solana'
  return price.networkLabel ?? price.network
}
