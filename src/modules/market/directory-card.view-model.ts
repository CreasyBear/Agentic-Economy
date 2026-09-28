import Decimal from 'decimal.js'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { formatDisplayPrice } from '@/modules/money/public'
import type { X402DirectoryFacet } from '@/modules/market/x402-directory-catalogue'
import { directoryProviderKey, directorySlugBase, minimumDirectoryUsdPrice } from '@/modules/market/x402-directory-index'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { x402DirectoryFunctionalTitle } from '@/modules/market/x402-directory-title'

/** AUD is the primary estimate; published USDC remains a source detail below it. */
export function directoryPrice(entry: X402DirectoryEntry): string {
  if (entry.audEstimate !== undefined) return entry.audEstimate
  const price = entry.prices[0]
  if (price === undefined) return 'Price on request'
  return listedPriceAmount(price) === undefined ? 'See payment details' : audEstimateUnavailable
}

const audEstimateUnavailable = formatDisplayPrice({ kind: 'unavailable' }) ?? 'AUD estimate temporarily unavailable'

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
export function directoryPriceContext(entry: X402DirectoryEntry): string {
  const price = entry.prices[0]
  if (price === undefined) return 'No Provider price published'
  const quotedSource = entry.audEstimate === undefined ? undefined : minimumDirectoryUsdPrice(entry)
  const formattedSource = quotedSource === undefined ? undefined : formatListedAmount(quotedSource)
  const listed = formattedSource === undefined ? listedPriceAmount(price) : `${formattedSource} USDC`
  const source = entry.prices.length > 1
    ? `${entry.prices.length} Provider payment options${listed === undefined ? '' : ` · source ${listed}`}`
    : listed === undefined ? 'Provider price per Call' : `Provider lists ${listed} per Call`
  if (entry.audEstimate === undefined) return source
  return `${entry.choice?.access === 'external_listing' || entry.choice === undefined ? 'Provider-listed estimate' : 'Indicative before Quote'} · ${source}`
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

function countLabel(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) return undefined
  return value.toLocaleString('en-AU')
}

/** A listed source USDC amount from the directory. An em dash means the figure is absent. */
export function directoryUsdLabel(decimalAmount: string | undefined): string {
  if (decimalAmount === undefined) return '—'
  const formatted = formatListedAmount(decimalAmount)
  return formatted === undefined ? '—' : `${formatted} USDC`
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
  return {
    key: provider.key,
    initials: directoryInitials(provider.key),
    ...(provider.iconUrl === undefined ? {} : { iconUrl: provider.iconUrl }),
    toolLabel: provider.count.toLocaleString('en-AU'),
    callsLabel: calls ?? '—',
    payersLabel: payers ?? '—',
    priceLabel: sourcePrice === '—' ? '—' : audEstimateUnavailable,
    ...(sourcePrice === '—' ? {} : { priceSourceLabel: `Provider lists ${sourcePrice} per Call` }),
    ...(title === undefined || title.length === 0 ? {} : { leadTitle: title }),
    ...(slug === undefined || slug.length === 0 ? {} : { leadSlug: slug }),
  }
}

/** Hosts in the order the sorted Tool list first mentions them. The first Tool in each group is the one the sort put first. */
export function groupDirectoryProviders(entries: readonly X402DirectoryEntry[]): readonly { provider: string; tools: readonly X402DirectoryEntry[] }[] {
  const groups: { provider: string; tools: X402DirectoryEntry[] }[] = []
  const byProvider = new Map<string, { provider: string; tools: X402DirectoryEntry[] }>()
  for (const entry of entries) {
    const existing = byProvider.get(entry.provider)
    if (existing === undefined) {
      const group = { provider: entry.provider, tools: [entry] }
      byProvider.set(entry.provider, group)
      groups.push(group)
    } else existing.tools.push(entry)
  }
  return groups
}

/** A Tools page and a Providers page both show this many rows. The last page may be shorter. */
export const DIRECTORY_LIST_PAGE_SIZE = 12

/**
 * Walk a sorted Tool stream until `size` new hosts are collected.
 * A host already in `seen` (an earlier page) is skipped.
 * Further Tools for a host on this page stay on this page.
 * The first Tool of the next new host, and everything after it, stays in `rest`.
 */
