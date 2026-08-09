import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  safeParse: vi.fn((value: unknown) => ({ success: true, data: value, error: undefined as unknown })),
  recordOwnerActivationThroughSource: vi.fn(),
}))

vi.mock('@/modules/observability/funnel.functions', () => ({
  recordFunnelEventSchema: { safeParse: mocks.safeParse },
  recordOwnerActivationThroughSource: mocks.recordOwnerActivationThroughSource,
}))

import { handleRecordOwnerActivationEvent } from '@/routes/api.observability.funnel'

describe('POST /api/observability/funnel', () => {
  beforeEach(() => {
    mocks.safeParse.mockClear()
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

    await expect(response.json()).resolves.toMatchObject({
      kind: 'PAYLOAD_TOO_LARGE',
      code: 'payload_too_large',
      status: 413,
    })
    expect(response.status).toBe(413)
    expect(mocks.safeParse).not.toHaveBeenCalled()
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

    await expect(response.json()).resolves.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_json',
      status: 400,
    })
    expect(response.status).toBe(400)
    expect(mocks.safeParse).not.toHaveBeenCalled()
    expect(mocks.recordOwnerActivationThroughSource).not.toHaveBeenCalled()
  })
  it('returns an INVALID_ARGUMENT problem for a valid JSON object with an invalid funnel shape', async () => {
    mocks.safeParse.mockReturnValueOnce({
      success: false,
      data: undefined,
      error: new Error('invalid funnel shape'),
    })

    const response = await handleRecordOwnerActivationEvent(
      new Request('https://ae.example/api/observability/funnel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    await expect(response.json()).resolves.toMatchObject({
      status: 400,
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_body',
    })
    expect(mocks.recordOwnerActivationThroughSource).not.toHaveBeenCalled()
  })
  it('returns INVALID_ARGUMENT for malformed skipped telemetry before the source-sync skip', async () => {
    const payload = {
      eventType: 'answer_query_started',
      source: 'answer-thread',
    }
    mocks.safeParse.mockReturnValueOnce({
      success: false,
      data: undefined,
      error: new Error('invalid skipped funnel shape'),
    })

    const response = await handleRecordOwnerActivationEvent(
      new Request('https://ae.example/api/observability/funnel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    await expect(response.json()).resolves.toMatchObject({
      status: 400,
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_body',
    })
    expect(mocks.safeParse).toHaveBeenCalledWith(payload)
    expect(mocks.recordOwnerActivationThroughSource).not.toHaveBeenCalled()
  })

  it('keeps source-sync failures as record_failed after valid shape validation', async () => {
    const payload = {
      eventType: 'visitor_attributed',
      source: 'partner-newsletter',
      stage: 'visitor',
      pseudonymousSessionId: 'sess_source_failure',
      correlationId: 'visitor:source-failure',
      consentFlag: true,
    }
    mocks.recordOwnerActivationThroughSource.mockRejectedValueOnce(new Error('source unavailable'))

    const response = await handleRecordOwnerActivationEvent(
      new Request('https://ae.example/api/observability/funnel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    await expect(response.json()).resolves.toMatchObject({
      status: 500,
      kind: 'INTERNAL',
      code: 'record_failed',
      detail: 'record_failed',
    })
    expect(mocks.safeParse).toHaveBeenCalledTimes(1)
    expect(mocks.recordOwnerActivationThroughSource).toHaveBeenCalledWith(payload)
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
