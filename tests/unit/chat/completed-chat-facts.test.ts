import { describe, expect, it } from 'vitest'
import { completedChatFacts, factsFromSavedTurn } from '../../../convex/lib/chat/generate/completedFacts'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import { projectToolQuoteRefusal } from '@/modules/capability-execution/quote'

const callName = CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.call']

const fromResult = (output: unknown) => [{ toolResults: [{ toolName: callName, output }] }]

describe('completed chat facts', () => {
  it('does not invent an execution outcome from a missing or malformed result', () => {
    expect(completedChatFacts([])).toBeNull()
    expect(completedChatFacts(fromResult({ kind: 'completed', callRef: 'forged' }))).toBeNull()
  })

  it('reports a refused Quote without asking the buyer to approve it', () => {
    const answer = completedChatFacts([{ toolResults: [{
      toolName: CHAT_TOOL_NAME_MAP.canonicalToProvider['tool.quote'],
      output: projectToolQuoteRefusal({
        toolRef: `operation:v1:${'a'.repeat(64)}`, input: {}, code: 'tool_not_ready',
        retryable: false, reason: 'Tool unavailable', correlationRef: 'refused-serp-test',
      }),
    }] }])
    expect(answer).toContain('Quote refused')
    expect(answer).toMatch(/tool.*not ready/i)
    expect(answer).not.toMatch(/approve|retry/i)
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

  it('lets a completed selected detail control recovery after broader search facts', () => {
    const toolRef = `operation:v1:${'a'.repeat(64)}`
    const search = CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']
    const describe = CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.describe']
    const answer = completedChatFacts([{ toolResults: [
      { toolName: search, output: { kind: 'match', results: [{ toolRef, title: 'Old ready choice', source: 'current', access: 'ae_callable', readiness: 'ready' }] } },
      { toolName: describe, output: { kind: 'found', tool: { toolRef, title: 'Current unavailable detail', healthStatus: 'degraded' } } },
    ] }])
    expect(answer).toContain('Current unavailable detail')
    expect(answer).not.toContain('Old ready choice')
    expect(answer).not.toContain('Review inputs')
    expect(answer).not.toContain('Compare')
  })

  it('answers from a saved search when narration never arrived', () => {
    const search = CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']
    const answer = factsFromSavedTurn([{
      role: 'tool',
      content: [{
        type: 'tool-result', toolName: search, toolCallId: 'search-1',
        output: { type: 'json', value: { kind: 'match', results: [{ id: `operation:v1:${'a'.repeat(64)}`, toolRef: `operation:v1:${'a'.repeat(64)}`, source: 'current', access: 'ae_callable', readiness: 'ready', title: 'Weather Current', summary: 'Live city weather' }] } },
      }],
    }])
    expect(answer).toContain('Weather Current')
    expect(answer).toContain('Review inputs')
    expect(answer).not.toMatch(/couldn't finish/i)
  })

  it('escapes provider-authored Markdown in Call output', () => {
    const answer = completedChatFacts(fromResult({
      kind: 'completed', callRef: 'invocation:x:1', toolRef: `operation:v1:${'a'.repeat(64)}`,
      output: { note: '![a](http://e)', t: '[x](https://evil.example)' }, evidenceHash: 'e',
      usage: {
        usageRef: 'u', observedAt: 1, chargeState: 'free_tier',
        amount: { currency: 'USD', units: '0', exponent: 2 }, priceDigest: 'p',
      },
    }))
    expect(answer).toContain('\\!\\[a\\]\\(http\\://e\\)')
    expect(answer).not.toContain('http://')
    expect(answer).not.toContain('https://')
    expect(answer).not.toContain('](http')
    expect(answer).not.toMatch(/(^|[^\\])\]\(/)
  })
})
