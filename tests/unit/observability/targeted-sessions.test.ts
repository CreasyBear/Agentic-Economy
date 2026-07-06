import { describe, expect, it } from 'vitest'

import {
  reconstructTargetedSessions,
  type TargetedSessionSourceRow,
} from '@/modules/observability/internal/targeted-sessions'

const RUN_ID = 'ae-14d-run-2026-07-04'
const OTHER_RUN_ID = 'ae-14d-run-2026-07-03'
const WINDOW_START = 1_720_000_000_000
const WINDOW_END = WINDOW_START + 14 * 24 * 60 * 60 * 1000

function funnelEvent(overrides: Partial<TargetedSessionSourceRow> = {}): TargetedSessionSourceRow {
  return {
    eventType: 'visitor_attributed',
    source: 'partner-newsletter',
    stage: 'visitor',
    pseudonymousSessionId: 'sess_targeted',
    correlationId: 'visitor:targeted',
    consentFlag: false,
    redactedPayloadJson: '{}',
    createdAt: WINDOW_START + 1_000,
    utmCampaign: RUN_ID,
    utmSource: 'partner-newsletter',
    ...overrides,
  } as TargetedSessionSourceRow
}

describe('reconstructTargetedSessions', () => {
  it('deduplicates visitor_attributed rows by run id and pseudonymous session id', () => {
    const result = reconstructTargetedSessions(
      [
        funnelEvent({
          pseudonymousSessionId: 'sess_repeat',
          correlationId: 'visitor:first',
          createdAt: WINDOW_START + 1_000,
        }),
        funnelEvent({
          pseudonymousSessionId: 'sess_repeat',
          correlationId: 'visitor:second',
          createdAt: WINDOW_START + 2_000,
          source: 'partner-followup',
        }),
      ],
      {
        runId: RUN_ID,
        windowStartMs: WINDOW_START,
        windowEndMs: WINDOW_END,
      },
    )

    expect(result.count).toBe(1)
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0]).toMatchObject({
      eventType: 'visitor_attributed',
      source: 'partner-newsletter',
      utmCampaign: RUN_ID,
      utmSource: 'partner-newsletter',
      pseudonymousSessionId: 'sess_repeat',
      firstCorrelationId: 'visitor:first',
      firstSeenAt: WINDOW_START + 1_000,
    })
  })

  it.each([
    {
      name: 'wrong campaign',
      row: funnelEvent({ utmCampaign: OTHER_RUN_ID }),
    },
    {
      name: 'before the run window',
      row: funnelEvent({ createdAt: WINDOW_START - 1 }),
    },
    {
      name: 'after the run window',
      row: funnelEvent({ createdAt: WINDOW_END + 1 }),
    },
    {
      name: 'missing timestamp',
      row: funnelEvent({ createdAt: undefined }),
    },
    {
      name: 'missing pseudonymous session id',
      row: funnelEvent({ pseudonymousSessionId: undefined }),
    },
    {
      name: 'empty pseudonymous session id',
      row: funnelEvent({ pseudonymousSessionId: '   ' }),
    },
    {
      name: 'non canonical event type',
      row: funnelEvent({ eventType: 'registry_search' }),
    },
    {
      name: 'direct source with no attribution marker',
      row: funnelEvent({ source: 'direct', utmSource: undefined, referrer: undefined }),
    },
    {
      name: 'unattributed source with no attribution marker',
      row: funnelEvent({ source: 'unknown', utmSource: undefined, referrer: undefined }),
    },
  ])('excludes $name', ({ row }) => {
    const result = reconstructTargetedSessions(
      [row],
      {
        runId: RUN_ID,
        windowStartMs: WINDOW_START,
        windowEndMs: WINDOW_END,
      },
    )

    expect(result).toMatchObject({ count: 0, sessions: [] })
  })

  it('allows ref-collapsed source only when the active campaign is persisted', () => {
    const result = reconstructTargetedSessions(
      [
        funnelEvent({
          source: 'partner-ref',
          utmSource: undefined,
          pseudonymousSessionId: 'sess_ref_with_campaign',
          correlationId: 'visitor:ref-with-campaign',
        }),
        funnelEvent({
          source: 'partner-ref',
          utmCampaign: undefined,
          utmSource: undefined,
          pseudonymousSessionId: 'sess_ref_without_campaign',
          correlationId: 'visitor:ref-without-campaign',
        }),
      ],
      {
        runId: RUN_ID,
        windowStartMs: WINDOW_START,
        windowEndMs: WINDOW_END,
      },
    )

    expect(result.count).toBe(1)
    expect(result.sessions).toEqual([
      expect.objectContaining({
        source: 'partner-ref',
        utmCampaign: RUN_ID,
        pseudonymousSessionId: 'sess_ref_with_campaign',
        firstCorrelationId: 'visitor:ref-with-campaign',
      }),
    ])
  })

  it('returns host-only referrer evidence and drops raw referrer URL details', () => {
    const result = reconstructTargetedSessions(
      [
        funnelEvent({
          pseudonymousSessionId: 'sess_raw_referrer',
          correlationId: 'visitor:raw-referrer',
          referrer: 'https://Partner.Example/path/to/page?email=sam@example.test&secret=leak#fragment',
        }),
      ],
      {
        runId: RUN_ID,
        windowStartMs: WINDOW_START,
        windowEndMs: WINDOW_END,
      },
    )

    expect(result.count).toBe(1)
    expect(result.sessions[0]).toMatchObject({
      pseudonymousSessionId: 'sess_raw_referrer',
      referrerHost: 'partner.example',
    })
    expect(JSON.stringify(result.sessions)).not.toContain('/path/to/page')
    expect(JSON.stringify(result.sessions)).not.toContain('sam@example.test')
    expect(JSON.stringify(result.sessions)).not.toContain('secret=leak')
  })
})
