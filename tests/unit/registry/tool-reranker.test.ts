import { describe, expect, it, vi } from 'vitest'

import { deserializeToolSearchResult, serializeToolSearchResult, type ToolSearchResult } from '@/modules/capability-supply/public'
import { projectToolListChoices, projectToolSearchChoices } from '@/modules/registry/tool-choice-contracts'
import * as decisionEngine from '@/modules/decision-engine/public'
import { lexicalToolMatch, rerankToolSearchResult } from '@/modules/registry/tool-reranker'
import {
  ERC20_QUERY,
  TIMEZONE_QUERY,
  TOOL_CRYPTO_TX,
  TOOL_CURRENCY,
  TOOL_TIMEZONE,
  jevAnswersForTool,
  misorderedSearchResult,
  mockFailedJevFetch,
  mockJevFetch,
} from '../../helpers/tool-search-rerank-fixtures'

describe('Jev x402 Tool Search Re-ranker (cookbooks/rerank_typesafe.md)', () => {
  const sampleOkResult = misorderedSearchResult('verify blockchain payment on base')

  it('keeps an unverified testnet Tool inspectable without offering a Quote from search', () => {
    const tool = {
      ...TOOL_CURRENCY,
      availability: { posture: 'routeable' as const, reason: 'inspection_required' as const },
      payment: { protocol: 'x402' as const, scheme: 'exact' as const, network: 'eip155:84532', asset: 'USDC', currency: 'USDC' },
    }
    const output = projectToolSearchChoices({
      kind: 'ok', schemaVersion: 'registry-tools:v3', query: 'weather',
      items: [tool], ranking: [], pagination: { limit: 10, hasMore: false }, navigation: [],
    }, undefined, { verdict: 'matched', nearMisses: [] })
    expect(output.kind).toBe('match')
    if (output.kind !== 'match') return
    expect(output.results[0]).toMatchObject({
      readiness: 'unverified',
      next: [{ action: 'registry.tools.describe', args: { toolRef: tool.toolRef } }],
    })
    expect(output).not.toHaveProperty('recommendation')
  })
  it.each([
    { access: 'external_listing' }, { effects: ['data_release'] }, { dataUse: ['sensitive'] },
    { currency: 'USD' }, { maximumPrice: { currency: 'AUD', units: '1', exponent: 6 } },
    { healthStatus: ['degraded'] }, { actionClass: 'retrieve' },
  ])('rechecks hard constraints on admitted descriptors at projection: %j', filters => {
    const result = projectToolSearchChoices({ ...misorderedSearchResult('timezone conversion'), items: [TOOL_TIMEZONE] },
      filters, { verdict: 'matched', nearMisses: [] })
    expect(result.results).toEqual([])
    expect(projectToolListChoices({ ...misorderedSearchResult(''), items: [TOOL_TIMEZONE] }, filters))
      .toMatchObject({ kind: 'ok', items: [] })
  })

  it('keeps admitted candidates that have the required contract facts', () => {
    const tool = { ...TOOL_TIMEZONE,
      effects: [{ effectId: 'release', class: 'data_release' as const, authority: 'none' as const, reversibility: 'irreversible' as const }],
      dataUse: [{ effectId: 'release', inputPointer: '/query', classification: 'public' as const,
        phase: 'execution' as const, recipient: 'selected_binding' as const, purposes: ['lookup'] }],
    }
    const result = projectToolSearchChoices({ ...misorderedSearchResult('timezone conversion'), items: [tool] },
      { access: 'ae_callable', effects: ['data_release'], dataUse: ['public'], healthStatus: ['operational'],
        currency: 'AUD', maximumPrice: { currency: 'AUD', units: '1000', exponent: 6 } },
      { verdict: 'matched', nearMisses: [] })
    expect(result).toMatchObject({ kind: 'match', results: [{ toolRef: tool.toolRef }] })
  })

  it('reports missing geographic evidence even when a Provider name resembles the requested location', () => {
    const tool = { ...TOOL_TIMEZONE, business: { ...TOOL_TIMEZONE.business, name: 'Sydney', slug: 'sydney' } }
    const result = projectToolSearchChoices({ ...misorderedSearchResult('timezone conversion'), items: [tool] },
      { location: 'Sydney' }, { verdict: 'matched', nearMisses: [] }, undefined, 8, { source: 'current', complete: true })
    expect(result).toMatchObject({ kind: 'scoped', results: [], partialResults: true,
      assessed: { coverage: 'partial' }, reason: 'Required location evidence is unavailable in the assessed supply.' })
  })

  it('rechecks explicit health on appended external rows while preserving their opaque identity when unconstrained', () => {
    const row = {
      id: 'opaque:directory:identity', source: 'coinbase' as const, access: 'external_listing' as const,
      title: 'Timezone conversion', summary: 'Convert between timezones', provider: 'Provider',
      actionClass: 'transform' as const, objectClass: 'location' as const, readiness: 'unverified' as const,
      price: { kind: 'unavailable' as const }, detailRef: '/api/v1/registry/detail?id=opaque',
      next: [],
    }
    const source = { ...misorderedSearchResult('timezone conversion'), items: [] }
    const context = { source: 'coinbase' as const, external: [row], externalExamined: 1 }
    expect(projectToolSearchChoices(source, { healthStatus: ['operational'] }, { verdict: 'matched', nearMisses: [] }, undefined, 8, context))
      .toMatchObject({ kind: 'scoped', results: [], assessed: { examined: 1 } })
    expect(projectToolSearchChoices(source, undefined, { verdict: 'matched', nearMisses: [] }, undefined, 8, context))
      .toMatchObject({ kind: 'match', results: [{ id: row.id, next: row.next }] })
  })

  it('uses a USD price label for USDC without AUD evidence', () => {
    const tool = {
      ...TOOL_CURRENCY,
      commercial: { ...TOOL_CURRENCY.commercial, price: { kind: 'fixed' as const, amount: { currency: 'USDC' as const, units: '1', exponent: 6 } } },
    }
    const source = { kind: 'ok' as const, schemaVersion: 'registry-tools:v3' as const, query: 'fx', items: [tool], ranking: [], pagination: { limit: 10, hasMore: false }, navigation: [] }
    const result = projectToolSearchChoices(source, undefined, { verdict: 'matched', nearMisses: [] })
    expect(result.kind).toBe('match')
    if (result.kind === 'match') expect(result.results[0]?.price).toEqual({ kind: 'unavailable' })
    const list = projectToolListChoices(source)
    if (list.kind === 'ok') expect(list.items[0]?.priceLabel).toBe('US$0.000001')
    const rangeTool = {
      ...tool,
      commercial: {
        ...tool.commercial,
        price: {
          kind: 'range' as const,
          minimum: { currency: 'USDC' as const, units: '1', exponent: 6 },
          maximum: { currency: 'USDC' as const, units: '2000', exponent: 6 },
        },
      },
    }
    const rangeList = projectToolListChoices({ ...source, items: [rangeTool] })
    if (rangeList.kind === 'ok') expect(rangeList.items[0]?.priceLabel).toBe('US$0.000001–US$0.002')
  })

  it('never advertises a cursor on an unavailable result even when a preceding page had one', () => {
    const result = projectToolSearchChoices({
      kind: 'unavailable', schemaVersion: 'registry-tools:v3', reason: 'source_unavailable', navigation: [],
    }, undefined, { verdict: 'noMatch', nearMisses: [] }, undefined, 2, {
      query: 'weather', source: 'current',
      pagination: { limit: 2, hasMore: true, nextCursor: 'no-longer-usable' },
    })
    expect(result).toMatchObject({ kind: 'unavailable', pagination: { limit: 2, hasMore: false }, next: [{ action: 'registry.tools.search' }] })
    expect(result.pagination).not.toHaveProperty('nextCursor')
  })



  it('finds a one-word Tool need during a ranker outage without accepting an unrelated multi-word need', () => {
    expect(lexicalToolMatch('timezone', 'Timezone Converter', 'Convert between IANA time zones')).toBe(true)
    expect(lexicalToolMatch('convert timezone to red unicorn weather', 'Timezone Converter', 'Convert between IANA time zones')).toBe(false)
  })

  it('preserves search result untouched when query is empty, whitespace, disabled, or items <= 1', async () => {
    await expect(rerankToolSearchResult(sampleOkResult, '')).resolves.toBe(sampleOkResult)
    await expect(rerankToolSearchResult(sampleOkResult, '   ')).resolves.toBe(sampleOkResult)
    await expect(rerankToolSearchResult(sampleOkResult, ERC20_QUERY, { disableRerank: true })).resolves.toBe(sampleOkResult)

    const singleItemResult: ToolSearchResult = {
      kind: 'ok',
      schemaVersion: 'registry-tools:v3',
      query: sampleOkResult.query,
      items: [TOOL_CRYPTO_TX],
      ranking: [],
      pagination: { limit: 10, hasMore: false },
      navigation: [],
    }
    await expect(rerankToolSearchResult(singleItemResult, 'test query')).resolves.toBe(singleItemResult)
  })

  it('returns unavailable and no_candidates results without calling the Decision Gateway', async () => {
    const gateway = vi.spyOn(decisionEngine, 'executeDecisionGateway')
    const unavailable: ToolSearchResult = {
      kind: 'unavailable',
      schemaVersion: 'registry-tools:v3',
      reason: 'source_unavailable',
      navigation: [],
    }
    const empty: ToolSearchResult = {
      kind: 'no_candidates',
      schemaVersion: 'registry-tools:v3',
      query: ERC20_QUERY,
      appliedFilters: {},
      ranking: [],
      navigation: [],
    }

    await expect(rerankToolSearchResult(unavailable, ERC20_QUERY)).resolves.toBe(unavailable)
    await expect(rerankToolSearchResult(empty, ERC20_QUERY)).resolves.toBe(empty)
    expect(gateway).not.toHaveBeenCalled()
    gateway.mockRestore()
  })

  it('Tier 1: re-ranks candidate tools using TypeSafe Jev System One response', async () => {
    const reranked = await rerankToolSearchResult(
      sampleOkResult,
      'verify blockchain payment on base',
      {
        openrouterApiKey: 'test-key',
        fetchImpl: mockJevFetch(jevAnswersForTool('operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', [0.05, 0.96, 0.25])),
      },
    )

    expect(reranked.kind).toBe('ok')
    if (reranked.kind !== 'ok') return

    expect(reranked.items[0]?.toolRef).toBe('operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(reranked.ranking).toHaveLength(3)
    expect(reranked.ranking[0]).toEqual({
      toolRef: 'operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      rank: 1,
      score: 0.96,
    })
    expect(reranked.ranking[1]?.toolRef).toBe('operation:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')
    expect(reranked.ranking[2]?.toolRef).toBe('operation:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
  })

  it('sorts the ERC-20 transfer tool to rank 1 for a transfer-lookup query', async () => {
    const reranked = await rerankToolSearchResult(
      misorderedSearchResult(ERC20_QUERY),
      ERC20_QUERY,
      {
        openrouterApiKey: 'test-key',
        fetchImpl: mockJevFetch(jevAnswersForTool('operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', [0.08, 0.94, 0.11])),
      },
    )

    expect(reranked.kind).toBe('ok')
    if (reranked.kind !== 'ok') return
    expect(reranked.items.map((item) => item.toolRef)).toEqual([
      'operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'operation:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'operation:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ])
    expect(reranked.ranking[0]).toEqual({
      toolRef: 'operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      rank: 1,
      score: 0.94,
    })
  })

  it('sorts the timezone converter to rank 1 for a London-to-Sydney query', async () => {
    const reranked = await rerankToolSearchResult(
      misorderedSearchResult(TIMEZONE_QUERY),
      TIMEZONE_QUERY,
      {
        openrouterApiKey: 'test-key',
        fetchImpl: mockJevFetch(jevAnswersForTool('operation:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', [0.97, 0.04, 0.06])),
      },
    )

    expect(reranked.kind).toBe('ok')
    if (reranked.kind !== 'ok') return
    expect(reranked.items[0]?.toolRef).toBe('operation:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
    expect(reranked.ranking[0]).toEqual({
      toolRef: 'operation:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      rank: 1,
      score: 0.97,
    })
  })

  it('uses complete relevance answers without requiring a forced winner', async () => {
    const fetchImpl = mockJevFetch({
      match_0: { type: 'noul', noul: 0.1 },
      match_1: { type: 'noul', noul: 0.9 },
      match_2: { type: 'noul', noul: 0.2 },
    })
    const result = await rerankToolSearchResult(sampleOkResult, ERC20_QUERY, { openrouterApiKey: 'test-key', fetchImpl })
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.items.map(item => item.toolRef)).toEqual([TOOL_CRYPTO_TX.toolRef, TOOL_CURRENCY.toolRef, TOOL_TIMEZONE.toolRef])
    expect(result.pagination).toEqual(sampleOkResult.pagination)
    expect(result.items[0]).toBe(TOOL_CRYPTO_TX)
  })

  it.each([0, 0.5, 1])('preserves retrieval order for tied relevance %s without manufacturing a winner', async score => {
    const result = await rerankToolSearchResult(sampleOkResult, ERC20_QUERY, {
      openrouterApiKey: 'test-key',
      fetchImpl: mockJevFetch(jevAnswersForTool(TOOL_CRYPTO_TX.toolRef, [score, score, score])),
    })
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.items).toEqual(sampleOkResult.items)
    expect(result.ranking.map(item => item.score)).toEqual([score, score, score])
  })

  it('classifies every candidate and disables the frontier-LLM fallback', async () => {
    const gateway = vi.spyOn(decisionEngine, 'executeDecisionGateway').mockResolvedValue({
      tier: 'jev_system_one',
      model: '~typesafe/jev-latest',
      answers: {
        match_0: { type: 'noul', noul: 0.1 },
        match_1: { type: 'noul', noul: 0.9 },
        match_2: { type: 'noul', noul: 0.2 },
        best_match: {
          type: 'choice',
          choice: 'operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          confidence: 0.9,
          probabilities: { 'operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': 0.9 },
        },
      },
      usage: { inputTokens: 10, outputTokens: 0, estimatedCostAud: 'A$0.000000' },
      durationMs: 12,
      attemptedTiers: ['jev_system_one'],
    })

    await rerankToolSearchResult(misorderedSearchResult(ERC20_QUERY), ERC20_QUERY)

    expect(gateway).toHaveBeenCalledOnce()
    const request = gateway.mock.calls[0]?.[0]
    expect(request?.state).toMatchObject({
      query: ERC20_QUERY,
      candidates: [
        { toolRef: TOOL_TIMEZONE.toolRef, capabilityId: 'timezone.convert' },
        { toolRef: TOOL_CRYPTO_TX.toolRef, capabilityId: 'crypto.tx.lookup' },
        { toolRef: TOOL_CURRENCY.toolRef, capabilityId: 'currency.fx.rates' },
      ],
    })
    expect(request?.questions.match_0?.type).toBe('noul')
    expect(request?.questions.match_1?.type).toBe('noul')
    expect(request?.questions.match_2?.type).toBe('noul')
    expect(Object.keys(request?.questions ?? {})).toEqual(['match_0', 'match_1', 'match_2'])
    expect(gateway.mock.calls[0]?.[1]).toMatchObject({ disableSecondaryLlm: true })
    gateway.mockRestore()
  })

  it('keeps unassessed tail candidates distinct from an observed zero through serialization', async () => {
    const fourItemResult: ToolSearchResult = {
      kind: 'ok',
      schemaVersion: 'registry-tools:v3',
      query: sampleOkResult.query,
      items: [TOOL_TIMEZONE, TOOL_CRYPTO_TX, TOOL_CURRENCY, {
        ...TOOL_CURRENCY,
        toolRef: 'operation:v1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd' as typeof TOOL_CURRENCY.toolRef,
        toolId: 'operation:v1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      }],
      ranking: [],
      pagination: { limit: 10, hasMore: false },
      navigation: [],
    }

    const reranked = await rerankToolSearchResult(fourItemResult, ERC20_QUERY, {
      maxCandidatesToScore: 2,
      openrouterApiKey: 'test-key',
      fetchImpl: mockJevFetch({
        match_0: { type: 'noul', noul: 0 },
        match_1: { type: 'noul', noul: 0.9 },
        best_match: {
          type: 'choice',
          choice: 'operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          confidence: 0.9,
          probabilities: { 'operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': 0.9 },
        },
      }),
    })

    expect(reranked.kind).toBe('ok')
    if (reranked.kind !== 'ok') return
    expect(reranked.items.map((item) => item.toolRef)).toEqual([
      'operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'operation:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'operation:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'operation:v1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    ])
    expect(reranked.ranking).toEqual([
      { toolRef: TOOL_CRYPTO_TX.toolRef, rank: 1, score: 0.9 },
      { toolRef: TOOL_TIMEZONE.toolRef, rank: 2, score: 0 },
    ])
    const roundTrip = deserializeToolSearchResult(serializeToolSearchResult(reranked))
    expect(roundTrip).toEqual(reranked)
  })

  it('does not assess ambiguous duplicate Tool identities', async () => {
    const duplicatePage = { ...sampleOkResult, items: [TOOL_TIMEZONE, TOOL_CRYPTO_TX, TOOL_TIMEZONE] }
    const fetchImpl = mockJevFetch({})
    await expect(rerankToolSearchResult(duplicatePage, ERC20_QUERY, { openrouterApiKey: 'test-key', fetchImpl })).resolves.toBe(duplicatePage)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('preserves retriever order without calling a frontier LLM when Jev returns 500', async () => {
    const fetchImpl = mockFailedJevFetch(500)
    const reranked = await rerankToolSearchResult(
      sampleOkResult,
      'verify blockchain payment on base',
      {
        openrouterApiKey: 'test-key',
        fetchImpl,
      },
    )

    expect(reranked).toBe(sampleOkResult)
    expect(vi.mocked(fetchImpl).mock.calls.every(([url]) =>
      !url.toString().includes('/api/v1/chat/completions'))).toBe(true)
  })

  it('preserves retriever order when Jev times out with 504', async () => {
    const original = misorderedSearchResult(TIMEZONE_QUERY)
    await expect(rerankToolSearchResult(
      original,
      TIMEZONE_QUERY,
      {
        openrouterApiKey: 'test-key',
        fetchImpl: mockFailedJevFetch(504),
      },
    )).resolves.toBe(original)
  })

  it('preserves retriever order when the external network is offline', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network Offline'))

    const reranked = await rerankToolSearchResult(
      sampleOkResult,
      'verify blockchain payment on base',
      {
        openrouterApiKey: 'test-key',
        fetchImpl: mockFetch as unknown as typeof fetch,
      },
    )

    expect(reranked).toBe(sampleOkResult)
  })

  it('preserves retriever order when Jev omits a candidate classification', async () => {
    const gateway = vi.spyOn(decisionEngine, 'executeDecisionGateway').mockResolvedValue({
      tier: 'jev_system_one',
      model: '~typesafe/jev-latest',
      answers: {
        match_0: { type: 'noul', noul: 0.1 },
        match_1: { type: 'noul', noul: 0.9 },
        best_match: {
          type: 'choice',
          choice: TOOL_CRYPTO_TX.toolRef,
          confidence: 0.9,
          probabilities: { [TOOL_CRYPTO_TX.toolRef]: 0.9 },
        },
      },
      usage: { inputTokens: 10, outputTokens: 0, estimatedCostAud: 'A$0.000000' },
      durationMs: 12,
      attemptedTiers: ['jev_system_one'],
    })

    await expect(rerankToolSearchResult(sampleOkResult, ERC20_QUERY)).resolves.toBe(sampleOkResult)
    gateway.mockRestore()
  })

  it('surfaces a programming defect instead of disguising it as an outage', async () => {
    const gateway = vi.spyOn(decisionEngine, 'executeDecisionGateway').mockRejectedValue(new Error('Fatal internal error'))

    await expect(rerankToolSearchResult(sampleOkResult, 'some query', {
      openrouterApiKey: 'test-key',
    })).rejects.toThrow('Fatal internal error')
    gateway.mockRestore()
  })
  it('skips an oversized complete query without dropping constraints or candidates', async () => {
    const fetchImpl = mockJevFetch({})
    await expect(rerankToolSearchResult(sampleOkResult, 'x'.repeat(32_001), { openrouterApiKey: 'test-key', fetchImpl })).resolves.toBe(sampleOkResult)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('preserves the page on caller cancellation, making no request', async () => {
    const fetchImpl = mockJevFetch({})
    await expect(rerankToolSearchResult(sampleOkResult, ERC20_QUERY, { openrouterApiKey: 'test-key', fetchImpl, signal: AbortSignal.abort() })).resolves.toBe(sampleOkResult)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not retry even when a caller requests retries', async () => {
    const fetchImpl = mockFailedJevFetch(503)
    await expect(rerankToolSearchResult(sampleOkResult, ERC20_QUERY, { openrouterApiKey: 'test-key', fetchImpl, maxRetries: 5 })).resolves.toBe(sampleOkResult)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

})
