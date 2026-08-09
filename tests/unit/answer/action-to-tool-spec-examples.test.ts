import { describe, expect, it } from 'vitest'

import { findAction } from '@/modules/actions'
import {
  actionToOpenRouterTool,
  appendToolExamplesToDescription,
} from '@/modules/answer/internal/action-to-tool-spec'
import { capabilityToolDescription } from '@/modules/answer/internal/capability-tool-examples'

const EXAMPLE = {
  when: 'a live crypto price in a given currency',
  userSay: 'What is the current price of bitcoin?',
  call: '{ "ids": "bitcoin", "vs_currencies": "usd" }',
  answer: 'quote the returned USD figure directly from the returned JSON.',
} as const

describe('appendToolExamplesToDescription', () => {
  it('returns the description unchanged when there are no examples', () => {
    const description = 'Execute "x". Live keyless capability.'
    expect(appendToolExamplesToDescription(description, [])).toBe(description)
  })

  it('appends when-to-call + execute + ground-the-answer guidance when examples exist', () => {
    const out = appendToolExamplesToDescription('base', [EXAMPLE])
    expect(out.startsWith('base\n')).toBe(true)
    expect(out).toContain('WHEN TO CALL THIS TOOL')
    expect(out).toContain(`User says: "${EXAMPLE.userSay}"`)
    expect(out).toContain(`Call with: ${EXAMPLE.call}`)
    expect(out).toContain(`Then answer from the returned JSON: ${EXAMPLE.answer}`)
  })
})

describe('actionToOpenRouterTool with examples', () => {
  it('appends examples into the description when passed', () => {
    const spec = actionToOpenRouterTool(findAction('registry.search')!, [EXAMPLE])
    expect(spec.function.description).toContain('WHEN TO CALL THIS TOOL')
    expect(spec.function.description).toContain(EXAMPLE.call)
  })

  it('renders the same description without examples (back-compat)', () => {
    const bare = actionToOpenRouterTool(findAction('registry.search')!)
    const withEmpty = actionToOpenRouterTool(findAction('registry.search')!, [])
    expect(withEmpty.function.description).toBe(bare.function.description)
    expect(bare.function.description).not.toContain('WHEN TO CALL THIS TOOL')
  })
})

describe('capabilityToolDescription', () => {
  it('renders standard contract input examples for an arbitrary capability', () => {
    const out = capabilityToolDescription(
      'Future data source',
      'Returns a future value.',
      [{ label: 'current value', input: { symbol: 'XYZ', currency: 'USD' } }],
    )
    expect(out).toContain('Published summary: Returns a future value.')
    expect(out).toContain('PUBLISHED INPUT EXAMPLES')
    expect(out).toContain('EXAMPLE 1 — current value')
    expect(out).toContain('Call with: {"symbol":"XYZ","currency":"USD"}')
  })

  it('uses the generic description when a publication has no examples', () => {
    const out = capabilityToolDescription('Some unknown op')
    expect(out).not.toContain('PUBLISHED INPUT EXAMPLES')
    expect(out).toContain('Execute "Some unknown op"')
  })
})
