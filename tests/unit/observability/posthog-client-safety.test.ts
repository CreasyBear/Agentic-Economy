// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  config: vi.fn(),
  sdk: { init: vi.fn(), identify: vi.fn(), capture: vi.fn(), register: vi.fn() },
}))
vi.mock('@/lib/observability/config', () => ({ readObservabilityClientConfig: fixture.config }))
vi.mock('posthog-js', () => ({ default: fixture.sdk }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/market?query=private-brief')
})

describe('browser telemetry initialization boundaries', () => {
  it('honors disabled observability even when a project key is configured', async () => {
    fixture.config.mockReturnValue({ enabled: false, posthogKey: 'fixture-key', environment: 'development' })
    const { captureClientProductEvent } = await import('@/lib/observability/posthog.client')
    captureClientProductEvent('ae_product_journey', { action: 'market_viewed' })
    await vi.waitFor(() => expect(fixture.config).toHaveBeenCalledOnce())
    expect(fixture.sdk.init).not.toHaveBeenCalled()
    expect(fixture.sdk.capture).not.toHaveBeenCalled()
  })

  it('disables DOM capture and session replay and sanitizes the SDK event envelope', async () => {
    fixture.config.mockReturnValue({ enabled: true, posthogKey: 'fixture-key', environment: 'development' })
    const { captureClientProductEvent } = await import('@/lib/observability/posthog.client')
    captureClientProductEvent('ae_product_journey', { action: 'market_viewed' })
    await vi.waitFor(() => expect(fixture.sdk.init).toHaveBeenCalledOnce())
    const options = fixture.sdk.init.mock.calls[0]?.[1]
    expect(options).toMatchObject({ autocapture: false, disable_session_recording: true, capture_pageview: false, persistence: 'sessionStorage' })
    expect(options.before_send({ event: 'ae_product_journey', properties: {
      $current_url: 'https://app.aecon.ai/market?query=private-brief', prompt: 'private task', action: 'market_viewed',
    } })).toEqual({ event: 'ae_product_journey', properties: { $current_url: '/market', action: 'market_viewed' } })
    expect(options.before_send({ event: '$autocapture', properties: {} })).toBeNull()
  })
})
