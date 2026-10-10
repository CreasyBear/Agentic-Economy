import Decimal from 'decimal.js'
import { formatCount, formatDate } from '@/lib/ui/format-time'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import type { X402DirectoryFacet } from '@/modules/market/x402-directory-catalogue'
import { directoryProviderKey, directorySlugBase, minimumDirectoryUsdPrice } from '@/modules/market/x402-directory-index'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { x402DirectoryFunctionalTitle } from '@/modules/market/x402-directory-title'
import type { SavedDirectoryTool, SavedToolListItem, SavedToolSaveInput } from '@/modules/market/saved-tools.contracts'
import { formatDisplayPrice } from '@/modules/money/public'
import { degrade } from '@/lib/observability/degrade'

import { directoryCardCopy } from './internal/directory-card-copy'

export { absorbProviderEntries, groupDirectoryProviders } from './internal/directory-provider-pagination'
export { directoryLede, readableCardText } from './internal/directory-card-copy'

/** Readiness in plain words, the same on every card, row and tool page: only aecon-callable tools run through aecon today. */
export const DIRECTORY_READINESS = {
  ae_callable: { label: 'Ready to call', tone: 'success' },
  setup_required: { label: 'Needs setup', tone: 'warning' },
  unavailable: { label: 'Unavailable', tone: 'neutral' },
  external_listing: { label: 'Preview only', tone: 'neutral' },
} as const

/** No listed price, in the same words on every card, row and comparison. */
export const PRICE_UNAVAILABLE = 'Price unavailable'

const activityCount = (count: number, one: string, many: string) => `${formatCount(count)} ${count === 1 ? one : many}`

/**
 * Usage in one phrase, the same everywhere: "15 calls · 11 buyers in 30 days". The directory counts a
 * rolling 30 days. Real counts only; a missing or zero count is left out, never shown.
 */
export function directoryActivityLabel(activity: X402DirectoryEntry['activity']): string | undefined {
  const calls = activity?.calls30d
  const buyers = activity?.payers30d
  const parts = [
    calls === undefined || !Number.isSafeInteger(calls) || calls <= 0 ? undefined : activityCount(calls, 'call', 'calls'),
    buyers === undefined || !Number.isSafeInteger(buyers) || buyers <= 0 ? undefined : activityCount(buyers, 'buyer', 'buyers'),
  ].filter((part): part is string => part !== undefined)
  return parts.length === 0 ? undefined : `${parts.join(' · ')} in 30 days`
}

/** Select the lowest recognised USDC option, preferring exact when amounts tie. */
function selectedDirectoryUsdPrice(entry: X402DirectoryEntry) {
  const amount = minimumDirectoryUsdPrice(entry)
  if (amount === undefined) return undefined
  const matching = entry.prices.filter(price =>
    (price.scheme === 'exact' || price.scheme === 'upto')
    && minimumDirectoryUsdPrice({ ...entry, prices: [price] }) === amount)
  const price = matching.find(option => option.scheme === 'exact') ?? matching.find(option => option.scheme === 'upto')
  return price === undefined ? undefined : { amount, price }
}

/** A fresh AUD estimate first; exact USDC translated to US dollars otherwise. */
export function directoryPrice(entry: X402DirectoryEntry): string {
  const selected = selectedDirectoryUsdPrice(entry)
  if (selected === undefined) return ''
  const prefix = selected.price.scheme === 'upto' ? 'up to ' : ''
  if (entry.audEstimate !== undefined) return `${prefix}${entry.audEstimate}`
  const amount = formatListedAmount(selected.amount)
  return amount === undefined ? '' : `${prefix}US$${amount}`
}

/** Format the published source amount without rounding away settlement precision. */
function listedPriceAmount(price: X402DirectoryEntry['prices'][number]): string | undefined {
  if (price.decimalAmount !== undefined && price.symbol !== undefined) {
    const formatted = formatListedAmount(price.decimalAmount)
    if (formatted !== undefined) return `${formatted} ${price.symbol}`
  }
  return tidyPublishedAmount(price.amount)
}

