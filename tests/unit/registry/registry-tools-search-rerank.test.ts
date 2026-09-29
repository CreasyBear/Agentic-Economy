import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'

import { readCapabilityToolSearch } from '@/modules/capability-supply/tool-source'
import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import * as decisionEngine from '@/modules/decision-engine/public'
import { toolCatalogSearchInputSchema, type SearchEnvelope } from '@/modules/registry/tool-choice-contracts'
import { registryToolsSearchAction } from '@/modules/registry/tools.actions'
import { TIMEZONE_QUERY, TOOL_CRYPTO_TX, TOOL_TIMEZONE, jevAnswersForTool, misorderedSearchResult, mockFailedJevFetch, mockSearchTool } from '../../helpers/tool-search-rerank-fixtures'

vi.mock('@/modules/capability-supply/tool-source', () => ({
  readCapabilityToolSearch: vi.fn(), readCapabilityToolDetail: vi.fn(), readCapabilityToolCompare: vi.fn(),
}))

const noCandidates = (query: string) => ({
  kind: 'no_candidates' as const, schemaVersion: 'registry-tools:v3' as const,
  query, appliedFilters: {}, matchedCount: 0, ranking: [], navigation: [],
})
type DirectoryRow = {
  id: string
  title: string
  summary: string
  provider: string
  actionClass: string
  objectClass: string
  completedAt: number
  category?: string
  minimumUsdPrice?: string
}
const directoryRow = (id: string): DirectoryRow => ({
  id, title: 'Timezone conversion', summary: 'Convert a time between cities', provider: 'Open source',
  actionClass: 'transform', objectClass: 'location', completedAt: Date.now(),
})
let directoryRows: DirectoryRow[] = []
let directoryAvailable = true
let directoryRefreshState: 'complete' | 'failed' = 'complete'

async function runSearch(query: string, options: Record<string, unknown> = {}, request?: Request) {
  const data = toolCatalogSearchInputSchema.parse({ query, ...options })
  return registryToolsSearchAction.run({ data, context: { caller: 'http', ...(request === undefined ? {} : { request }) } })
}

async function collectSearchPages(first: SearchEnvelope, options: Record<string, unknown>) {
  const rows = [...first.results]
  let page = first
  for (let count = 0; page.pagination.hasMore && count < 12; count++) {
    expect(page.next[0]).toMatchObject({ action: 'next-page', args: { query: 'timezone conversion', cursor: page.pagination.nextCursor } })
    page = await runSearch('timezone conversion', { ...options, cursor: page.pagination.nextCursor })
    expect(new TextEncoder().encode(JSON.stringify(page)).length).toBeLessThanOrEqual(16 * 1024)
    rows.push(...page.results)
  }
  expect(page.pagination.hasMore).toBe(false)
  return rows
}
function mockDirectoryAssessment(score = 0.94) {
  vi.spyOn(decisionEngine, 'executeDecisionGateway').mockImplementation(async request => ({
    tier: 'jev_system_one', model: '~typesafe/jev-latest',
    answers: Object.fromEntries(Object.keys(request.questions).map(key => [key, { type: 'noul', noul: score }])) as never,
    usage: { inputTokens: 160, outputTokens: 0, estimatedCostAud: null },
    durationMs: 40, attemptedTiers: ['jev_system_one'],
  }))
}


