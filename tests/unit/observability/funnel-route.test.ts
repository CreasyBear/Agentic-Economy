import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  parse: vi.fn((value: unknown) => value),
  recordOwnerActivationThroughSource: vi.fn(),
}))

vi.mock('@/modules/observability/funnel.functions', () => ({
  recordFunnelEventSchema: { parse: mocks.parse },
  recordOwnerActivationThroughSource: mocks.recordOwnerActivationThroughSource,
}))

import { handleRecordOwnerActivationEvent } from '@/routes/api.observability.funnel'

describe('POST /api/observability/funnel', () => {
  beforeEach(() => {
    mocks.parse.mockClear()
    mocks.recordOwnerActivationThroughSource.mockReset()
  })

  it('rejects oversized JSON before parsing or source-syncing public funnel events', async () => {
    const oversizedBody = JSON.stringify({
      eventType: 'visitor_attributed',
      source: 'partner-newsletter',
      stage: 'visitor',
      pseudonymousSessionId: 'sess_oversized_route',
      correlationId: 'visitor:oversized-route',
      consentFlag: true,
      padding: 'x'.repeat(16 * 1024),
    })

    const response = await handleRecordOwnerActivationEvent(
      new Request('https://ae.example/api/observability/funnel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: oversizedBody,
      }),
    )

    await expect(response.json()).resolves.toEqual({ ok: false, reason: 'payload_too_large' })
    expect(response.status).toBe(413)
    expect(mocks.parse).not.toHaveBeenCalled()
    expect(mocks.recordOwnerActivationThroughSource).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON before schema parsing or source-syncing public funnel events', async () => {
    const response = await handleRecordOwnerActivationEvent(
      new Request('https://ae.example/api/observability/funnel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"eventType":',
      }),
    )

    await expect(response.json()).resolves.toEqual({ ok: false, reason: 'invalid_json' })
    expect(response.status).toBe(400)
    expect(mocks.parse).not.toHaveBeenCalled()
    expect(mocks.recordOwnerActivationThroughSource).not.toHaveBeenCalled()
  })

  it.each([
    'answer_query_started',
    'answer_clarification_requested',
    'answer_registry_searched',
    'answer_follow_up_submitted',
    'answer_provider_selected',
    'inquiry_attempted',
  ])('returns success without source-syncing nonessential %s telemetry', async (eventType) => {
    const payload = {
      eventType,
      source: 'answer-thread',
      stage: 'visitor',
      pseudonymousSessionId: 'sess_answer_route',
      correlationId: `answer-route:${eventType}`,
      consentFlag: true,
      payload: {
        queryLength: 18,
        priorTurnCount: 1,
      },
    }

    const response = await handleRecordOwnerActivationEvent(
      new Request('https://ae.example/api/observability/funnel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(response.status).toBe(200)
    expect(mocks.recordOwnerActivationThroughSource).not.toHaveBeenCalled()
  })

  it('accepts no-business visitor_attributed events instead of skipping source-owned persistence', async () => {
    const payload = {
      eventType: 'visitor_attributed',
      source: 'partner-newsletter',
      stage: 'visitor',
      pseudonymousSessionId: 'sess_14d_route',
      correlationId: 'visitor:route',
      consentFlag: false,
      referrer: 'partner.example',
      utmSource: 'partner',
      utmCampaign: 'ae-14d-run-2026-07-04',
    }

    const response = await handleRecordOwnerActivationEvent(
      new Request('https://ae.example/api/observability/funnel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(response.status).toBe(200)
    expect(mocks.recordOwnerActivationThroughSource).toHaveBeenCalledTimes(1)
    expect(mocks.recordOwnerActivationThroughSource).toHaveBeenCalledWith(payload)
  })
})
