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
import { formatCurrencyAmount } from '@/modules/money/public'

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
      state: 'output-available', output: { kind: 'no_candidates', items: [], count: 0 } })
    expect(card).toMatchObject({ kind: 'choices', state: 'complete', count: 0, choices: [], toolRefs: [] })
    if (card === null) throw new Error('missing_card')
    expect(projectToolCard(serializeToolCard(card))).toEqual(card)
  })

  it('follows the tool Jev chose for the same search rows', () => {
    const toolType = `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`
    const nearRef = `operation:v1:${'c'.repeat(64)}`
    const items = [
      { toolRef: TOOL_REF, title: 'Lookup A', provider: 'Acme', price: 'A$1.25', readiness: 'Ready now' },
      { toolRef: nearRef, title: 'Lookup B', provider: 'Acme', price: 'A$1.25', readiness: 'Ready now' },
    ]
    const compared = projectToolCard({
      type: toolType,
      state: 'output-available',
      output: { kind: 'ok', items, count: 2, use: 'registry.tools.compare', belowMatch: [nearRef] },
    })
    expect(compared).toMatchObject({
      kind: 'choices',
      surface: 'compare',
      title: 'Compare tools',
      choices: [{ title: 'Lookup A' }, { title: 'Lookup B', belowMatch: true }],
    })
    if (compared === null) throw new Error('missing_card')
    expect(projectToolCard(serializeToolCard(compared))).toEqual(compared)

    expect(projectToolCard({
      type: toolType,
      state: 'output-available',
      output: { kind: 'ok', items: items.slice(0, 1), count: 1, use: 'registry.tools.describe' },
    })).toMatchObject({ kind: 'choices', surface: 'describe', title: 'Tool details' })

    expect(projectToolCard({
      type: toolType,
      state: 'output-available',
      output: { kind: 'ok', items, count: 1, use: 'chat.clarify' },
    })).toMatchObject({
      kind: 'status',
      state: 'attention',
      summary: 'These Tools do not separate on this request.',
    })
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
      { label: 'Decision price', value: formatCurrencyAmount(PRICE) },
      { label: INSPECT_ACCOUNT_AVAILABLE_LABEL, value: formatCurrencyAmount(AVAILABLE) },
      { label: INSPECT_AGENT_MAXIMUM_LABEL, value: formatCurrencyAmount(MAXIMUM) },
      { label: 'Quote', value: QUOTE_REF },
      { label: 'Expires', value: new Date(EXPIRES_AT).toISOString() },
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
      { label: 'Decision price', value: formatCurrencyAmount(PRICE) },
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
