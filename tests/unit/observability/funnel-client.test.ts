import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  captureClientFunnelEventOnClient: vi.fn(),
  fetch: vi.fn(),
  randomUUID: vi.fn(),
}))

vi.mock('@/lib/observability/capture-client-events', () => ({
  captureClientFunnelEventOnClient: mocks.captureClientFunnelEventOnClient,
}))

import { emitFunnelEvent } from '@/lib/observability/funnel-client'
import { emitRegistryResultClick } from '@/lib/observability/registry-click'

describe('emitFunnelEvent', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    mocks.captureClientFunnelEventOnClient.mockReset()
    mocks.fetch.mockReset()
    mocks.randomUUID.mockReset()
  })

  it('posts no-business visitor_attributed events to the source-owned funnel endpoint', async () => {
    const sessionStorage = new TestSessionStorage()
    mocks.randomUUID.mockReturnValueOnce('session-id').mockReturnValueOnce('correlation-id')
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    vi.stubGlobal('window', {
      location: { search: '?utm_source=partner-newsletter&utm_campaign=ae-14d-run-2026-07-04&ref=launch-partner' },
      sessionStorage,
    })
    vi.stubGlobal('document', { referrer: 'https://partner.example/path?email=sam@example.test&secret=leak' })
    vi.stubGlobal('crypto', { randomUUID: mocks.randomUUID })
    vi.stubGlobal('fetch', mocks.fetch)

    await emitFunnelEvent({ eventType: 'visitor_attributed', correlationPrefix: 'visitor' })

    expect(mocks.captureClientFunnelEventOnClient).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'visitor_attributed',
      source: 'partner-newsletter',
      pseudonymousSessionId: 'sess_session-id',
      correlationId: 'visitor:correlation-id',
      utmSource: 'partner-newsletter',
      utmCampaign: 'ae-14d-run-2026-07-04',
    }))
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.fetch).toHaveBeenCalledWith('/api/observability/funnel', expect.objectContaining({
      method: 'POST',
      keepalive: true,
    }))

    const requestBody = JSON.parse(String(mocks.fetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    expect(requestBody).toMatchObject({
      eventType: 'visitor_attributed',
      source: 'partner-newsletter',
      stage: 'visitor',
      pseudonymousSessionId: 'sess_session-id',
      correlationId: 'visitor:correlation-id',
      consentFlag: false,
      utmSource: 'partner-newsletter',
      utmCampaign: 'ae-14d-run-2026-07-04',
    })
    expect(requestBody.businessId).toBeUndefined()
  })

  it('captures answer telemetry client-side without posting it to the source-owned funnel endpoint', async () => {
    const sessionStorage = new TestSessionStorage()
    mocks.randomUUID.mockReturnValueOnce('session-id').mockReturnValueOnce('correlation-id')

    vi.stubGlobal('window', {
      location: { search: '?utm_source=answer-session&utm_campaign=answer-quality-run' },
      sessionStorage,
    })
    vi.stubGlobal('document', { referrer: 'https://search.example/path' })
    vi.stubGlobal('crypto', { randomUUID: mocks.randomUUID })
    vi.stubGlobal('fetch', mocks.fetch)

    await emitFunnelEvent({
      eventType: 'answer_registry_searched',
      stage: 'visitor',
      correlationPrefix: 'answer-registry',
      payload: {
        queryLength: 18,
        priorTurnCount: 0,
      },
    })

    expect(mocks.captureClientFunnelEventOnClient).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'answer_registry_searched',
      source: 'answer-session',
      pseudonymousSessionId: 'sess_session-id',
      correlationId: 'answer-registry:correlation-id',
      utmSource: 'answer-session',
      utmCampaign: 'answer-quality-run',
      payload: {
        queryLength: 18,
        priorTurnCount: 0,
      },
    }))
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('posts business-scoped registry result click events to the source-owned funnel endpoint', async () => {
    const sessionStorage = new TestSessionStorage()
    mocks.randomUUID.mockReturnValueOnce('session-id').mockReturnValueOnce('correlation-id')
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    vi.stubGlobal('window', {
      location: { search: '?utm_source=partner-newsletter&utm_campaign=ae-14d-run-2026-07-04&ref=launch-partner' },
      sessionStorage,
    })
    vi.stubGlobal('document', { referrer: 'https://partner.example/path?email=sam@example.test&secret=leak' })
    vi.stubGlobal('crypto', { randomUUID: mocks.randomUUID })
    vi.stubGlobal('fetch', mocks.fetch)

    await emitRegistryResultClick({
      slug: 'business-001',
      query: 'emergency plumber',
      position: 2,
    })

    expect(mocks.captureClientFunnelEventOnClient).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'service_registry_result_clicked',
      source: 'partner-newsletter',
      pseudonymousSessionId: 'sess_session-id',
      correlationId: 'registry-result-click:business-001:correlation-id',
      utmSource: 'partner-newsletter',
      utmCampaign: 'ae-14d-run-2026-07-04',
      payload: {
        slug: 'business-001',
        queryLength: 17,
        resultPosition: 2,
      },
    }))

    const requestBody = JSON.parse(String(mocks.fetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    expect(requestBody).toMatchObject({
      eventType: 'service_registry_result_clicked',
      source: 'partner-newsletter',
      stage: 'visitor',
      pseudonymousSessionId: 'sess_session-id',
      correlationId: 'registry-result-click:business-001:correlation-id',
      consentFlag: false,
      utmSource: 'partner-newsletter',
      utmCampaign: 'ae-14d-run-2026-07-04',
      payload: {
        slug: 'business-001',
        queryLength: 17,
        resultPosition: 2,
      },
    })
  })
})

class TestSessionStorage {
  private readonly values: Record<string, string> = {}

  getItem(key: string): string | null {
    return this.values[key] ?? null
  }

  setItem(key: string, value: string): void {
    this.values[key] = value
  }
}
