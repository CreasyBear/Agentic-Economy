import { describe, expect, it, vi } from 'vitest'

import * as decisionEngine from '@/modules/decision-engine/public'
import { projectToolCard, CHAT_TOOL_NAME_MAP, serializeToolCard } from '@/modules/chat/tool-card'
import { attachChatSearchUse, chatSearchUse } from '@/modules/chat/search-presentation'
import { presentToolSearch, TOOL_SEARCH_USE } from '@/modules/registry/tool-reranker'
import type { ToolSearchResult } from '@/modules/capability-supply/public'
import {
  ERC20_QUERY,
  TOOL_TIMEZONE,
  jevSystemOneResponse,
  misorderedSearchResult,
  mockSearchTool,
  mockJevFetch,
} from '../../helpers/tool-search-rerank-fixtures'

function choiceAnswer(choice: string, confidence = 0.9) {
  return { type: 'choice', choice, confidence, probabilities: { [choice]: confidence } }
}

function answersFor(scores: readonly number[], choice: string, confidence = 0.9) {
  const answers: Record<string, unknown> = { use: choiceAnswer(choice, confidence) }
  scores.forEach((noul, index) => {
    answers[`match_${index}`] = { type: 'noul', noul }
  })
  return answers
}

function pageOf(count: number): Extract<ToolSearchResult, { kind: 'ok' }> {
  const base = misorderedSearchResult(ERC20_QUERY)
  return {
    ...base,
    items: Array.from({ length: count }, (_, index) => mockSearchTool(
      `operation:v1:stress_${index}`,
      `stress.${index}`,
      `Tool ${index}`,
      `Stress candidate ${index}`,
    )),
  }
}

function present(scores: readonly number[], choice: string, confidence = 0.9, page = misorderedSearchResult(ERC20_QUERY)) {
  return presentToolSearch(page, ERC20_QUERY, {
    openrouterApiKey: 'test-key',
    fetchImpl: mockJevFetch(answersFor(scores, choice, confidence)),
  })
}

function refs(result: ToolSearchResult): string[] {
  return result.kind === 'ok' ? result.items.map((item) => item.toolRef) : []
}