describe('registry.tools.search mixed assessment', () => {
  beforeEach(() => {
    directoryRows = []
    directoryAvailable = true
    directoryRefreshState = 'complete'
    const completedAt = Date.now() - 60_000
    setPublicSourceTransportForTests({
      query: vi.fn(async (ref: unknown, args: { paginationOpts?: { cursor: string | null; numItems: number } }) => {
        const name = getFunctionName(ref as never)
        if (name === 'capabilitySupplyProjection:latestReconcileBusinessSupplyProjectionsCompletion') return completedAt
        if (name === 'x402DirectoryIndex:status') return directoryAvailable
          ? { kind: 'ready', refreshState: directoryRefreshState, coverage: { generation: 'g1', completedAt } }
          : { kind: 'unavailable', refreshState: 'failed' }
        if (name === 'x402DirectoryIndex:searchCompact') {
          if (!directoryAvailable) return { kind: 'unavailable', reason: 'index_unavailable' }
          const start = Number(args.paginationOpts?.cursor ?? 0)
          const end = Math.min(start + (args.paginationOpts?.numItems ?? 0), directoryRows.length)
          return { kind: 'ok', coverage: { generation: 'g1', completedAt },
            page: directoryRows.slice(start, end), continueCursor: String(end), isDone: end === directoryRows.length }
        }
        if (name === 'referenceRateRefresh:current') return null
        throw new Error(`Unexpected source query ${name}`)
      }),
      mutation: vi.fn(), action: vi.fn(),
    } as never)
  })
  afterEach(() => {
    setPublicSourceTransportForTests(undefined)
    vi.mocked(readCapabilityToolSearch).mockReset()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('shares the proven 200-character Market and Agent search bound', () => {
    expect(toolCatalogSearchInputSchema.safeParse({ query: 'x'.repeat(200) }).success).toBe(true)
    expect(toolCatalogSearchInputSchema.safeParse({ query: 'x'.repeat(201) }).success).toBe(false)
  })

  it('scores the entire bounded admitted inventory so a synonymous Tool is not discarded by lexical retrieval', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue({ ...misorderedSearchResult(''), query: '', pagination: { limit: 20, hasMore: false } })
    vi.spyOn(decisionEngine, 'executeDecisionGateway').mockResolvedValue({
      tier: 'jev_system_one', model: '~typesafe/jev-latest',
      answers: jevAnswersForTool(TOOL_CRYPTO_TX.toolRef, [0.04, 0.94, 0.02]) as never,
      usage: { inputTokens: 160, outputTokens: 0, estimatedCostAud: null },
      durationMs: 40, attemptedTiers: ['jev_system_one'],
    })
    const result = await runSearch('find wallet token movements')
    expect(readCapabilityToolSearch).toHaveBeenCalledWith({ query: '', limit: 20, source: 'current' })
    expect(result.kind).toBe('match')
    if (result.kind !== 'match') return
    expect(result.results[0]).toMatchObject({ id: TOOL_CRYPTO_TX.toolRef, toolRef: TOOL_CRYPTO_TX.toolRef, access: 'ae_callable' })
    expect(result.results[0]?.next).toEqual([{ action: 'describe', args: { toolRef: TOOL_CRYPTO_TX.toolRef }, authority: 'public' }])
    expect(result).not.toHaveProperty('groups')
    expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThanOrEqual(16 * 1024)
  })

  it('returns an assessed external-only Bazaar entry as a match without claiming AE callability', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(noCandidates(''))
    directoryRows = [{ ...directoryRow('directory-1'), minimumUsdPrice: '0.002000' }]
    mockDirectoryAssessment()
    const result = await runSearch('timezone conversion')
    expect(result).toMatchObject({ kind: 'match', assessed: { source: 'all', coverage: 'partial' },
      results: [{ id: 'directory-1', access: 'external_listing', sourcePrice: '0.002000 USDC',
        price: { kind: 'indicative', label: 'US$0.002' },
        next: [{ action: 'describe-external', args: { id: 'directory-1' } }] }] })
    expect(result.next).toEqual([{ action: 'broaden', args: { query: 'timezone conversion' }, authority: 'public' }])
  })

  it('never displays an unrelated Bazaar lexical hit for an impossible need', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(noCandidates(''))
    directoryRows = [directoryRow('unrelated-1')]
    mockDirectoryAssessment(0.02)
    const result = await runSearch('deliver a sandwich on Jupiter')
    expect(result).toMatchObject({ kind: 'scoped', results: [], assessed: { examined: 1, coverage: 'partial' } })
  })

  it('falls back to indexed Bazaar candidates when semantic ranking times out', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(noCandidates(''))
    directoryRows = [directoryRow('unassessed-1')]
    vi.spyOn(decisionEngine, 'executeDecisionGateway').mockRejectedValue(new decisionEngine.JevUnavailableError('timeout'))
    const result = await runSearch('timezone conversion', { source: 'coinbase' })
    expect(result).toMatchObject({ kind: 'match', results: [{ id: 'unassessed-1' }] })
  })

  it('keeps the indexed Bazaar search path usable when Jev responds HTTP 500', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(noCandidates(''))
    directoryRows = [directoryRow('indexed-timezone')]
    vi.stubEnv('TYPESAFE_API_KEY', 'ts-local-injected-fault')
    const jev = mockFailedJevFetch(500)
    vi.stubGlobal('fetch', jev)
    const result = await runSearch('timezone conversion', { source: 'coinbase' })
    expect(jev).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ kind: 'match', results: [{ id: 'indexed-timezone' }] })
  })

  it('uses indexed Bazaar candidates if semantic classification is incomplete', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(noCandidates(''))
    directoryRows = [directoryRow('unassessed-1'), directoryRow('unassessed-2')]
    vi.spyOn(decisionEngine, 'executeDecisionGateway').mockResolvedValue({
      tier: 'jev_system_one', model: '~typesafe/jev-latest',
      answers: { match_0: { type: 'noul', noul: 0.99 } } as never,
      usage: { inputTokens: null, outputTokens: null, estimatedCostAud: null },
      durationMs: 40, attemptedTiers: ['jev_system_one'],
    })
    expect(await runSearch('timezone conversion', { source: 'coinbase' })).toMatchObject({ kind: 'match', results: [{ id: 'unassessed-1' }, { id: 'unassessed-2' }] })
  })

  it('reports a failed refresh on a still-queryable directory result', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(noCandidates(''))
    directoryRows = [directoryRow('directory-1')]
    directoryRefreshState = 'failed'
    mockDirectoryAssessment()
    const result = await runSearch('timezone conversion', { source: 'coinbase' })
    expect(result.results[0]).toMatchObject({
      id: 'directory-1', freshness: { source: 'x402_directory', state: 'failed' },
    })
  })

  it('returns exhaustive no-match only for an explicitly selected fully assessed current inventory', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(noCandidates(''))
    const result = await runSearch('impossible request', { source: 'current' })
    expect(result).toMatchObject({ kind: 'noMatch', assessed: { source: 'current', scope: 'complete', coverage: 'complete' }, results: [] })
    const all = await runSearch('impossible request')
    expect(all.kind).toBe('scoped')
  })

  it('never turns an unassessed lexical tail into an exhausted no-match', async () => {
    vi.mocked(readCapabilityToolSearch)
      .mockResolvedValueOnce({ ...misorderedSearchResult(''), query: '', pagination: { limit: 20, hasMore: true } })
      .mockResolvedValueOnce(noCandidates('missing synonym'))
    const result = await runSearch('missing synonym')
    expect(result).toMatchObject({ kind: 'scoped', partialResults: true, results: [] })
  })

  it('uses admitted provider facts and explicit unclassified facets without inventing a category or price band', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue({
      ...misorderedSearchResult(''), items: [TOOL_CRYPTO_TX], pagination: { limit: 20, hasMore: false },
    })
    vi.spyOn(decisionEngine, 'executeDecisionGateway').mockResolvedValue({
      tier: 'jev_system_one', model: '~typesafe/jev-latest',
      answers: { match_0: { type: 'noul', noul: 0.94 } } as never,
      usage: { inputTokens: 160, outputTokens: 0, estimatedCostAud: null },
      durationMs: 40, attemptedTiers: ['jev_system_one'],
    })
    const known = await runSearch('wallet transfers', { source: 'current',
      filters: { provider: 'Provider Corp', actionClass: 'unclassified', objectClass: 'unclassified', priceBand: 'unknown' } })
    expect(known).toMatchObject({ kind: 'match', results: [{ toolRef: TOOL_CRYPTO_TX.toolRef,
      actionClass: 'unclassified', objectClass: 'unclassified' }] })
    const wrongProvider = await runSearch('wallet transfers', { source: 'current', filters: { provider: 'Other Corp' } })
    expect(wrongProvider).toMatchObject({ kind: 'noMatch', results: [] })
  })

  it.each([
    { actionClass: 'retrieve' }, { objectClass: 'chain' }, { category: 'crypto' }, { priceBand: 'lt_0_01' },
  ])('does not claim exhaustive no-match for an unclassified admitted facet: %j', async filters => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue({
      ...misorderedSearchResult(''), items: [TOOL_CRYPTO_TX], pagination: { limit: 20, hasMore: false },
    })
    const result = await runSearch('wallet transfers', { source: 'current', filters })
    expect(result).toMatchObject({ kind: 'scoped', partialResults: true,
      assessed: { source: 'current', scope: 'page', coverage: 'partial', examined: 1 }, results: [] })
  })

  it('keeps Bazaar facet results navigable when admitted category is unclassified', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue({
      ...misorderedSearchResult(''), items: [TOOL_CRYPTO_TX], pagination: { limit: 20, hasMore: false },
    })
    directoryRows = [{ ...directoryRow('directory-category'), category: 'locations' }]
    mockDirectoryAssessment()
    const result = await runSearch('timezone conversion', { filters: { category: 'locations' } })
    expect(result).toMatchObject({ kind: 'match', assessed: { source: 'all', coverage: 'partial', examined: 2 },
      results: [{ id: 'directory-category', access: 'external_listing', category: 'locations' }] })
  })

  it('continues a partial admitted search past a provider-filtered page instead of declaring no-match', async () => {
    vi.mocked(readCapabilityToolSearch).mockImplementation(async input => {
      if (input.limit === undefined) throw new Error('Expected an explicit search limit')
      if (input.query === '') return { ...misorderedSearchResult(''), items: [],
        pagination: { limit: 20, hasMore: true, nextCursor: 'pool' } }
      const item = input.cursor === undefined
        ? { ...TOOL_TIMEZONE, business: { ...TOOL_TIMEZONE.business, name: 'Other Corp', slug: 'other' } }
        : TOOL_CRYPTO_TX
      return { ...misorderedSearchResult(input.query), items: [item],
        pagination: { limit: input.limit, hasMore: input.cursor === undefined,
          ...(input.cursor === undefined ? { nextCursor: 'second' } : {}) } }
    })
    vi.spyOn(decisionEngine, 'executeDecisionGateway').mockResolvedValue({
      tier: 'jev_system_one', model: '~typesafe/jev-latest',
      answers: { match_0: { type: 'noul', noul: 0.94 } } as never,
      usage: { inputTokens: 160, outputTokens: 0, estimatedCostAud: null },
      durationMs: 40, attemptedTiers: ['jev_system_one'],
    })
    const options = { source: 'current', filters: { provider: 'Provider Corp' } }
    const first = await runSearch('timezone conversion', options)
    expect(first).toMatchObject({ kind: 'scoped', results: [], assessed: { examined: 1 },
      pagination: { hasMore: true } })
    const second = await runSearch('timezone conversion', { ...options, cursor: first.pagination.nextCursor })
    expect(second).toMatchObject({ kind: 'match', results: [{ toolRef: TOOL_CRYPTO_TX.toolRef }],
      pagination: { hasMore: false } })
    expect(readCapabilityToolSearch).toHaveBeenCalledWith({
      query: 'timezone conversion', source: 'current', limit: 8, cursor: 'second', filters: {},
    })
  })

  it('shrinks an oversized external page and resumes at its first omitted index row', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(noCandidates(''))
    directoryRows = Array.from({ length: 12 }, (_, index) => directoryRow(`directory-${index}-${'x'.repeat(1600)}`))
    mockDirectoryAssessment()
    const first = await runSearch('timezone conversion', { source: 'coinbase', limit: 12 })
    expect(first.kind).toBe('match')
    expect(new TextEncoder().encode(JSON.stringify(first)).length).toBeLessThanOrEqual(16 * 1024)
    expect(first.results.length).toBeGreaterThan(0)
    expect(first.results.length).toBeLessThan(12)
    expect(first.pagination).toMatchObject({ limit: 12, hasMore: true })
    expect((await collectSearchPages(first, { source: 'coinbase', limit: 12 })).map(row => row.id)).toEqual(directoryRows.map(row => row.id))
  })

  it('preserves admitted-to-external continuation when the mixed page must shrink', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue({
      ...misorderedSearchResult(''), items: [TOOL_CRYPTO_TX], pagination: { limit: 20, hasMore: false },
    })
    mockDirectoryAssessment()
    directoryRows = Array.from({ length: 11 }, (_, index) => directoryRow(`directory-${index}-${'x'.repeat(1600)}`))
    const first = await runSearch('timezone conversion', { limit: 12 })
    expect(first.kind).toBe('match')
    expect(first.results[0]?.id).toBe(TOOL_CRYPTO_TX.toolRef)
    expect(new TextEncoder().encode(JSON.stringify(first)).length).toBeLessThanOrEqual(16 * 1024)
    expect(first.pagination).toMatchObject({ limit: 12, hasMore: true })
    expect((await collectSearchPages(first, { limit: 12 })).map(row => row.id)).toEqual([
      TOOL_CRYPTO_TX.toolRef, ...directoryRows.map(row => row.id),
    ])
  })

  it('shrinks the complete admitted pool without scoring it again for the same request', async () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      ...mockSearchTool(
        `operation:v1:${index.toString(16).padStart(64, '0')}`, `time.${index}`, 'Timezone conversion', 'Convert time zones',
      ),
      commercial: { ...TOOL_CRYPTO_TX.commercial, displayPrice: {
        kind: 'indicative' as const, amount: { currency: 'AUD', units: '9'.repeat(1600), exponent: 2 },
        rateObservedAt: Date.now(), validUntil: Date.now() + 60_000,
      } },
    }))
    vi.mocked(readCapabilityToolSearch).mockResolvedValue({
      ...misorderedSearchResult(''), items, pagination: { limit: 20, hasMore: false },
    })
    const ranker = vi.spyOn(decisionEngine, 'executeDecisionGateway').mockResolvedValue({
      tier: 'jev_system_one', model: '~typesafe/jev-latest',
      answers: Object.fromEntries(items.map((_, index) => [`match_${index}`, { type: 'noul', noul: 0.94 }])) as never,
      usage: { inputTokens: 160, outputTokens: 0, estimatedCostAud: null },
      durationMs: 40, attemptedTiers: ['jev_system_one'],
    })
    const first = await runSearch('timezone conversion', { source: 'current', limit: 12 })
    expect(first.kind).toBe('match')
    expect(new TextEncoder().encode(JSON.stringify(first)).length).toBeLessThanOrEqual(16 * 1024)
    expect(first.results.length).toBeLessThan(12)
    expect(first.pagination).toMatchObject({ limit: 12, hasMore: true })
    expect(ranker).toHaveBeenCalledTimes(1)
    expect(readCapabilityToolSearch).toHaveBeenCalledTimes(1)
    const second = await runSearch('timezone conversion', { source: 'current', limit: 12, cursor: first.pagination.nextCursor })
    expect([...first.results, ...second.results].map(row => row.id)).toEqual(items.map(item => item.toolRef))
    expect(second.pagination.hasMore).toBe(false)
  })

  it('re-queries a partial admitted page at its reduced fetch size before issuing its cursor', async () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      ...mockSearchTool(
        `operation:v1:${index.toString(16).padStart(64, '0')}`, `time.${index}`, 'Timezone conversion', 'Convert time zones',
      ),
      commercial: { ...TOOL_CRYPTO_TX.commercial, displayPrice: {
        kind: 'indicative' as const, amount: { currency: 'AUD', units: '9'.repeat(1600), exponent: 2 },
        rateObservedAt: Date.now(), validUntil: Date.now() + 60_000,
      } },
    }))
    vi.mocked(readCapabilityToolSearch).mockImplementation(async input => {
      if (input.limit === undefined) throw new Error('Expected an explicit search limit')
      if (input.query === '') return { ...misorderedSearchResult(''), items: [],
        pagination: { limit: 20, hasMore: true, nextCursor: 'pool' } }
      const start = Number(input.cursor ?? 0)
      const end = Math.min(start + input.limit, items.length)
      return { ...misorderedSearchResult(input.query), items: items.slice(start, end),
        pagination: { limit: input.limit, hasMore: end < items.length, ...(end < items.length ? { nextCursor: String(end) } : {}) } }
    })
    vi.spyOn(decisionEngine, 'executeDecisionGateway').mockResolvedValue({
      tier: 'jev_system_one', model: '~typesafe/jev-latest',
      answers: Object.fromEntries(items.map((_, index) => [`match_${index}`, { type: 'noul', noul: 0.94 }])) as never,
      usage: { inputTokens: 160, outputTokens: 0, estimatedCostAud: null },
      durationMs: 40, attemptedTiers: ['jev_system_one'],
    })
    const first = await runSearch('timezone conversion', { source: 'current', limit: 12 })
    expect(first.kind).toBe('match')
    expect(first.results.length).toBeLessThan(12)
    expect(first.pagination).toMatchObject({ limit: 12, hasMore: true })
    expect(readCapabilityToolSearch).toHaveBeenCalledWith({ query: 'timezone conversion',
      limit: first.results.length, source: 'current' })
    expect((await collectSearchPages(first, { source: 'current', limit: 12 })).map(row => row.id))
      .toEqual(items.map(item => item.toolRef))
  })

  it('returns capacity_exceeded without a continuation when one admitted result cannot fit the byte budget', async () => {
    const oversized = {
      ...mockSearchTool(`operation:v1:${'a'.repeat(64)}`, 'huge.time', 'Timezone conversion', 'Convert time zones'),
      commercial: { ...TOOL_CRYPTO_TX.commercial, displayPrice: {
        kind: 'indicative' as const, amount: { currency: 'AUD', units: '9'.repeat(20_000), exponent: 2 },
        rateObservedAt: Date.now(), validUntil: Date.now() + 60_000,
      } },
    }
    vi.mocked(readCapabilityToolSearch).mockResolvedValue({
      ...misorderedSearchResult(''), items: [oversized], pagination: { limit: 20, hasMore: false },
    })
    vi.spyOn(decisionEngine, 'executeDecisionGateway').mockResolvedValue({
      tier: 'jev_system_one', model: '~typesafe/jev-latest',
      answers: { match_0: { type: 'noul', noul: 0.94 } } as never,
      usage: { inputTokens: 160, outputTokens: 0, estimatedCostAud: null },
      durationMs: 40, attemptedTiers: ['jev_system_one'],
    })
    const result = await runSearch('timezone conversion', { source: 'current', limit: 1 })
    expect(result).toMatchObject({
      kind: 'unavailable', reason: 'capacity_exceeded', results: [], partialResults: true,
      pagination: { limit: 1, hasMore: false },
      next: [{ action: 'retry', args: { query: 'timezone conversion' } }],
    })
    expect(result.pagination).not.toHaveProperty('nextCursor')
    expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThanOrEqual(16 * 1024)
  })

  it('does not claim a partial lexical overlap answers an impossible need when the ranker times out', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(misorderedSearchResult(''))
    vi.spyOn(decisionEngine, 'executeDecisionGateway').mockRejectedValue(new decisionEngine.JevUnavailableError('timeout'))
    const result = await runSearch('convert timezone to red unicorn weather', { source: 'current' })
    expect(result.kind).toBe('noMatch')
    expect(result.results).toEqual([])
  })

  it('keeps admitted search working without a directory generation or semantic ranker', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(misorderedSearchResult(TIMEZONE_QUERY))
    directoryAvailable = false
    vi.spyOn(decisionEngine, 'executeDecisionGateway').mockRejectedValue(new decisionEngine.JevUnavailableError('timeout'))
    expect(await runSearch(TIMEZONE_QUERY)).toMatchObject({ kind: 'match', results: [{ toolRef: TOOL_TIMEZONE.toolRef }] })
  })
})
