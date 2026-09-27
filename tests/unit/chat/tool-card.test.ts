import { describe, expect, it } from 'vitest'

import { projectToolQuoteRefusal, type ToolQuoteResult } from '@/modules/capability-execution/quote'
import {
  INSPECT_ACCOUNT_AVAILABLE_LABEL,
  INSPECT_AGENT_MAXIMUM_LABEL,
  projectInspectResult,
  projectToolCard,
  CHAT_TOOL_NAME_MAP,
  serializeToolCard,
} from '@/modules/chat/tool-card'
import { formatCurrencyAmount, formatDisplayAmount } from '@/modules/money/public'

const QUOTE_REF = `operation-commitment:v1:${'b'.repeat(64)}`
const TOOL_REF = `operation:v1:${'a'.repeat(64)}`
const PRICE = { currency: 'AUD', units: '1250000', exponent: 6 } as const
const AVAILABLE = { currency: 'AUD', units: '5000000', exponent: 6 } as const
const MAXIMUM = { currency: 'AUD', units: '2000000', exponent: 6 } as const
const SOURCE_REQUIREMENT = { currency: 'AUD', units: '250000', exponent: 6 } as const
const EXPIRES_AT = 1_700_000_060_000

describe('search result state', () => {
  it('shows a successful empty search as complete and preserves it in shared history', () => {
    const card = projectToolCard({ type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available', output: { kind: 'noMatch', results: [], nearMisses: [], scope: 'exhausted' } })
    expect(card).toMatchObject({ kind: 'choices', state: 'complete', count: 0, choices: [], toolRefs: [] })
    if (card === null) throw new Error('missing_card')
    expect(projectToolCard(serializeToolCard(card))).toEqual(card)
  })

  it('shows suitable results but no option cards or source refs for a no-match envelope', () => {
    const toolType = `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`
    const nearRef = `operation:v1:${'c'.repeat(64)}`
    const items = [
      { toolRef: TOOL_REF, title: 'Lookup A', price: { kind: 'indicative', label: 'A$1.25' }, readiness: 'ready' },
      { toolRef: nearRef, title: 'Lookup B', price: { kind: 'indicative', label: 'A$1.25' }, readiness: 'ready' },
    ]
    const matched = projectToolCard({
      type: toolType, state: 'output-available', output: { kind: 'matched', results: items.slice(0, 1) },
    })
    expect(matched).toMatchObject({ kind: 'choices', state: 'complete', count: 1, choices: [{ title: 'Lookup A' }] })
    if (matched === null) throw new Error('missing_card')
    expect(projectToolCard(serializeToolCard(matched))).toEqual(matched)

    const noMatch = projectToolCard({
      type: toolType, state: 'output-available', output: { kind: 'noMatch', results: [], nearMisses: [items[1]] },
    })
    expect(noMatch).toMatchObject({
      kind: 'choices', state: 'complete', count: 0, choices: [], toolRefs: [],
    })
  })

  it('does not present unverified, degraded, or missing health as operational', () => {
    const toolType = `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.list']}`
    const items = [
      { toolRef: TOOL_REF, title: 'Unverified', healthStatus: 'unverified', readiness: 'ready' },
      { toolRef: `operation:v1:${'c'.repeat(64)}`, title: 'Degraded', healthStatus: 'degraded', readiness: 'ready' },
      { toolRef: `operation:v1:${'d'.repeat(64)}`, title: 'Unknown', readiness: 'ready' },
      { toolRef: `operation:v1:${'e'.repeat(64)}`, title: 'Observed', healthStatus: 'operational' },
    ]
    const card = projectToolCard({
      type: toolType, state: 'output-available', output: { kind: 'ok', items, count: items.length },
    })
    expect(card).toMatchObject({
      kind: 'choices',
      choices: [
        { title: 'Unverified', readiness: 'Not yet verified' },
        { title: 'Degraded', readiness: 'Degraded' },
        { title: 'Unknown' },
        { title: 'Observed', readiness: 'Operational' },
      ],
    })
    if (card === null || card.kind !== 'choices') throw new Error('missing_choices')
    expect(card.choices[2]?.readiness).toBeUndefined()
    expect(projectToolCard(serializeToolCard(card))).toEqual(card)
  })

  it('keeps a source outage distinct from a successful empty search', () => {
    expect(projectToolCard({ type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available', output: { kind: 'unavailable', reason: 'source_unavailable' } }))
      .toMatchObject({ kind: 'status', state: 'error', summary: 'Tool unavailable' })
  })
})

function committedQuote(): Extract<ToolQuoteResult, { kind: 'committed' }> {
  return {
    kind: 'committed',
    quoteRef: QUOTE_REF,
    toolRef: TOOL_REF,
    toolVersion: 1,
    expiresAt: EXPIRES_AT,
    normalizedInput: { company: 'Acme' },
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
      method: 'POST',
      path: '/api/v1/tools/call',
      input: { quoteRef: QUOTE_REF, idempotencyKey: 'chat-inspect-one' },
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
      kind: 'status', state: 'refused',
      summary: 'AE could not complete this Quote request. Contact support before trying again.',
    })
    if (card === null) throw new Error('missing_card')
    expect(projectToolCard(serializeToolCard(card))).toEqual(card)
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
      { label: 'Provider requirement', value: 'USDC 0.000001' },
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
  it.each(['invalid JSON', '[]', 'null', 'x'.repeat(65 * 1024)])('refuses invalid or oversized text (%#)', (output) => {
    expect(projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.describe']}`,
      state: 'output-available', output,
    })).toMatchObject({ kind: 'status', state: 'error' })
  })
})
