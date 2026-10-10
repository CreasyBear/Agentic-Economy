/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { projectToolQuoteRefusal, type ToolQuoteResult } from '@/modules/capability-execution/quote'
import {
  INSPECT_ACCOUNT_AVAILABLE_LABEL,
  INSPECT_AGENT_MAXIMUM_LABEL,
  projectInspectResult,
  parseChatQuoteInput,
  projectToolCard,
  CHAT_TOOL_NAME_MAP,
  serializeToolCard,
} from '@/modules/chat/tool-card'
import { formatCurrencyAmount, formatDisplayAmount } from '@/modules/money/public'
import { PublicToolRegistrySchemaVersion } from '@/modules/capability-supply/public'
import { projectToolSearchChoices } from '@/modules/registry/tool-choice-contracts'
import { mockSearchTool, misorderedSearchResult } from '../../helpers/tool-search-rerank-fixtures'
import { ChatNeedActionsContext, ToolCard } from '@/components/ae/chat/ToolCard'
import type { ChatNeedActions, ChatSaveNeed, ToolCardProjection } from '@/modules/chat/tool-card'

const QUOTE_REF = `operation-commitment:v1:${'b'.repeat(64)}`
const TOOL_REF = `operation:v1:${'a'.repeat(64)}`
const PRICE = { currency: 'AUD', units: '1250000', exponent: 6 } as const
const AVAILABLE = { currency: 'AUD', units: '5000000', exponent: 6 } as const
const MAXIMUM = { currency: 'AUD', units: '2000000', exponent: 6 } as const
const SOURCE_REQUIREMENT = { currency: 'AUD', units: '250000', exponent: 6 } as const
const EXPIRES_AT = 1_700_000_060_000

