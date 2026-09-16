import { describe, expect, it } from 'vitest'

import type { ToolQuoteResult } from '@/modules/capability-execution/quote'
import {
  INSPECT_ACCOUNT_AVAILABLE_LABEL,
  INSPECT_AGENT_MAXIMUM_LABEL,
  projectInspectResult,
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
