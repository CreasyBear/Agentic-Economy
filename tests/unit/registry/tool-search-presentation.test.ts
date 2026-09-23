import { describe, expect, it, vi } from 'vitest'

import * as decisionEngine from '@/modules/decision-engine/public'
import { presentToolSearch } from '@/modules/registry/tool-reranker'
import {
  ERC20_QUERY,
  TOOL_CRYPTO_TX,
  TOOL_CURRENCY,
  TOOL_TIMEZONE,
  misorderedSearchResult,
  mockFailedJevFetch,
  mockJevFetch,
} from '../../helpers/tool-search-rerank-fixtures'

function choiceAnswer(choice: string, confidence = 0.9) {
  return {
    type: 'choice',
    choice,
    confidence,
    probabilities: { [choice]: confidence },
  }
}

function presentedAnswers(scores: readonly [number, number, number], choice: string, confidence = 0.9) {
  return {
    match_0: { type: 'noul', noul: scores[0] },
    match_1: { type: 'noul', noul: scores[1] },
    match_2: { type: 'noul', noul: scores[2] },
    use: choiceAnswer(choice, confidence),
  }
}

describe('Jev chat search presentation', () => {
  const page = misorderedSearchResult(ERC20_QUERY)

  it('scores candidates against the person message when retrieval used a shorter query', async () => {
    const gateway = vi.spyOn(decisionEngine, 'executeDecisionGateway')
    await presentToolSearch(page, 'company lookup', {
      openrouterApiKey: 'test-key',
      request: 'Compare two company-lookup tools',
      fetchImpl: mockJevFetch(presentedAnswers([0.2, 0.4, 0.3], 'registry.tools.compare')),
    })
    const decision = gateway.mock.calls[0]?.[0]
    expect(decision?.state).toMatchObject({
      query: 'company lookup',
      request: 'Compare two company-lookup tools',
    })
    const questions = decision?.questions ?? {}
    expect(questions.use?.instructions).toContain('`request`')
    expect(questions.match_0?.instructions).toContain('`request`')
    gateway.mockRestore()
  })

  it('does not call Jev when the page cannot support a choice', async () => {
    const gateway = vi.spyOn(decisionEngine, 'executeDecisionGateway')
    const single = { ...page, items: [TOOL_CRYPTO_TX] }
    await expect(presentToolSearch(single, ERC20_QUERY)).resolves.toEqual({ result: single, use: null, belowMatch: [] })
    await expect(presentToolSearch(page, '   ')).resolves.toEqual({ result: page, use: null, belowMatch: [] })
    expect(gateway).not.toHaveBeenCalled()
    gateway.mockRestore()
  })

  it('populates a comparison with the candidates Jev scores as matches', async () => {
    const presented = await presentToolSearch(page, ERC20_QUERY, {
      openrouterApiKey: 'test-key',
      fetchImpl: mockJevFetch(presentedAnswers([0.91, 0.88, 0.2], 'registry.tools.compare')),
    })

    expect(presented.use).toBe('registry.tools.compare')
    expect(presented.result.kind).toBe('ok')
    if (presented.result.kind !== 'ok') return
    expect(presented.result.items.map((item) => item.toolRef)).toEqual([
      TOOL_TIMEZONE.toolRef,
      TOOL_CRYPTO_TX.toolRef,
    ])
    expect(presented.result.ranking.map((entry) => entry.toolRef)).toEqual([
      TOOL_TIMEZONE.toolRef,
      TOOL_CRYPTO_TX.toolRef,
      TOOL_CURRENCY.toolRef,
    ])
    expect(presented.belowMatch).toEqual([])
  })

  it('keeps the next Tool when a comparison has one match', async () => {
    const presented = await presentToolSearch(page, ERC20_QUERY, {
      openrouterApiKey: 'test-key',
      fetchImpl: mockJevFetch(presentedAnswers([0.05, 0.96, 0.25], 'registry.tools.compare')),
    })

    expect(presented.use).toBe('registry.tools.compare')
    expect(presented.belowMatch).toEqual([TOOL_CURRENCY.toolRef])
    if (presented.result.kind !== 'ok') return
    expect(presented.result.items.map((item) => item.toolRef)).toEqual([
      TOOL_CRYPTO_TX.toolRef,
      TOOL_CURRENCY.toolRef,
    ])
  })

  it('keeps the ranked page when Jev asks for a clarifying question', async () => {
    const presented = await presentToolSearch(page, ERC20_QUERY, {
      openrouterApiKey: 'test-key',
      fetchImpl: mockJevFetch(presentedAnswers([0.91, 0.88, 0.2], 'chat.clarify')),
    })

    expect(presented.use).toBe('chat.clarify')
    if (presented.result.kind !== 'ok') return
    expect(presented.result.items.map((item) => item.toolRef)).toEqual([
      TOOL_TIMEZONE.toolRef,
      TOOL_CRYPTO_TX.toolRef,
      TOOL_CURRENCY.toolRef,
    ])
  })

  it('derives the tool from the match scores when the choice is uncertain', async () => {
    const presented = await presentToolSearch(page, ERC20_QUERY, {
      openrouterApiKey: 'test-key',
      fetchImpl: mockJevFetch(presentedAnswers([0.2, 0.96, 0.1], 'registry.tools.search', 0.2)),
    })

    expect(presented.use).toBe('registry.tools.describe')
    if (presented.result.kind !== 'ok') return
    expect(presented.result.items.map((item) => item.toolRef)).toEqual([TOOL_CRYPTO_TX.toolRef])
  })

  it('returns the original page when Jev is unavailable', async () => {
    const presented = await presentToolSearch(page, ERC20_QUERY, {
      openrouterApiKey: 'test-key',
      fetchImpl: mockFailedJevFetch(504),
    })

    expect(presented.use).toBeNull()
    expect(presented.belowMatch).toEqual([])
    expect(presented.result).toBe(page)
  })
})
