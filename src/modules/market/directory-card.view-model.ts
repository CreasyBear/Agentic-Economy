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

const GLANCE_NOISE = new Set([
  'found', 'data', 'result', 'results', 'output', 'response', 'status',
  'ok', 'success', 'payload', 'body', 'value', 'item', 'items', 'object',
])

/** Turns a schema token into words a person can scan. Generic tokens drop out. */
export function directoryFieldWords(name: string): string | undefined {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_./-]+/g, ' ')
    .trim()
    .toLowerCase()
  if (words.length === 0 || words.length > 40 || GLANCE_NOISE.has(words)) return undefined
  return words
}

export function directoryOutputLabel(entry: X402DirectoryEntry): string | undefined {
  const names = entry.output?.fields
    .filter(field => field.path.split('/').length <= 3)
    .flatMap(field => {
      const words = directoryFieldWords(field.name)
      return words === undefined ? [] : [words]
    })
  const unique = [...new Set(names ?? [])].slice(0, 3)
  if (unique.length > 0) return unique.join(', ')
  const summary = entry.outputSummary?.trim()
  if (summary === undefined || summary.length === 0 || summary.length > 80 || summary.includes('_')) return undefined
  return summary
}

function repeatsTitle(title: string, description: string): boolean {
  const heading = title.trim().toLowerCase()
  const body = description.trim().toLowerCase()
  if (heading === body) return true
  const opening = heading.slice(0, 48)
  return opening.length >= 24 && (body.startsWith(opening) || heading.startsWith(body.slice(0, 48)))
}

/** One sentence for the card body. Schema input dumps and title repeats stay off the face. */
export function directoryGlance(entry: X402DirectoryEntry, title: string): string | undefined {
  const returns = directoryOutputLabel(entry)
  if (returns !== undefined) return `Returns ${returns}`
  const description = entry.description.trim()
  if (description.length === 0 || description === 'The provider has not supplied a description.' || repeatsTitle(title, description)) {
    return undefined
  }
  return description
}

/** One provider name. A service title wins over a long resource slug. */
export function directoryProviderLine(entry: X402DirectoryEntry): string {
  const service = entry.serviceName?.trim()
  if (service !== undefined && service.length > 0 && service.length <= 40 && service !== entry.provider) return service
  return entry.provider
}

/** Two letters for the card mark when a service icon is absent. */
export function directoryInitials(providerLine: string): string {
  const letters = providerLine.replace(/[^A-Za-z0-9]/g, '')
  return (letters.slice(0, 2) || 'AE').toUpperCase()
}

function countPhrase(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`
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
  glance?: string
  activityLabel?: string
  activityTitle?: string
  initials: string
  iconUrl?: string
}>

export function toDirectoryToolCardModel(entry: X402DirectoryEntry): DirectoryToolCardModel {
  const title = directoryTitle(entry)
  const slug = entry.slug ?? directorySlugBase(entry.resource)
  const providerHost = directoryProviderKey(entry.provider)
  const rawDescription = entry.description !== title && !repeatsTitle(title, entry.description) ? entry.description : undefined
  const outputLabel = directoryOutputLabel(entry)
  const glance = directoryGlance(entry, title)
  const providerLine = directoryProviderLine(entry)
  const calls30d = entry.activity?.calls30d
  const payers30d = entry.activity?.payers30d
  const lastReported = entry.activity?.lastCalledAt === undefined ? undefined : directoryDate(entry.activity.lastCalledAt)
  const bazaarTitle = lastReported === undefined
    ? 'Coinbase Bazaar volume, not an Agentic Economy Call.'
    : `Coinbase Bazaar volume, not an Agentic Economy Call. Last reported ${lastReported}.`
  const activity =
    calls30d !== undefined && calls30d > 0
      ? {
          activityLabel: [
            countPhrase(calls30d, 'reported call', 'reported calls'),
            ...(payers30d !== undefined && payers30d > 0 ? [countPhrase(payers30d, 'payer', 'payers')] : []),
          ].join(' · ') + ' in 30 days',
          activityTitle: bazaarTitle,
        }
      : lastReported !== undefined
        ? { activityLabel: `Last reported ${lastReported}`, activityTitle: bazaarTitle }
        : entry.provenance?.updatedAt !== undefined
          ? { activityLabel: `Updated ${directoryDate(entry.provenance.updatedAt)}` }
          : {}
  return {
    title,
    providerHost,
    slug,
    providerLine,
    initials: directoryInitials(providerLine),
    priceLabel: directoryPrice(entry),
    priceContext: directoryPriceContext(entry),
    tags: [...new Set([...(entry.category === undefined ? [] : [entry.category]), ...(entry.tags ?? [])])].slice(0, 2),
    ...(rawDescription !== undefined && rawDescription !== '' ? { description: rawDescription } : {}),
    ...(outputLabel === undefined ? {} : { outputLabel }),
    ...(glance === undefined ? {} : { glance }),
    ...activity,
    ...(entry.iconUrl === undefined ? {} : { iconUrl: entry.iconUrl }),
  }
}