afterEach(cleanup)
describe('quote input boundary', () => {
  it('preserves a bounded JSON object and rejects malformed or non-object drafts without exposing their contents', () => {
    const valid = '{"region":"au","parameters":{"window":[1,null,true]}}'
    expect(parseChatQuoteInput(TOOL_REF, valid)).toEqual({
      region: 'au', parameters: { window: [1, null, true] },
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(parseChatQuoteInput(TOOL_REF, '{"secret":"not-closed"')).toBeUndefined()
      expect(consoleError).toHaveBeenCalledWith('[ae.exception]', expect.stringContaining('SyntaxError'))
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain('not-closed')
    } finally {
      consoleError.mockRestore()
    }
    expect(parseChatQuoteInput(TOOL_REF, '[]')).toBeUndefined()
  })
})

describe('search result state', () => {
  it('preserves exhausted no-match history without inventing an executable unchanged search', () => {
    const card = projectToolCard({ type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available', output: { kind: 'noMatch', results: [],
        next: [] } })
    expect(card).toMatchObject({ kind: 'status', state: 'attention' })
    expect(card).not.toHaveProperty('next')
    if (card === null) throw new Error('missing_card')
    expect(projectToolCard(serializeToolCard(card))).toEqual(card)
  })

  it('saves only the actual exhausted search input, preserving selected source and filters in history', () => {
    const input = { query: 'Regional grid capacity forecast', source: 'coinbase' as const,
      filters: { category: 'energy', access: 'ae_callable' as const }, limit: 8 }
    const output = {
      kind: 'noMatch', schemaVersion: PublicToolRegistrySchemaVersion,
      query: input.query, results: [], reason: 'No suitable Tool in the assessed supply.',
      partialResults: false,
      assessed: { source: 'coinbase', scope: 'complete', coverage: 'complete', examined: 20 },
      pagination: { limit: 8, hasMore: false },
      next: [],
    }
    const part = { type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available', input, output }
    const card = projectToolCard(part)
    expect(card).toMatchObject({ kind: 'status', saveNeed: {
      query: input.query, source: input.source, filters: input.filters,
    } })
    if (card === null) throw new Error('missing_card')
    expect(projectToolCard(serializeToolCard(card))).toEqual(card)
    expect(projectToolCard({ ...part, input: { ...input, query: 'model paraphrase' } }))
      .not.toHaveProperty('saveNeed')
    expect(projectToolCard({ ...part, output: { ...output, partialResults: true } }))
      .not.toHaveProperty('saveNeed')
    expect(projectToolCard({ ...part, output: { ...output, kind: 'scoped' } }))
      .not.toHaveProperty('saveNeed')
    expect(projectToolCard({ ...part, output: { ...output, kind: 'unavailable' } }))
      .not.toHaveProperty('saveNeed')
    expect(projectToolCard({ ...part, input: undefined })).not.toHaveProperty('saveNeed')
  })

  it('offers only signed-in chat an explicit Save and keeps the same scoped intent on repeat clicks', async () => {
    const saveNeed = { query: 'Regional grid capacity forecast',
      source: 'coinbase' as const, filters: { category: 'energy', access: 'ae_callable' as const } }
    const projection: ToolCardProjection = {
      toolId: 'registry.tools.search', title: 'Search tools', kind: 'status', state: 'attention',
      summary: 'No suitable Tool', saveNeed,
    }
    const onSave = vi.fn(async (input: ChatSaveNeed & { idempotencyKey: string }) => ({
      kind: 'recorded' as const, requestRef: 'need:123', query: input.query, createdAt: 1,
    }))
    const actions: ChatNeedActions = {
      authenticated: true,
      onFind: async () => ({ kind: 'not_found' }),
      onSave,
      onStatus: async () => ({ kind: 'open', requestRef: 'need:123',
        query: saveNeed.query, createdAt: 1, matchedCount: 0 }),
      onWithdraw: async () => ({ kind: 'withdrawn', requestRef: 'need:123' }),
    }
    const card = (value: ChatNeedActions) => createElement(ChatNeedActionsContext.Provider,
      { value }, createElement(ToolCard, { projection }))
    render(card(actions))
    const save = await screen.findByRole('button', { name: 'Save this need' })
    fireEvent.click(save)
    fireEvent.click(save)
    await waitFor(() => expect(screen.getByText('need:123')).toBeInTheDocument())
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({ ...saveNeed, idempotencyKey: expect.any(String) })
    expect(screen.queryByRole('button', { name: 'Save this need' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }))
    await waitFor(() => expect(screen.getByText('Need is open for matching.')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    await waitFor(() => expect(screen.getByText('Need withdrawn.')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Save this need' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    expect(onSave.mock.calls[1]?.[0].idempotencyKey).not.toBe(onSave.mock.calls[0]?.[0].idempotencyKey)
    cleanup()
    render(card({ ...actions, onFind: async () => ({ kind: 'found', request: {
      requestRef: 'need:123', query: saveNeed.query, source: saveNeed.source,
      filters: saveNeed.filters, createdAt: 1, updatedAt: 1,
    } }) }))
    await waitFor(() => expect(screen.getByText('need:123')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Save this need' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check status' })).toBeInTheDocument()
    expect(onSave).toHaveBeenCalledTimes(2)
    cleanup()
    render(card({ ...actions, authenticated: false }))
    expect(screen.getByRole('link', { name: 'Sign in to save this need' })).toHaveAttribute('href', '/sign-in')
    expect(screen.queryByRole('button', { name: 'Save this need' })).not.toBeInTheDocument()
  })

  it('projects an assessed match as a selectable choice and preserves it on sharing', () => {
    const toolType = `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`
    const item = { toolRef: TOOL_REF, title: 'Lookup A',
      displayPrice: { kind: 'indicative', amount: { currency: 'AUD', units: '1', exponent: 6 },
        rateObservedAt: 1_900_000_000_000, validUntil: 2_000_000_000_000 },
      price: { kind: 'indicative', label: 'USDC 0.000001' }, readiness: 'ready' }
    const recommendation = { toolRef: TOOL_REF, by: 'Jev (decision.example)' }
    const matched = projectToolCard({
      type: toolType, state: 'output-available', output: { kind: 'match', results: [item], recommendation },
    })
    expect(matched).toMatchObject({ kind: 'choices', state: 'complete', count: 1, recommendation,
      choices: [{ title: 'Lookup A', price: 'A$0.000001', priceValidUntil: 2_000_000_000_000 }] })
    if (matched === null) throw new Error('missing_projected_card')
    const stored = serializeToolCard(matched)
    expect(projectToolCard(stored)).toEqual(matched)
    if (stored === null) throw new Error('missing_stored_card')
    expect(projectToolCard({ ...stored, recommendation: { toolRef: 'operation:invalid', by: 'Jev' } }))
      .not.toHaveProperty('recommendation')
  })
  it('opens review for current setup-required unverified choices and preserves that affordance in shared history', () => {
    const toolType = `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`
    const item = { toolRef: TOOL_REF, title: 'Needs setup', source: 'current',
      access: 'setup_required', readiness: 'unverified' }
    const card = projectToolCard({
      type: toolType, state: 'output-available', output: { kind: 'scoped', results: [item] },
    })
    expect(card).toMatchObject({
      kind: 'choices',
      choices: [{ toolRef: TOOL_REF, readiness: 'unverified', callable: true }],
    })
    if (card === null) throw new Error('missing_projected_card')
    expect(projectToolCard(serializeToolCard(card))).toEqual(card)

    const ineligibleRows = [
      { id: 'external-listing-one', title: 'External listing', source: 'coinbase',
        access: 'unavailable', readiness: 'unverified' },
      { toolRef: `operation:v1:${'c'.repeat(64)}`, title: 'Unavailable source', source: 'unavailable',
        access: 'setup_required', readiness: 'unverified' },
      { toolRef: `operation:v1:${'g'.repeat(64)}`, title: 'Unavailable access', source: 'current',
        access: 'unavailable', readiness: 'unverified' },
      { toolRef: `operation:v1:${'d'.repeat(64)}`, title: 'Unknown source', source: 'unknown',
        access: 'setup_required', readiness: 'unverified' },
      { toolRef: `operation:v1:${'e'.repeat(64)}`, title: 'Unavailable readiness', source: 'current',
        access: 'setup_required', readiness: 'unavailable' },
      { toolRef: `operation:v1:${'f'.repeat(64)}`, title: 'Unknown readiness', source: 'current',
        access: 'setup_required', readiness: 'unknown' },
      { title: 'Missing canonical reference', source: 'current', access: 'setup_required', readiness: 'unverified' },
      { toolRef: 'operation:invalid', title: 'Invalid canonical reference', source: 'current',
        access: 'setup_required', readiness: 'unverified' },
    ]
    for (const row of ineligibleRows) {
      const ineligible = projectToolCard({
        type: toolType, state: 'output-available', output: { kind: 'scoped', results: [row] },
      })
      if (ineligible === null || ineligible.kind !== 'choices') throw new Error('missing_ineligible_choices')
      expect(ineligible.choices.some(choice => choice.callable === true)).toBe(false)
      if (row.title === 'Missing canonical reference' || row.title === 'Invalid canonical reference') {
        expect(ineligible.choices).toHaveLength(0)
      }
    }
  })
  it('preserves external listing identity and provider price through shared history', () => {
    const output = {
      kind: 'scoped',
      results: [
        { id: 'listing-one', source: 'coinbase', access: 'unavailable', title: 'Weather lookup',
          host: 'weather-one.example', resourcePath: '/v1/current', networkLabel: 'Base',
          sourcePrice: '0.002000 USDC', readiness: 'unverified' },
        { id: 'listing-two', source: 'coinbase', access: 'unavailable', title: 'Weather lookup',
          host: 'weather-two.example', resourcePath: '/v2/forecast', networkLabel: 'Ethereum',
          sourcePrice: '0.003000 USDC', readiness: 'unverified' },
      ],
    }
    const card = projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available',
      output,
    })
    expect(card).toMatchObject({
      kind: 'choices',
      choices: [
        { toolRef: 'listing-one', title: 'Weather lookup', host: 'weather-one.example',
          resourcePath: '/v1/current', networkLabel: 'Base', sourcePrice: '0.002000 USDC', readiness: 'unverified' },
        { toolRef: 'listing-two', title: 'Weather lookup', host: 'weather-two.example',
          resourcePath: '/v2/forecast', networkLabel: 'Ethereum', sourcePrice: '0.003000 USDC', readiness: 'unverified' },
      ],
    })
    if (card === null) throw new Error('missing_external_card')
    expect(projectToolCard(serializeToolCard(card))).toEqual(card)
    if (card.kind !== 'choices') throw new Error('missing_external_choices')
    expect(card.choices.every(choice => choice.callable !== true)).toBe(true)
    const legacy = serializeToolCard({ ...card, choices: card.choices.map(choice => ({ ...choice, callable: true })) })
    expect(projectToolCard(legacy)).toEqual(card)
  })

  it('carries the live estimate expiry from indexed search to chat instead of retaining an old price', () => {
    const descriptor = mockSearchTool(TOOL_REF, 'lookup.a', 'Lookup A', 'Lookup')
    const result = { ...misorderedSearchResult('lookup'),
      items: [{ ...descriptor, commercial: { ...descriptor.commercial,
        displayPrice: { kind: 'indicative' as const,
          amount: { currency: 'AUD', units: '1', exponent: 6 },
          rateObservedAt: 1_900_000_000_000, validUntil: 2_000_000_000_000 } } }] }
    const output = projectToolSearchChoices(result, undefined, { verdict: 'matched', nearMisses: [] })
    expect(output.results[0]?.price).toEqual({
      kind: 'indicative', label: 'A$0.000001', validUntil: 2_000_000_000_000,
    })
    const card = projectToolCard({ type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available', output })
    expect(card).toMatchObject({ kind: 'choices', choices: [{ price: 'A$0.000001', priceValidUntil: 2_000_000_000_000 }] })
  })
  it('keeps canonical readiness and maps health-status fallback to enums', () => {
    const toolType = `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.list']}`
    const items = [
      { toolRef: TOOL_REF, title: 'Canonical', source: 'other', healthStatus: 'degraded', readiness: 'ready' },
      { toolRef: `operation:v1:${'c'.repeat(64)}`, title: 'Unverified', source: 'other', readiness: 'invalid', healthStatus: 'unverified' },
      { toolRef: `operation:v1:${'d'.repeat(64)}`, title: 'Degraded', source: 'other', readiness: 'invalid', healthStatus: 'degraded' },
      { toolRef: `operation:v1:${'e'.repeat(64)}`, title: 'Operational', source: 'other', healthStatus: 'operational' },
    ]
    const card = projectToolCard({
      type: toolType, state: 'output-available', output: { kind: 'ok', items, count: items.length },
    })
    expect(card).toMatchObject({
      kind: 'choices',
      choices: [
        { title: 'Canonical', readiness: 'ready' },
        { title: 'Unverified', readiness: 'unverified' },
        { title: 'Degraded', readiness: 'unavailable' },
        { title: 'Operational', readiness: 'ready' },
      ],
    })
    if (card === null || card.kind !== 'choices') throw new Error('missing_choices')
    expect(projectToolCard(serializeToolCard(card))).toEqual(card)

    const unknown = projectToolCard({
      type: toolType,
      state: 'output-available',
      output: { kind: 'ok', items: [{ toolRef: `operation:v1:${'f'.repeat(64)}`, title: 'Unknown', source: 'other', readiness: 'invalid', healthStatus: 'unknown' }], count: 1 },
    })
    expect(unknown?.kind === 'choices' ? unknown.choices[0]?.readiness : undefined).toBeUndefined()
  })

  it('keeps a source outage distinct from a completed no-match', () => {
    expect(projectToolCard({ type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available', output: { kind: 'unavailable', results: [],
        next: [{ action: 'registry.tools.search', args: { query: 'weather' }, authority: 'public' }] } }))
      .toMatchObject({ kind: 'status', state: 'error', next: { action: 'registry.tools.search', args: { query: 'weather' } } })
  })
})

describe('compare result contrasts', () => {
  it('labels valid policy and availability differences by tool and ignores unrecognized fields', () => {
    const otherRef = `operation:v1:${'c'.repeat(64)}`
    const card = projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.compare']}`,
      state: 'output-available',
      output: {
        kind: 'ok',
        tools: [{ toolRef: TOOL_REF, title: 'Lookup A' }, { toolRef: otherRef, title: 'Lookup B' }],
        facts: [
          { field: 'effects', values: [
            { toolRef: TOOL_REF, value: [{ class: 'data_release' }, { class: 'data_release' }] },
            { toolRef: otherRef, value: [{ class: 'external_state_change' }] },
          ] },
          { field: 'availability', values: [{ toolRef: otherRef, value: { posture: 'setup_required' } }] },
          { field: 'unknown', values: [{ toolRef: TOOL_REF, value: 'do not display' }] },
        ],
      },
    })
    expect(card).toMatchObject({
      kind: 'choices',
      contrasts: [
        { label: 'Effects', value: 'Lookup A: Data release; Lookup B: External state change' },
        { label: 'Readiness', value: 'Lookup B: Setup required' },
      ],
    })
    if (card === null) throw new Error('missing_card')
    expect(projectToolCard(serializeToolCard(card))).toEqual(card)
  })
})

function committedQuote(): Extract<ToolQuoteResult, { kind: 'committed' }> {
  return {
    kind: 'committed',
    quoteRef: QUOTE_REF,
    toolRef: TOOL_REF,
    toolVersion: 1,
    expiresAt: EXPIRES_AT,

    price: PRICE,
    sourceRequirement: SOURCE_REQUIREMENT,
    account: {
      accountRef: 'acc_share-inspect',
      available: AVAILABLE,
    },
    budget: {
      principalRef: 'prn_share-inspect',
      maximumPerCall: MAXIMUM,
    },
    policyRefs: ['commercial-policy:sandbox:v1'],
    evidenceDigest: `sha256:${'c'.repeat(64)}`,
    continuation: {
      action: 'tool.call',
      args: { quoteRef: QUOTE_REF, idempotencyKey: 'chat-inspect-one' },
    },
  }
}

function factLabels(facts: readonly { label: string }[]): readonly string[] {
  return facts.map((fact) => fact.label)
}

function serializedInspectFacts(card: ReturnType<typeof projectInspectResult>): readonly { label: string; value: string }[] {
  const stored = serializeToolCard(card)
  expect(stored).not.toBeNull()
  if (stored === null) throw new Error('serializeToolCard returned null')
  expect(stored.kind).toBe('inspect')
  expect(Array.isArray(stored.facts)).toBe(true)
  return stored.facts as readonly { label: string; value: string }[]
}

describe('inspect Quote tool cards', () => {
  it('shows the required recovery action for an unadmitted Quote, including in shared history', () => {
    const output = projectToolQuoteRefusal({
      toolRef: TOOL_REF, input: {}, code: 'inspection_unavailable',
      retryable: false, reason: 'missing_source_write_admission', correlationRef: 'chat-quote-refusal',
    })
    const card = projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.quote']}`,
      state: 'output-available', output,
    })
    expect(card).toMatchObject({
      kind: 'status', state: 'refused', recoveryReason: 'inspection_unavailable',
    })
    if (card === null) throw new Error('missing_card')
    render(createElement(ToolCard, { projection: card }))
    expect(screen.getByRole('link', { name: 'Try another Tool' }).getAttribute('href')).toBe('/market')
    expect(screen.queryByText('missing_source_write_admission')).toBeNull()
    expect(projectToolCard(serializeToolCard(card))).toEqual(card)
  })
  it('offers Add credit for an insufficient-balance refusal', () => {
    const output = projectToolQuoteRefusal({
      toolRef: TOOL_REF, input: {}, code: 'insufficient_balance', retryable: false,
      correlationRef: 'chat-insufficient-balance',
      funding: { principalAmount: PRICE, idempotencyKey: 'chat-funding-handoff' },
    })
    const card = projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.quote']}`,
      state: 'output-available', output,
    })
    if (card === null) throw new Error('missing_card')
    const onAddCredit = vi.fn()
    render(createElement(ToolCard, { projection: card, onAddCredit }))
    fireEvent.click(screen.getByRole('button', { name: 'Add credit' }))
    expect(onAddCredit).toHaveBeenCalledWith({ units: PRICE.units, exponent: PRICE.exponent })
  })

  it('keeps Account available and Agent maximum on the owner inspect projection', () => {
    const card = projectInspectResult(committedQuote())
    expect(card.kind).toBe('inspect')
    if (card.kind !== 'inspect') return
    expect(factLabels(card.facts)).toEqual([
      'Decision price',
      INSPECT_ACCOUNT_AVAILABLE_LABEL,
      INSPECT_AGENT_MAXIMUM_LABEL,
      'Provider requirement',
      'Expires',
      'Quote',
    ])
    expect(card.facts).toEqual(expect.arrayContaining([
      { label: 'Decision price', value: formatDisplayAmount(PRICE) },
      { label: INSPECT_ACCOUNT_AVAILABLE_LABEL, value: formatDisplayAmount(AVAILABLE) },
      { label: INSPECT_AGENT_MAXIMUM_LABEL, value: formatDisplayAmount(MAXIMUM) },
      { label: 'Quote', value: QUOTE_REF },
      { label: 'Expires', value: new Date(EXPIRES_AT).toISOString() },
    ]))
  })

  it('keeps micro-unit source exact while presenting sub-cent AUD as a cent', () => {
    const result = projectInspectResult({
      ...committedQuote(), price: { currency: 'AUD', exponent: 6, units: '1' },
      sourceRequirement: { currency: 'USDC', exponent: 6, units: '1' },
    })
    expect(result.kind).toBe('inspect')
    if (result.kind !== 'inspect') return
    expect(result.facts).toEqual(expect.arrayContaining([
      { label: 'Decision price', value: 'A$0.01' },
      { label: 'Provider requirement', value: '0.000001 USDC' },
    ]))
  })

  it('drops Account available and Agent maximum from share serialization and keeps Quote terms', () => {
    const facts = serializedInspectFacts(projectInspectResult(committedQuote()))
    expect(factLabels(facts)).toEqual([
      'Decision price',
      'Provider requirement',
      'Expires',
      'Quote',
    ])
    expect(facts).toEqual(expect.arrayContaining([
      { label: 'Decision price', value: formatDisplayAmount(PRICE) },
      { label: 'Quote', value: QUOTE_REF },
      { label: 'Expires', value: new Date(EXPIRES_AT).toISOString() },
    ]))
    expect(facts).not.toEqual(expect.arrayContaining([
      { label: INSPECT_ACCOUNT_AVAILABLE_LABEL, value: formatCurrencyAmount(AVAILABLE) },
    ]))
    expect(factLabels(facts)).not.toContain(INSPECT_ACCOUNT_AVAILABLE_LABEL)
    expect(factLabels(facts)).not.toContain(INSPECT_AGENT_MAXIMUM_LABEL)
  })
})


