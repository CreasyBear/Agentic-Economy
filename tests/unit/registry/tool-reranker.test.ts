import { describe, expect, it, vi } from 'vitest'

import type { ToolSearchResult } from '@/modules/capability-supply/public'
import * as decisionEngine from '@/modules/decision-engine/public'
import { rerankToolSearchResult } from '@/modules/registry/tool-reranker'
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
        fetchImpl: mockJevFetch(jevAnswersForTool('operation:v1:crypto_tx_lookup', [0.05, 0.96, 0.25])),
      },
    )

    expect(reranked.kind).toBe('ok')
    if (reranked.kind !== 'ok') return

    expect(reranked.items[0]?.toolRef).toBe('operation:v1:crypto_tx_lookup')
    expect(reranked.ranking).toHaveLength(3)
    expect(reranked.ranking[0]).toEqual({
      toolRef: 'operation:v1:crypto_tx_lookup',
      rank: 1,
      score: 0.96,
    })
    expect(reranked.ranking[1]?.toolRef).toBe('operation:v1:currency_exchange')
    expect(reranked.ranking[2]?.toolRef).toBe('operation:v1:timezone_converter')
  })

  it('sorts the ERC-20 transfer tool to rank 1 for a transfer-lookup query', async () => {
    const reranked = await rerankToolSearchResult(
      misorderedSearchResult(ERC20_QUERY),
      ERC20_QUERY,
      {
        openrouterApiKey: 'test-key',
        fetchImpl: mockJevFetch(jevAnswersForTool('operation:v1:crypto_tx_lookup', [0.08, 0.94, 0.11])),
      },
    )

    expect(reranked.kind).toBe('ok')
    if (reranked.kind !== 'ok') return
    expect(reranked.items.map((item) => item.toolRef)).toEqual([
      'operation:v1:crypto_tx_lookup',
      'operation:v1:currency_exchange',
      'operation:v1:timezone_converter',
    ])
    expect(reranked.ranking[0]).toEqual({
      toolRef: 'operation:v1:crypto_tx_lookup',
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
        fetchImpl: mockJevFetch(jevAnswersForTool('operation:v1:timezone_converter', [0.97, 0.04, 0.06])),
      },
    )

    expect(reranked.kind).toBe('ok')
    if (reranked.kind !== 'ok') return
    expect(reranked.items[0]?.toolRef).toBe('operation:v1:timezone_converter')
    expect(reranked.ranking[0]).toEqual({
      toolRef: 'operation:v1:timezone_converter',
      rank: 1,
      score: 0.97,
    })
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
          choice: 'operation:v1:crypto_tx_lookup',
          confidence: 0.9,
          probabilities: { 'operation:v1:crypto_tx_lookup': 0.9 },
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
    expect(request?.questions.best_match).toMatchObject({
      type: 'choice',
      criteria: {
        'operation:v1:timezone_converter': expect.stringContaining('Timezone Converter'),
        'operation:v1:crypto_tx_lookup': expect.stringContaining('ERC-20'),
        'operation:v1:currency_exchange': expect.stringContaining('FX Currency Rates'),
      },
    })
    expect(gateway.mock.calls[0]?.[1]).toMatchObject({ disableSecondaryLlm: true })
    gateway.mockRestore()
  })

  it('leaves candidates beyond maxCandidatesToScore in original tail order with score 0', async () => {
    const fourItemResult: ToolSearchResult = {
      kind: 'ok',
      schemaVersion: 'registry-tools:v3',
      query: sampleOkResult.query,
      items: [TOOL_TIMEZONE, TOOL_CRYPTO_TX, TOOL_CURRENCY, {
        ...TOOL_CURRENCY,
        toolRef: 'operation:v1:currency_exchange_overflow' as typeof TOOL_CURRENCY.toolRef,
        toolId: 'operation:v1:currency_exchange_overflow',
      }],
      ranking: [],
      pagination: { limit: 10, hasMore: false },
      navigation: [],
    }

    const reranked = await rerankToolSearchResult(fourItemResult, ERC20_QUERY, {
      maxCandidatesToScore: 2,
      openrouterApiKey: 'test-key',
      fetchImpl: mockJevFetch({
        match_0: { type: 'noul', noul: 0.1 },
        match_1: { type: 'noul', noul: 0.9 },
        best_match: {
          type: 'choice',
          choice: 'operation:v1:crypto_tx_lookup',
          confidence: 0.9,
          probabilities: { 'operation:v1:crypto_tx_lookup': 0.9 },
        },
      }),
    })

    expect(reranked.kind).toBe('ok')
    if (reranked.kind !== 'ok') return
    expect(reranked.items.map((item) => item.toolRef)).toEqual([
      'operation:v1:crypto_tx_lookup',
      'operation:v1:timezone_converter',
      'operation:v1:currency_exchange',
      'operation:v1:currency_exchange_overflow',
    ])
    expect(reranked.ranking[2]).toEqual({
      toolRef: 'operation:v1:currency_exchange',
      rank: 3,
      score: 0,
    })
    expect(reranked.ranking[3]).toEqual({
      toolRef: 'operation:v1:currency_exchange_overflow',
      rank: 4,
      score: 0,
    })
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