function tidyPublishedAmount(amount: string): string | undefined {
  const match = /^(\d+(?:\.\d+)?) ([A-Za-z][A-Za-z0-9]{1,11})$/u.exec(amount.trim())
  if (match === null) return undefined
  const formatted = formatListedAmount(match[1] ?? '')
  return formatted === undefined ? undefined : `${formatted} ${match[2]}`
}

function formatListedAmount(raw: string): string | undefined {
  let amount: Decimal
  try { amount = new Decimal(raw) } catch (cause) {
    captureRouteException(cause, { site: 'formatListedAmount' }, 'warning')
    return undefined
  }
  if (!amount.isFinite() || amount.isNegative()) return undefined
  const [whole, fraction] = amount.toFixed().split('.')
  return fraction === undefined ? groupDigits(whole ?? '0') : `${groupDigits(whole ?? '0')}.${fraction}`
}

function groupDigits(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Buyer-facing provenance for a directory price before AE admission and Quote. */
/** The provider's own listed price behind the card price, for example "0.01 USDC". */
function directoryListedPrice(entry: X402DirectoryEntry): string | undefined {
  const selected = selectedDirectoryUsdPrice(entry)
  if (selected === undefined) return undefined
  const formattedSource = formatListedAmount(selected.amount)
  return formattedSource === undefined ? undefined : `${selected.price.scheme === 'upto' ? 'up to ' : ''}${formattedSource} USDC`
}

export function directoryPriceContext(entry: X402DirectoryEntry): string {
  const listed = directoryListedPrice(entry)
  if (listed === undefined) return ''
  const source = entry.prices.length > 1
    ? `${entry.prices.length} Provider payment options · source ${listed}`
    : `Provider lists ${listed} per Call`
  if (entry.audEstimate === undefined) return source
  return `${entry.choice?.access === 'external_listing' || entry.choice === undefined ? 'Provider-listed estimate' : 'Indicative before Quote'} · ${source}`
}

export function directoryDate(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? formatDate(date, 'UTC') : value
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


function countLabel(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) return undefined
  return formatCount(value)
}

/** Buyer-facing USD from a published source USDC amount. */
export function directoryUsdLabel(decimalAmount: string | undefined): string {
  if (decimalAmount === undefined) return '—'
  const formatted = formatListedAmount(decimalAmount)
  return formatted === undefined ? '—' : `US$${formatted}`
}

export type DirectoryProviderRowModel = Readonly<{
  key: string
  initials: string
  iconUrl?: string
  toolLabel: string
  callsLabel: string
  payersLabel: string
  priceLabel: string
  priceSourceLabel?: string
  leadTitle?: string
  leadSlug?: string
}>

/** One comparable host. Calls, payers, and price are the busiest Tool, not a sum across the host. */
export function toDirectoryProviderRow(provider: X402DirectoryFacet): DirectoryProviderRowModel {
  const calls = provider.leadCalls !== undefined && Number.isSafeInteger(provider.leadCalls) && provider.leadCalls >= 0 ? countLabel(provider.leadCalls) : undefined
  const payers = calls === undefined || provider.leadPayers === undefined || !Number.isSafeInteger(provider.leadPayers) || provider.leadPayers < 0 ? undefined : countLabel(provider.leadPayers)
  const title = calls === undefined ? undefined : provider.leadTitle?.trim()
  const slug = calls === undefined ? undefined : provider.leadSlug?.trim()
  const sourcePrice = calls === undefined ? '—' : directoryUsdLabel(provider.leadPrice)
  const sourceAmount = sourcePrice === '—' ? undefined : sourcePrice.slice(3)
  return {
    key: provider.key,
    initials: directoryInitials(provider.key),
    ...(provider.iconUrl === undefined ? {} : { iconUrl: provider.iconUrl }),
    toolLabel: formatCount(provider.count),
    callsLabel: calls ?? '—',
    payersLabel: payers ?? '—',
    priceLabel: sourcePrice === '—' ? '' : sourcePrice,
    ...(sourceAmount === undefined ? {} : { priceSourceLabel: `Provider lists ${sourceAmount} USDC per Call` }),
    ...(title === undefined || title.length === 0 ? {} : { leadTitle: title }),
    ...(slug === undefined || slug.length === 0 ? {} : { leadSlug: slug }),
  }
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
  /** Set when `priceLabel` is an AUD estimate: the provider's listed price it was estimated from. */
  priceEstimateSource?: string
  access: 'external_listing' | 'ae_callable' | 'setup_required' | 'unavailable'
  accessLabel: string
  toolRef?: string
  sourceRouteRef?: string
  tags: readonly string[]
  description?: string
  outputLabel?: string
  glance?: string
  factsLine?: string
  activityTitle?: string
  callsLabel?: string
  payersLabel?: string
  initials: string
  iconUrl?: string
}>

export function toDirectoryToolCardModel(entry: X402DirectoryEntry): DirectoryToolCardModel {
  const rawTitle = directoryTitle(entry)
  const copy = directoryCardCopy(entry, rawTitle, directoryGlance(entry, rawTitle))
  const title = copy.title
  const slug = entry.slug ?? directorySlugBase(entry.resource)
  const providerHost = directoryProviderKey(entry.provider)
  const rawDescription = entry.description !== title && !repeatsTitle(title, entry.description) ? entry.description : undefined
  const outputLabel = directoryOutputLabel(entry)
  const glance = copy.summary
  const providerLine = directoryProviderLine(entry)
  const calls30d = entry.activity?.calls30d
  const payers30d = entry.activity?.payers30d
  const callsLabel = countLabel(calls30d)
  const payersLabel = countLabel(payers30d)
  const lastCalledAt = entry.activity?.lastCalledAt
  const lastReported = lastCalledAt === undefined ? undefined : directoryDate(lastCalledAt)
  const bazaarTitle = lastReported === undefined
    ? 'Reported by the x402 directory.'
    : `Reported by the x402 directory. Last call ${lastReported}.`
  const factsLine = directoryActivityLabel(entry.activity) ?? ''
  const estimateSource = entry.audEstimate === undefined || directoryPrice(entry) === '' ? undefined : directoryListedPrice(entry)
  return {
    title,
    providerHost,
    slug,
    access: entry.choice?.access ?? 'external_listing',
    accessLabel: DIRECTORY_READINESS[entry.choice?.access ?? 'external_listing'].label,
    ...(entry.choice?.toolRef === undefined ? {} : { toolRef: entry.choice.toolRef }),
    ...(entry.choice?.sourceRouteRef === undefined ? {} : { sourceRouteRef: entry.choice.sourceRouteRef }),
    providerLine,
    initials: directoryInitials(providerLine),
    priceLabel: directoryPrice(entry),
    priceContext: directoryPriceContext(entry),
    ...(estimateSource === undefined ? {} : { priceEstimateSource: estimateSource }),
    tags: [...new Set([...(entry.category === undefined ? [] : [entry.category]), ...(entry.tags ?? [])])].slice(0, 2),
    ...(rawDescription !== undefined && rawDescription !== '' ? { description: rawDescription } : {}),
    ...(outputLabel === undefined ? {} : { outputLabel }),
    ...(glance === undefined ? {} : { glance }),
    ...(factsLine.length === 0 ? {} : { factsLine }),
    ...(lastCalledAt === undefined ? {} : { activityTitle: bazaarTitle }),
    ...(callsLabel === undefined ? {} : { callsLabel }),
    ...(payersLabel === undefined ? {} : { payersLabel }),
    ...(entry.iconUrl === undefined ? {} : { iconUrl: entry.iconUrl }),
  }
}

export type MarketNeedSaveState = Readonly<{ key: string; idempotencyKey: string; status: 'idle' | 'saving' | 'saved'; error?: string }>

export type SavedToolsWriteError = Readonly<{ owner: string; message: string }>

export type SavedToolsLoadState = Readonly<{ owner: string; items: readonly SavedToolListItem[]; status: 'ready' | 'failed'; error?: string }>

export type SavedToolsContextValue = Readonly<{
  savedTools: readonly SavedToolListItem[]
  toggleSavedTool: (tool: SavedDirectoryTool) => void
  toggleIdentity: (identity: SavedToolSaveInput) => void
  isSavedIdentity: (identity: SavedToolSaveInput) => boolean
  isSavedTool: (tool: SavedDirectoryTool) => boolean
  pending: (identity: SavedToolSaveInput) => boolean
  status: 'loading' | 'ready' | 'failed' | 'signed_out'
  saveError?: string
  refresh: () => void
}>

export type SavedDirectoryRowModel = Readonly<{
  title: string
  provider: string
  price: string
  access: string
  toolRef?: string
  providerHost?: string
  slug?: string
}>

/** Saved identities never carry prices; these details come from the current owner-scoped read. */
export function toSavedDirectoryRowModel(item: SavedToolListItem): SavedDirectoryRowModel {
  if (item.detail.kind !== 'found') return {
    title: 'Tool no longer available',
    provider: item.identity.kind === 'ae_callable' ? item.identity.toolRef : item.identity.resource,
    price: PRICE_UNAVAILABLE,
    access: DIRECTORY_READINESS.unavailable.label,
  }
  if ('tool' in item.detail) {
    const { tool } = item.detail
    return {
      title: tool.listing.label,
      provider: tool.business.name,
      price: formatDisplayPrice(tool.commercial.displayPrice) ?? '',
      access: DIRECTORY_READINESS.ae_callable.label,
      toolRef: tool.toolRef,
    }
  }
  const model = toDirectoryToolCardModel(item.detail.entry)
  return { title: model.title, provider: model.providerLine, price: model.priceLabel, access: model.accessLabel, providerHost: model.providerHost, slug: model.slug }
}

export type DirectoryToolFieldNote = Readonly<{ label: string; detail?: string }>

export type DirectoryToolPageModel = Readonly<{
  description: string
  providerLine: string
  providerHost: string
  initials: string
  iconUrl?: string
  serviceName?: string
  category?: string
  useLine?: string
  asks: readonly DirectoryToolFieldNote[]
  returns: readonly DirectoryToolFieldNote[]
  priceLabel: string
  priceContext: string
  callsLabel: string
  payersLabel: string
  lastCalledLabel: string
  returnsLabel: string
  methodLabel: string
  payments: readonly Readonly<{ network: string; amount: string }>[]
}>

function fieldLabel(name: string): string {
  const words = directoryFieldWords(name) ?? name.replace(/[_./-]+/g, ' ').trim().toLowerCase()
  if (words.length === 0) return name
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function publishedNotes(entry: X402DirectoryEntry, kind: 'input' | 'output'): readonly DirectoryToolFieldNote[] {
  const fields = (kind === 'input' ? entry.input : entry.output)?.fields ?? []
  const eligible = fields.filter(field => kind === 'output' ? field.location === 'output' : field.location !== 'headers' && field.location !== 'output')
  const ranked = [...eligible].sort((left, right) => Number(right.required === true) - Number(left.required === true))
  const notes: DirectoryToolFieldNote[] = []
  const seen = new Set<string>()
  for (const field of ranked) {
    const label = fieldLabel(field.name)
    const key = label.toLowerCase()
    if (seen.has(key) || GLANCE_NOISE.has(key)) continue
    const detail = field.description?.trim()
    if (kind === 'input' && detail === undefined && field.required !== true) continue
    seen.add(key)
    notes.push(detail === undefined || detail.toLowerCase() === key ? { label } : { label, detail })
    if (notes.length >= (kind === 'input' ? 6 : 4)) break
  }
  return notes
}

function serviceDescription(entry: X402DirectoryEntry, title: string): string {
  const description = entry.description.trim()
  if (description.length > 0 && description !== 'The provider has not supplied a description.' && !repeatsTitle(title, description)) {
    return description
  }
  const provider = directoryProviderLine(entry)
  const service = entry.serviceName?.trim()
  if (service !== undefined && service.length > 0 && service !== title && service !== provider) {
    return `${provider} lists this under ${service}.`
  }
  return `${provider} lists this service.`
}

/** Facts for deciding whether a listed service fits, before any Agentic Economy Call. */
export function toDirectoryToolPageModel(entry: X402DirectoryEntry): DirectoryToolPageModel {
  const { title } = toDirectoryToolCardModel(entry)
  const returns = directoryOutputLabel(entry) ?? entry.outputSummary?.trim()
  const lastCalled = entry.activity?.lastCalledAt === undefined ? undefined : directoryDate(entry.activity.lastCalledAt)
  const providerLine = directoryProviderLine(entry)
  const providerHost = directoryProviderKey(entry.provider)
  const service = entry.serviceName?.trim()
  const callsLabel = countLabel(entry.activity?.calls30d) ?? '—'
  const payersLabel = countLabel(entry.activity?.payers30d) ?? '—'
  const lastCalledLabel = lastCalled ?? '—'
  const line = directoryActivityLabel(entry.activity)
  return {
    description: serviceDescription(entry, title),
    providerLine,
    providerHost,
    initials: directoryInitials(providerLine),
    ...(entry.iconUrl === undefined ? {} : { iconUrl: entry.iconUrl }),
    ...(service === undefined || service === title || service === providerLine ? {} : { serviceName: service }),
    ...(entry.category === undefined ? {} : { category: entry.category }),
    ...(line === undefined ? {} : { useLine: line }),
    asks: publishedNotes(entry, 'input'),
    returns: publishedNotes(entry, 'output'),
    priceLabel: directoryPrice(entry),
    priceContext: directoryPriceContext(entry),
    callsLabel,
    payersLabel,
    lastCalledLabel,
    returnsLabel: returns !== undefined && returns.length > 0 ? returns : 'The provider has not described the response.',
    methodLabel: entry.methodLabel ?? entry.protocol,
    payments: entry.prices.slice(0, 6).map(price => ({
      network: price.networkLabel ?? price.network,
      amount: listedPriceAmount(price) ?? price.amount,
    })),
  }
}

export type DirectoryServiceEndpoint = Readonly<{
  title: string
  path: string
  price: string
  calls: string
  payers: string
  activity: string
  providerHost: string
  slug: string
  current: boolean
}>

export type DirectoryServiceSurface = Readonly<{
  title: string
  host: string
  category?: string
  networks: string
  priceRange: string
  endpointCount: string
  endpoints: readonly DirectoryServiceEndpoint[]
}>

/** One Provider's indexed Tools, as the routes of a single service. */
export function toDirectoryServiceSurface(
  current: X402DirectoryEntry,
  siblings: readonly X402DirectoryEntry[],
  truncated: boolean,
): DirectoryServiceSurface {
  const seen = new Set<string>()
  const entries = [current, ...siblings].filter(entry => {
    if (seen.has(entry.resource)) return false
    seen.add(entry.resource)
    return true
  })
  const providerLine = directoryProviderLine(current)
  const networks = [...new Set(entries.flatMap(entry => entry.prices.map(price => price.networkLabel ?? price.network)))].slice(0, 4)
  const count = truncated ? `${entries.length}+` : String(entries.length)
  return {
    title: providerLine,
    host: directoryProviderKey(current.provider),
    ...(current.category === undefined ? {} : { category: current.category }),
    networks: networks.length === 0 ? 'Not published' : networks.join(', '),
    priceRange: [...new Set(entries.map(directoryPrice).filter(price => price.length > 0))].join(' · '),
    endpointCount: count === '1' ? '1 endpoint' : `${count} endpoints`,
    endpoints: entries.map(entry => {
      const calls = countLabel(entry.activity?.calls30d) ?? '—'
      const payers = countLabel(entry.activity?.payers30d) ?? '—'
      return {
        title: toDirectoryToolCardModel(entry).title,
        path: endpointPath(entry.resource),
        price: directoryPrice(entry),
        calls,
        payers,
        activity: directoryActivityLabel(entry.activity) ?? 'Calls not reported',
        providerHost: directoryProviderKey(entry.provider),
        slug: entry.slug ?? directorySlugBase(entry.resource),
        current: entry.resource === current.resource,
      }
    }),
  }
}

function endpointPath(resource: string): string {
  try {
    const url = new URL(resource)
    const path = `${url.pathname}${url.search}`
    return path.length > 1 ? path : url.hostname
  } catch (cause) {
    return degrade(cause, resource, { site: 'directoryService.endpointPath', reason: 'invalid_response' })
  }
}