describe('clarifying question', () => {
  it('pins a complete question and keeps an unfinished one as a status line', () => {
    const toolType = `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['chat.clarify']}`
    const ready = projectToolCard({
      type: toolType,
      state: 'input-available',
      input: { question: 'Which region?', choices: ['Australia', 'Singapore', 'Other'] },
    })
    expect(ready).toMatchObject({
      kind: 'clarify',
      question: 'Which region?',
      choices: ['Australia', 'Singapore', 'Other'],
    })
    if (ready === null || ready.kind !== 'clarify') throw new Error('missing_clarify')
    expect(projectToolCard(serializeToolCard(ready))).toEqual(ready)
    expect(projectToolCard({ type: toolType, state: 'input-streaming', input: {} }))
      .toMatchObject({ kind: 'working', title: 'Preparing a question' })
  })
})

describe('chat JSON result decoding', () => {
  it('preserves a bounded public description through stored cards', () => {
    const summary = '🌤'.repeat(500)
    const card = projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available',
      output: { kind: 'match', results: [{ toolRef: `operation:v1:${'a'.repeat(64)}`, title: 'Weather', summary }] },
    })
    if (card?.kind !== 'choices') throw new Error('missing choice')
    expect(card.choices[0]?.summary).toBe('🌤'.repeat(400))
    expect(projectToolCard(serializeToolCard(card))).toEqual(card)
  })
  it.each(['invalid JSON', '[]', 'null', 'x'.repeat(65 * 1024)])('refuses invalid or oversized text (%#)', (output) => {
    expect(projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.describe']}`,
      state: 'output-available', output,
    })).toMatchObject({ kind: 'status', state: 'error' })
  })
})
