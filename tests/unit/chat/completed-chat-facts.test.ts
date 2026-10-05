import { describe, expect, it } from 'vitest'
import { completedChatFacts, factsFromSavedTurn } from '../../../convex/lib/chat/generate/completedFacts'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'

const callName = CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.call']

const fromResult = (output: unknown) => [{ toolResults: [{ toolName: callName, output }] }]

describe('completed chat facts', () => {
  it('does not invent an execution outcome from a missing or malformed result', () => {
    expect(completedChatFacts([])).toBeNull()
    expect(completedChatFacts(fromResult({ kind: 'completed', callRef: 'forged' }))).toBeNull()
  })

  it('keeps the exact completed output and original CallRef', () => {
    const answer = completedChatFacts(fromResult({
      kind: 'completed', callRef: 'invocation:original:1', toolRef: `operation:v1:${'a'.repeat(64)}`,
      output: { temperature: 19, unit: 'C' }, evidenceHash: 'evidence:original:1',
      usage: {
        usageRef: 'usage:original:1', observedAt: 1, chargeState: 'free_tier',
        amount: { currency: 'USD', units: '0', exponent: 2 }, priceDigest: 'price:original:1',
      },
    }))
    expect(answer).toContain('CallRef: invocation:original:1')
    expect(answer).toContain('temperature')
    expect(answer).toContain('19')
    expect(answer).not.toContain('try again')
  })

  it('preserves uncertain effects rather than advising a second Call', () => {
    const answer = completedChatFacts(fromResult({
      kind: 'reconciliation_required', callRef: 'invocation:original:2',
      toolRef: `operation:v1:${'a'.repeat(64)}`,
      evidence: {
        attemptRef: 'attempt:original:2', effectGeneration: 1,
        requiredAt: '2026-09-29T00:00:00.000Z', retry: 'reconcile_before_retry',
        evidenceSource: 'provider timeout after submit',
      },
    }))
    expect(answer).toContain('CallRef: invocation:original:2')
    expect(answer).toContain('reconciliation_required')
    expect(answer).toContain('Do not send another Call')
  })

  it('answers from a saved search when narration never arrived', () => {
    const search = CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']
    const answer = factsFromSavedTurn([{
      role: 'tool',
      content: [{
        type: 'tool-result', toolName: search, toolCallId: 'search-1',
        output: { type: 'json', value: { kind: 'match', results: [{ title: 'Weather Current', summary: 'Live city weather' }] } },
      }],
    }])
    expect(answer).toContain('One Tool matches this request')
    expect(answer).toContain('Review the inputs below')
    expect(answer).not.toMatch(/couldn't finish/i)
  })
})