export function absorbProviderEntries(
  entries: readonly X402DirectoryEntry[],
  carried: readonly { provider: string; tools: readonly X402DirectoryEntry[] }[],
  seen: ReadonlySet<string>,
  size = DIRECTORY_LIST_PAGE_SIZE,
): { groups: { provider: string; tools: X402DirectoryEntry[] }[]; rest: X402DirectoryEntry[] } {
  const groups = carried.map(group => ({ provider: group.provider, tools: [...group.tools] }))
  const byProvider = new Map(groups.map(group => [group.provider, group]))
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry === undefined) continue
    const existing = byProvider.get(entry.provider)
    if (existing !== undefined) {
      existing.tools.push(entry)
      continue
    }
    if (seen.has(entry.provider)) continue
    if (groups.length >= size) return { groups, rest: entries.slice(index) }
    const group = { provider: entry.provider, tools: [entry] }
    byProvider.set(entry.provider, group)
    groups.push(group)
  }
  return { groups, rest: [] }
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
  access: 'external_listing' | 'ae_callable' | 'setup_required' | 'unavailable'
  accessLabel: string
  toolRef?: string
  sourceRouteRef?: string
  tags: readonly string[]
  description?: string
  outputLabel?: string
  glance?: string
  activityLabel?: string
  activityTitle?: string
  callsLabel?: string
  payersLabel?: string
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
  const callsLabel = countLabel(calls30d)
  const payersLabel = countLabel(payers30d)
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
    access: entry.choice?.access ?? 'external_listing',
    accessLabel: entry.choice?.access === 'ae_callable' ? 'AE callable'
      : entry.choice?.access === 'setup_required' ? 'Connect to call'
      : entry.choice?.access === 'unavailable' ? 'Currently unavailable'
      : 'External listing · inspect',
    ...(entry.choice?.toolRef === undefined ? {} : { toolRef: entry.choice.toolRef }),
    ...(entry.choice?.sourceRouteRef === undefined ? {} : { sourceRouteRef: entry.choice.sourceRouteRef }),
    providerLine,
    initials: directoryInitials(providerLine),
    priceLabel: directoryPrice(entry),
    priceContext: directoryPriceContext(entry),
    tags: [...new Set([...(entry.category === undefined ? [] : [entry.category]), ...(entry.tags ?? [])])].slice(0, 2),
    ...(rawDescription !== undefined && rawDescription !== '' ? { description: rawDescription } : {}),
    ...(outputLabel === undefined ? {} : { outputLabel }),
    ...(glance === undefined ? {} : { glance }),
    ...activity,
    ...(callsLabel === undefined ? {} : { callsLabel }),
    ...(payersLabel === undefined ? {} : { payersLabel }),
    ...(entry.iconUrl === undefined ? {} : { iconUrl: entry.iconUrl }),
  }
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

function directoryActivityLine(calls: string, payers: string, lastCalled: string): string | undefined {
  const parts = [
    ...(calls === '—' ? [] : [`${calls} ${calls === '1' ? 'call' : 'calls'} in 30 days`]),
    ...(payers === '—' ? [] : [`${payers} ${payers === '1' ? 'payer' : 'payers'}`]),
    ...(lastCalled === '—' ? [] : [`last used ${lastCalled}`]),
  ]
  return parts.length === 0 ? undefined : parts.join(' · ')
}

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
  const title = directoryTitle(entry)
  const returns = directoryOutputLabel(entry) ?? entry.outputSummary?.trim()
  const lastCalled = entry.activity?.lastCalledAt === undefined ? undefined : directoryDate(entry.activity.lastCalledAt)
  const providerLine = directoryProviderLine(entry)
  const providerHost = directoryProviderKey(entry.provider)
  const service = entry.serviceName?.trim()
  const callsLabel = countLabel(entry.activity?.calls30d) ?? '—'
  const payersLabel = countLabel(entry.activity?.payers30d) ?? '—'
  const lastCalledLabel = lastCalled ?? '—'
  const line = directoryActivityLine(callsLabel, payersLabel, lastCalledLabel)
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
  const hasListedPrice = entries.some(entry => entry.prices.length > 0)
  const networks = [...new Set(entries.flatMap(entry => entry.prices.map(price => price.networkLabel ?? price.network)))].slice(0, 4)
  const count = truncated ? `${entries.length}+` : String(entries.length)
  return {
    title: providerLine,
    host: directoryProviderKey(current.provider),
    ...(current.category === undefined ? {} : { category: current.category }),
    networks: networks.length === 0 ? 'Not published' : networks.join(', '),
    priceRange: hasListedPrice ? audEstimateUnavailable : 'Price on request',
    endpointCount: count === '1' ? '1 endpoint' : `${count} endpoints`,
    endpoints: entries.map(entry => {
      const calls = countLabel(entry.activity?.calls30d) ?? '—'
      const payers = countLabel(entry.activity?.payers30d) ?? '—'
      return {
        title: directoryTitle(entry),
        path: endpointPath(entry.resource),
        price: directoryPrice(entry),
        calls,
        payers,
        activity: calls === '—' && payers === '—' ? 'Calls not reported' : `${calls} calls · ${payers} payers · last 30 days`,
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
  } catch {
    return resource
  }
}
