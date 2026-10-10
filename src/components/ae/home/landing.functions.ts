import { createServerFn } from '@tanstack/react-start'

import { awaitBoundedRead, SOURCE_READ_TIMEOUT_MS } from '@/lib/bounded-read'
import { degrade } from '@/lib/observability/degrade'
import { readableCardText, toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import type { X402DirectoryCatalogueInput } from '@/modules/market/x402-directory-catalogue'
import { DIRECTORY_PRICE_BANDS, directoryPriceBand } from '@/modules/market/x402-directory-index'
import {
  readX402DirectoryAnalyticsServer,
  readX402DirectoryCatalogueResourceServer,
  readX402DirectoryCatalogueServer,
} from '@/modules/market/x402-directory-index.functions'
import { REFERENCE_RATE_MAX_AGE_MS, formatDisplayPrice, parseDecimalExactAmount } from '@/modules/money/public'
import { readPersistedReferenceRate } from '@/modules/money/reference-rate.server'

import { LANDING_ROWS, LANDING_TASKS, POPULAR_COUNT, ROW_COUNT } from './landing-content'

/** Rows and tasks carry the directory's own entries; every card renders them through the one card model. */
export type LandingRow = Readonly<{ id: string; title: string; query: string; entries: readonly X402DirectoryEntry[] }>
/**
 * `request` is only kept when the provider publishes no sample, so the pane still shows something real.
 * `input` is the provider's own example input beside its sample, so a visitor can check the response answers it.
 */
export type LandingTask = Readonly<{ id: string; title: string; entry: X402DirectoryEntry; sample?: string; input?: string; request?: string }>
export type LandingStats = Readonly<{
  totalTools: number
  /** The median price per call in A$, at the same reference rate the cards use. */
  medianAud?: number
  /** Decimal places the median needs, so a sub-cent median never shows as A$0.00. */
  medianDecimals?: number
  priceBins?: readonly number[]
  /** Bars up to and including the median's band are inked. */
  medianMarker?: number
}>

export type LandingData = Readonly<{
  /** The directory's most used listings, one per provider. Always shown while the directory answers. */
  popular: readonly X402DirectoryEntry[]
  rows: readonly LandingRow[]
  tasks: readonly LandingTask[]
  stats?: LandingStats
}>

const ROW_SIZE = 4
/** A row with fewer providers than this reads as one shop, not a marketplace, so it is skipped. */
const ROW_MIN = 3
/** Breadth over depth: a provider gets at most one bento task and three places on the whole page. */
const TASK_CAP = 1
const PAGE_CAP = 3
/** A task promises a job, so its tool must be one of the search's top answers, never a distant match picked for variety. */
const TASK_DEPTH = 3
/** Five whole lines that fit a phone-width pane, so the pane never cuts a line through its glyphs. */
const SAMPLE_LINES = 5
const SAMPLE_LINE_MAX = 38
/** Cards whose titles agree this far are the same listing twice. */
const TITLE_KEY_LENGTH = 32
/** Every visitor gets the same landing, so one good read serves them all for a while. */
const FRESH_MS = 5 * 60_000
/** Before any good read, a degraded landing is retried sooner, still at most once per window. */
const RETRY_MS = 30_000

type Pick = { entry: X402DirectoryEntry; title: string; summary: string }

/** A card the front page can show: a price, a page, and a whole, readable title. */
function presentable(entry: X402DirectoryEntry): Pick | undefined {
  const model = toDirectoryToolCardModel(entry)
  if (model.priceLabel === '' || model.slug === '' || model.title.endsWith('…') || !readableCardText(model.title)) return undefined
  return { entry, title: model.title, summary: model.glance ?? '' }
}

/** What the page has already shown, shared by every section so breadth holds across the whole landing. */
type Curation = { taken: Set<string>; titles: Set<string>; perProvider: Map<string, number> }

const titleKey = (title: string) => title.toLowerCase().slice(0, TITLE_KEY_LENGTH)

/** A term counts only at the start of a word, so "ip" matches "IP address" and never "shipping". */
const escapeTerm = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
const termsPattern = (terms: readonly string[]) => new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${terms.map(escapeTerm).join('|')})`, 'iu')

/** Relevant when the card a visitor sees, or the provider's own category, names the section's subject. */
const shows = (pattern: RegExp, pick: Pick) => pattern.test(`${pick.title} ${pick.summary} ${pick.entry.category ?? ''}`)

/** First matches, one per provider per section, never past the provider's page cap. Nothing is claimed until the section is kept. */
function pickTools(entries: readonly X402DirectoryEntry[], page: Curation, limit: number, cap: number, terms?: readonly string[]): Pick[] {
  const pattern = terms === undefined ? undefined : termsPattern(terms)
  const providers = new Set<string>()
  const titles = new Set<string>()
  const picked: Pick[] = []
  for (const entry of entries) {
    if (picked.length === limit) break
    if (page.taken.has(entry.resource) || providers.has(entry.provider) || (page.perProvider.get(entry.provider) ?? 0) >= cap) continue
    const pick = presentable(entry)
    if (pick === undefined || (pattern !== undefined && !shows(pattern, pick))) continue
    const key = titleKey(pick.title)
    if (page.titles.has(key) || titles.has(key)) continue
    providers.add(entry.provider)
    titles.add(key)
    picked.push(pick)
  }
  return picked
}

function claim(page: Curation, picks: readonly Pick[]) {
  for (const { entry, title } of picks) {
    page.perProvider.set(entry.provider, (page.perProvider.get(entry.provider) ?? 0) + 1)
    page.taken.add(entry.resource)
    page.titles.add(titleKey(title))
  }
}

/**
 * One page stops at a couple of dozen cards, often most from one provider, which the provider and page caps
 * then empty. Two pages give a section enough distinct providers.
 */
async function readTwoPages(input: X402DirectoryCatalogueInput): Promise<readonly X402DirectoryEntry[]> {
  const first = await readX402DirectoryCatalogueServer({ data: input })
  if (first.kind !== 'ok') return []
  if (first.indexCursor === undefined) return first.page.items
  const next = await readX402DirectoryCatalogueServer({ data: { ...input, indexCursor: first.indexCursor } })
  return next.kind === 'ok' ? [...first.page.items, ...next.page.items] : first.page.items
}

/** Each distinct query is read once per landing, however many sections share it. */
function searcher() {
  const reads = new Map<string, Promise<readonly X402DirectoryEntry[]>>()
  return (query: string) => {
    let read = reads.get(query)
    if (read === undefined) reads.set(query, read = settle(readTwoPages({ query, sort: 'relevance' }), 'landingSearch', []))
    return read
  }
}

/** Placeholder values ("", "…") are the provider's template, not a response; drop them before showing one. */
function withoutPlaceholders(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPlaceholders)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([, field]) => field !== '' && field !== '…')
    .map(([key, field]) => [key, withoutPlaceholders(field)]))
}

/** A taste of the response: five whole lines, each clipped so it never runs past the pane. */
function sampleText(json: string | undefined): string | undefined {
  if (json === undefined || json.trim() === '') return undefined
  let pretty: string
  try { pretty = JSON.stringify(withoutPlaceholders(JSON.parse(json)), null, 2) } catch { pretty = json }
  const lines = pretty.split('\n').map(line => line.length <= SAMPLE_LINE_MAX ? line : `${line.slice(0, SAMPLE_LINE_MAX - 1)}…`)
  return lines.length <= SAMPLE_LINES ? lines.join('\n') : `${lines.slice(0, SAMPLE_LINES).join('\n')}\n  …`
}

/** The example input as one compact line, clipped like a sample line. */
function inputLine(json: string | undefined): string | undefined {
  if (json === undefined || json.trim() === '') return undefined
  let line: string
  try { line = JSON.stringify(withoutPlaceholders(JSON.parse(json))) } catch { line = json.trim() }
  return line.length <= SAMPLE_LINE_MAX ? line : `${line.slice(0, SAMPLE_LINE_MAX - 1)}…`
}

function requestLine(entry: X402DirectoryEntry): string {
  const url = (() => { try { return new URL(entry.resource) } catch { return undefined } })()
  const target = url === undefined ? entry.resource : `${url.host}${url.pathname}`
  return `${entry.method ?? 'GET'} ${target}`
}

async function readTask(task: (typeof LANDING_TASKS)[number], pick: Pick): Promise<LandingTask> {
  // Search cards are compact; the full listing carries the provider's sample response.
  const full = await readX402DirectoryCatalogueResourceServer({ data: { resource: pick.entry.resource } })
    .catch(cause => degrade(cause, undefined, { site: 'landingTaskSample', reason: 'source_unavailable' }))
  const entry = full?.kind === 'found' || full?.kind === 'found_upstream' ? full.item.entry : pick.entry
  const sample = sampleText(entry.output?.exampleJson)
  const input = sample === undefined ? undefined : inputLine(entry.input?.exampleJson)
  return { id: task.id, title: task.title, entry: pick.entry, ...(sample === undefined ? { request: requestLine(entry) } : { sample }), ...(input === undefined ? {} : { input }) }
}

/** The directory's median USD price, shown in A$ at the reference rate the cards use. No fresh rate, no price stat. */
async function readMedianAud(medianUsd: string): Promise<{ value: number; decimals: number } | undefined> {
  const amount = parseDecimalExactAmount('USDC', medianUsd, 6)
  if (amount === undefined) return undefined
  const rate = await awaitBoundedRead(signal => readPersistedReferenceRate({ signal }), AbortSignal.timeout(SOURCE_READ_TIMEOUT_MS))
  if (rate === undefined) return undefined
  const label = formatDisplayPrice({ kind: 'indicative', amount, referenceRate: rate, validUntil: rate.fetchedAt + REFERENCE_RATE_MAX_AGE_MS })
  if (label?.startsWith('A$') !== true) return undefined
  const digits = label.slice(2)
  return { value: Number(digits), decimals: digits.split('.')[1]?.length ?? 0 }
}

async function readStats(): Promise<LandingStats | undefined> {
  const analytics = await readX402DirectoryAnalyticsServer({ data: {} })
  if (analytics.kind !== 'ok' || analytics.totalTools <= 0) return undefined
  const { price, totalTools } = analytics
  const known = DIRECTORY_PRICE_BANDS.filter(key => key !== 'unknown')
  const medianUsd = price.quantiles?.median
  const median = medianUsd === undefined ? undefined : await settle(readMedianAud(medianUsd), 'landingMedianAud', undefined)
  const medianBand = medianUsd === undefined ? -1 : known.findIndex(key => key === directoryPriceBand(medianUsd))
  return {
    totalTools,
    ...(median === undefined ? {} : {
      medianAud: median.value,
      medianDecimals: median.decimals,
      ...(price.knownPriceTools === 0 ? {} : { priceBins: known.map(key => price.bands.find(band => band.key === key)?.count ?? 0) }),
      ...(medianBand < 0 ? {} : { medianMarker: medianBand + 1 }),
    }),
  }
}

async function settle<T>(read: Promise<T>, site: string, fallback: T): Promise<T> {
  try { return await read }
  catch (cause) { return degrade(cause, fallback, { site, reason: 'source_unavailable' }) }
}

async function readFreshLanding(): Promise<LandingData> {
  const read = searcher()
  const [popularResults, rowResults, taskResults, stats] = await Promise.all([
    // The default browse, most used first: the same order /market opens on (market-route-data's readCatalogue).
    settle(readTwoPages({ sort: 'adoption' }), 'landingPopular', []),
    Promise.all(LANDING_ROWS.map(row => read(row.query))),
    Promise.all(LANDING_TASKS.map(task => read(task.query))),
    settle(readStats(), 'landingStats', undefined),
  ])
  const page: Curation = { taken: new Set(), titles: new Set(), perProvider: new Map() }
  // Popular picks first, so the grid is the directory's real top, one card per provider.
  const popular = pickTools(popularResults, page, POPULAR_COUNT, 1)
  claim(page, popular)
  // Tasks next, so each job shows its best tool; rows then skip what the page already shows.
  const taskPicks = LANDING_TASKS.flatMap((task, index) => {
    const picks = pickTools((taskResults[index] ?? []).slice(0, TASK_DEPTH), page, 1, TASK_CAP, task.terms)
    claim(page, picks)
    return picks.map(pick => ({ task, pick }))
  })
  // Rows are candidates in order of preference; the first that hold three relevant providers are shown.
  const rows: LandingRow[] = []
  LANDING_ROWS.forEach((row, index) => {
    if (rows.length === ROW_COUNT) return
    const picks = pickTools(rowResults[index] ?? [], page, ROW_SIZE, PAGE_CAP, row.terms)
    if (picks.length < ROW_MIN) return
    claim(page, picks)
    rows.push({ id: row.id, title: row.title, query: row.query, entries: picks.map(pick => pick.entry) })
  })
  const tasks = await Promise.all(taskPicks.map(({ task, pick }) => readTask(task, pick)))
  return { popular: popular.map(pick => pick.entry), rows, tasks, ...(stats === undefined ? {} : { stats }) }
}

/**
 * Stale-while-revalidate: the last good landing (or, before one exists, the last attempt) is served at once.
 * Refreshes are paced by the last attempt, not the last success, so a failing source never triggers one per request.
 */
let lastGood: { data: LandingData; at: number } | undefined
let lastTry: { data: LandingData; at: number } | undefined
let inFlight: Promise<LandingData> | undefined

/** An empty popular grid, or a sudden loss of every row or most tasks, is a directory hiccup, not the state of the index. */
const isGood = (data: LandingData) => data.popular.length > 0
  && data.popular.length >= Math.min(4, lastGood?.data.popular.length ?? 0)
  && data.rows.length >= Math.min(1, lastGood?.data.rows.length ?? 0)
  && data.tasks.length >= Math.min(3, lastGood?.data.tasks.length ?? 0)

async function readLanding(): Promise<LandingData> {
  const read = await readFreshLanding()
  // A missed live count keeps the last one rather than gating the cache on the analytics source.
  const stats = read.stats ?? lastGood?.data.stats
  const fresh: LandingData = stats === undefined ? read : { ...read, stats }
  lastTry = { data: fresh, at: Date.now() }
  if (isGood(fresh)) lastGood = lastTry
  return lastGood?.data ?? fresh
}

const refresh = () => (inFlight ??= readLanding().finally(() => { inFlight = undefined }))

/** One round trip for the whole landing: popular tools, rows, tasks with their samples, and live counts. Only the first visitor waits. */
export const readLandingServer = createServerFn({ method: 'GET' }).handler(async (): Promise<LandingData> => {
  if (lastTry === undefined) return refresh()
  if (Date.now() - lastTry.at >= (lastGood === undefined ? RETRY_MS : FRESH_MS)) {
    void refresh().catch(cause => degrade(cause, undefined, { site: 'landingRefresh', reason: 'source_unavailable' }))
  }
  return (lastGood ?? lastTry).data
})
