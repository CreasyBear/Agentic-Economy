import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  metrics: { count: vi.fn() },
  captureMessage: vi.fn(),
  withScope: vi.fn((callback: (scope: { setTag: (key: string, value: string) => void; setLevel: (level: string) => void }) => void) => {
    callback({ setTag() {}, setLevel() {} })
  }),
}))

vi.mock('@sentry/node', () => sentry)

import { initSentryServer } from '@/lib/observability/sentry.server'
import {
  recordAnonymousChat,
  recordCallTerminal,
  recordChatAnswer,
  recordFundingTerminal,
  recordJourneyOutcome,
  recordPublishResult,
  recordQuoteJourney,
  recordSearchResult,
  setJourneyReporter,
} from '@/lib/observability/journey'

function journeyLogs(): Array<{ journey: string; outcome: string; good: boolean }> {
  return vi.mocked(console.info).mock.calls.flatMap(([prefix, body]) => {
    if (prefix !== '[ae.journey]' || typeof body !== 'string') return []
    return [JSON.parse(body) as { journey: string; outcome: string; good: boolean }]
  })
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  setJourneyReporter(undefined)
})

afterEach(() => {
  setJourneyReporter(undefined)
  vi.restoreAllMocks()
})

describe('journey outcomes', () => {
  it('logs one structured event and ignores a reporter failure', () => {
    setJourneyReporter(() => { throw new Error('sentry down') })
    expect(() => recordJourneyOutcome({ journey: 'search', outcome: 'match', good: true })).not.toThrow()
    expect(journeyLogs()).toEqual([{ journey: 'search', outcome: 'match', good: true }])
  })

  it('classifies search results and errors', () => {
    recordSearchResult('match')
    recordSearchResult('scoped')
    recordSearchResult('noMatch')
    recordSearchResult('unavailable')
    expect(journeyLogs()).toEqual([
      { journey: 'search', outcome: 'match', good: true },
      { journey: 'search', outcome: 'scoped', good: true },
      { journey: 'search', outcome: 'noMatch', good: true },
      { journey: 'search', outcome: 'error', good: false },
    ])
  })

  it('separates an issued quote from a fault and an ordinary refusal', () => {
    recordQuoteJourney({ kind: 'committed' })
    recordQuoteJourney({ kind: 'refused', code: 'inspection_unavailable', retryable: true })
    recordQuoteJourney({ kind: 'refused', code: 'tool_not_ready', retryable: true })
    recordQuoteJourney({ kind: 'refused', code: 'insufficient_balance', retryable: false })
    recordQuoteJourney({ kind: 'refused', code: 'tool_not_ready', retryable: false })
    expect(journeyLogs().map(event => event.outcome)).toEqual([
      'issued', 'refused_by_fault', 'refused_by_fault', 'refused', 'refused',
    ])
  })

  it('records a call once, on the first leave from pending', () => {
    recordCallTerminal('pending', 'completed')
    recordCallTerminal('completed', 'completed')
    recordCallTerminal('reconciliation_required', 'completed')
    recordCallTerminal('pending', 'reconciliation_required')
    recordCallTerminal('pending', 'refused')
    recordCallTerminal('pending', 'cancelled')
    recordCallTerminal('pending', 'enqueued')
    expect(journeyLogs()).toEqual([
      { journey: 'call', outcome: 'completed', good: true },
      { journey: 'call', outcome: 'outcome_unknown', good: false },
      { journey: 'call', outcome: 'refused', good: false },
      { journey: 'call', outcome: 'cancelled', good: false },
    ])
  })

  it('records funding once, on the first leave from pending', () => {
    recordFundingTerminal('pending', 'succeeded')
    recordFundingTerminal('succeeded', 'succeeded')
    recordFundingTerminal('outcome_unknown', 'succeeded')
    recordFundingTerminal('pending', 'outcome_unknown')
    recordFundingTerminal('pending', 'failed')
    expect(journeyLogs()).toEqual([
      { journey: 'funding', outcome: 'completed', good: true },
      { journey: 'funding', outcome: 'stuck', good: false },
      { journey: 'funding', outcome: 'failed', good: false },
    ])
  })

  it('records one chat answer, including a clarification, and not a second terminal write', () => {
    recordChatAnswer('working', 'completed')
    recordChatAnswer('completed', 'completed')
    recordChatAnswer('input-required', 'completed')
    recordChatAnswer('submitted', 'input-required')
    recordChatAnswer('working', 'failed')
    recordAnonymousChat('completed')
    expect(journeyLogs()).toEqual([
      { journey: 'chat', outcome: 'completed', good: true },
      { journey: 'chat', outcome: 'input_required', good: true },
      { journey: 'chat', outcome: 'failed', good: false },
      { journey: 'chat', outcome: 'completed', good: true },
    ])
  })

  it('records publish completion and refusal, and ignores replay', () => {
    recordPublishResult({ kind: 'published' })
    recordPublishResult({ kind: 'replayed' })
    recordPublishResult({ kind: 'refused' })
    expect(journeyLogs()).toEqual([
      { journey: 'publish', outcome: 'completed', good: true },
      { journey: 'publish', outcome: 'refused', good: false },
    ])
  })

  it('forwards one Sentry metric and one tagged event when Sentry is configured', () => {
    vi.stubEnv('SENTRY_DSN', 'https://public@example.ingest.sentry.io/1')
    expect(initSentryServer()).toBe(true)
    recordSearchResult('noMatch')
    expect(sentry.metrics.count).toHaveBeenCalledTimes(1)
    expect(sentry.metrics.count).toHaveBeenCalledWith('ae.journey', 1, {
      attributes: { journey: 'search', outcome: 'noMatch', good: 'true' },
    })
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(sentry.captureMessage).toHaveBeenCalledWith('[ae.journey]')
    expect(journeyLogs()).toHaveLength(1)
  })
})