describe('Jev search presentation stress', () => {
  const page = misorderedSearchResult(ERC20_QUERY)

  it('asks for the tool and every match score in one call', async () => {
    const gateway = vi.spyOn(decisionEngine, 'executeDecisionGateway')
    await present([0.2, 0.8, 0.4], TOOL_SEARCH_USE.search)
    expect(gateway).toHaveBeenCalledTimes(1)
    const questions = gateway.mock.calls[0]?.[0].questions ?? {}
    expect(Object.keys(questions).sort()).toEqual(['match_0', 'match_1', 'match_2', 'use'])
    gateway.mockRestore()
  })

  it.each([
    { scores: [0.1, 0.2, 0.49] as const, choice: TOOL_SEARCH_USE.compare, use: TOOL_SEARCH_USE.clarify, items: ['operation:v1:currency_exchange', 'operation:v1:crypto_tx_lookup', TOOL_TIMEZONE.toolRef] },
    { scores: [0.5, 0.49, 0.1] as const, choice: TOOL_SEARCH_USE.compare, use: TOOL_SEARCH_USE.compare, items: [TOOL_TIMEZONE.toolRef, 'operation:v1:crypto_tx_lookup'] },
    { scores: [0.5, 0.5, 0.1] as const, choice: TOOL_SEARCH_USE.search, use: TOOL_SEARCH_USE.search, items: [TOOL_TIMEZONE.toolRef, 'operation:v1:crypto_tx_lookup'] },
    { scores: [0.2, 0.9, 0.8] as const, choice: TOOL_SEARCH_USE.describe, use: TOOL_SEARCH_USE.describe, items: ['operation:v1:crypto_tx_lookup'] },
    { scores: [0.9, 0.8, 0.7] as const, choice: TOOL_SEARCH_USE.clarify, use: TOOL_SEARCH_USE.clarify, items: [TOOL_TIMEZONE.toolRef, 'operation:v1:crypto_tx_lookup', 'operation:v1:currency_exchange'] },
    { scores: [0.9, 0.1, 0.2] as const, choice: TOOL_SEARCH_USE.search, confidence: 0.5, use: TOOL_SEARCH_USE.describe, items: [TOOL_TIMEZONE.toolRef] },
    { scores: [0.9, 0.8, 0.1] as const, choice: TOOL_SEARCH_USE.compare, confidence: 0.499, use: TOOL_SEARCH_USE.search, items: [TOOL_TIMEZONE.toolRef, 'operation:v1:crypto_tx_lookup'] },
  ])('fits $choice at confidence $confidence to $use', async ({ scores, choice, confidence, use, items }) => {
    const presented = await present(scores, choice, confidence ?? 0.9)
    expect(presented.use).toBe(use)
    expect(refs(presented.result)).toEqual(items)
  })

  it('caps a comparison at four matches and keeps every score in the ranking', async () => {
    const wide = pageOf(6)
    const presented = await presentToolSearch(wide, ERC20_QUERY, {
      openrouterApiKey: 'test-key',
      fetchImpl: mockJevFetch(answersFor([0.91, 0.55, 0.7, 0.6, 0.99, 0.4], TOOL_SEARCH_USE.compare)),
    })
    expect(presented.use).toBe(TOOL_SEARCH_USE.compare)
    expect(refs(presented.result)).toEqual([
      'operation:v1:stress_4',
      'operation:v1:stress_0',
      'operation:v1:stress_2',
      'operation:v1:stress_3',
    ])
    if (presented.result.kind !== 'ok') return
    expect(presented.result.ranking).toHaveLength(6)
    expect(presented.result.ranking[5]).toMatchObject({ toolRef: 'operation:v1:stress_5', score: 0.4 })
    expect(presented.result.items[0]).toBe(wide.items[4])
  })

  it('drops an unscored tail from a shortlist and keeps it when the page does not separate', async () => {
    const wide = pageOf(4)
    const shortlist = await presentToolSearch(wide, ERC20_QUERY, {
      openrouterApiKey: 'test-key',
      maxCandidatesToScore: 2,
      fetchImpl: mockJevFetch(answersFor([0.9, 0.2], TOOL_SEARCH_USE.search)),
    })
    expect(shortlist.use).toBe(TOOL_SEARCH_USE.describe)
    expect(refs(shortlist.result)).toEqual(['operation:v1:stress_0'])

    const unresolved = await presentToolSearch(wide, ERC20_QUERY, {
      openrouterApiKey: 'test-key',
      maxCandidatesToScore: 2,
      fetchImpl: mockJevFetch(answersFor([0.1, 0.2], TOOL_SEARCH_USE.search)),
    })
    expect(unresolved.use).toBe(TOOL_SEARCH_USE.clarify)
    expect(refs(unresolved.result)).toEqual([
      'operation:v1:stress_1',
      'operation:v1:stress_0',
      'operation:v1:stress_2',
      'operation:v1:stress_3',
    ])
  })

  it('keeps the original page for duplicates, a disabled rerank, and a broken answer', async () => {
    const first = page.items[0]
    const second = page.items[1]
    if (first === undefined || second === undefined) throw new Error('Search fixture is incomplete')
    const duplicated = { ...page, items: [first, first, second] }
    const gateway = vi.spyOn(decisionEngine, 'executeDecisionGateway')
    await expect(presentToolSearch(duplicated, ERC20_QUERY, { openrouterApiKey: 'test-key' })).resolves.toEqual({ result: duplicated, use: null, belowMatch: [] })
    await expect(presentToolSearch(page, ERC20_QUERY, { disableRerank: true })).resolves.toEqual({ result: page, use: null, belowMatch: [] })
    expect(gateway).not.toHaveBeenCalled()
    gateway.mockRestore()

    const broken = await presentToolSearch(page, ERC20_QUERY, {
      openrouterApiKey: 'test-key',
      fetchImpl: mockJevFetch({
        match_0: { type: 'noul', noul: 0.9 },
        match_1: { type: 'noul', noul: 1.2 },
        match_2: { type: 'noul', noul: 0.2 },
        use: choiceAnswer(TOOL_SEARCH_USE.compare),
      }),
    })
    expect(broken).toEqual({ result: page, use: null, belowMatch: [] })

    const missingChoice = await presentToolSearch(page, ERC20_QUERY, {
      openrouterApiKey: 'test-key',
      fetchImpl: vi.fn().mockResolvedValue(jevSystemOneResponse({
        match_0: { type: 'noul', noul: 0.9 },
        match_1: { type: 'noul', noul: 0.8 },
        match_2: { type: 'noul', noul: 0.1 },
      })) as unknown as typeof fetch,
    })
    expect(missingChoice).toEqual({ result: page, use: null, belowMatch: [] })
  })

  it('keeps parallel presentations on the same page from changing each other', async () => {
    const presented = await Promise.all(Array.from({ length: 40 }, (_, index) =>
      present(index % 2 === 0 ? [0.2, 0.95, 0.1] : [0.91, 0.88, 0.2], index % 2 === 0 ? TOOL_SEARCH_USE.compare : TOOL_SEARCH_USE.search),
    ))
    expect(presented.filter((entry) => entry.use === TOOL_SEARCH_USE.compare)).toHaveLength(20)
    expect(presented.filter((entry) => entry.use === TOOL_SEARCH_USE.search)).toHaveLength(20)
    expect(presented.filter((entry) => entry.use === TOOL_SEARCH_USE.compare).every((entry) => entry.belowMatch.length === 1)).toBe(true)
    expect(page.items.map((item) => item.toolRef)).toEqual([
      TOOL_TIMEZONE.toolRef,
      'operation:v1:crypto_tx_lookup',
      'operation:v1:currency_exchange',
    ])
  })

  it('projects only a real Jev tool onto the search card', () => {
    const toolType = `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`
    const items = Array.from({ length: 6 }, (_, index) => ({
      toolRef: `operation:v1:${index.toString(16).padStart(64, 'a')}`,
      title: `Lookup ${index}`,
    }))
    const compared = projectToolCard({
      type: toolType,
      state: 'output-available',
      output: { kind: 'ok', items, count: 6, use: TOOL_SEARCH_USE.compare },
    })
    expect(compared).toMatchObject({ surface: 'compare', title: 'Compare tools' })
    if (compared === null || compared.kind !== 'choices') return
    expect(compared.choices).toHaveLength(4)
    expect(projectToolCard(serializeToolCard(compared))).toEqual(compared)

    const unknown = projectToolCard({
      type: toolType,
      state: 'output-available',
      output: { kind: 'ok', items: items.slice(0, 1), count: 1, use: 'registry.tools.quote' },
    })
    expect(unknown).toMatchObject({ kind: 'choices' })
    expect(unknown !== null && 'surface' in unknown).toBe(false)

    expect(chatSearchUse('registry.tools.quote')).toBeNull()
    expect(attachChatSearchUse({ kind: 'no_candidates' }, TOOL_SEARCH_USE.compare)).toEqual({ kind: 'no_candidates' })
    expect(attachChatSearchUse({ kind: 'ok', items: [] }, TOOL_SEARCH_USE.compare)).toMatchObject({ use: TOOL_SEARCH_USE.compare })
    expect(attachChatSearchUse({ kind: 'ok', items: [] }, TOOL_SEARCH_USE.compare, ['operation:v1:near'])).toMatchObject({
      use: TOOL_SEARCH_USE.compare,
      belowMatch: ['operation:v1:near'],
    })
  })
})
