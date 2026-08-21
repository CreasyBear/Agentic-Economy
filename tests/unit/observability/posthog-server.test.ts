import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const posthogMocks = vi.hoisted(() => ({
  capture: vi.fn(),
  construct: vi.fn(),
}))

vi.mock('posthog-node', () => ({
  PostHog: posthogMocks.construct,
}))

// Fresh imports isolate the module-level client and constructor-failure cases.
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('POSTHOG_KEY', 'phc_test')
  vi.stubEnv('AE_DISABLE_OBSERVABILITY', '')
  posthogMocks.capture.mockReset()
  posthogMocks.construct.mockReset().mockImplementation(function () {
    return {
      capture: posthogMocks.capture,
      flush: vi.fn(),
      shutdown: vi.fn(),
    }
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('PostHog server capture', () => {
  it('does not construct or capture without a PostHog key', async () => {
    vi.stubEnv('POSTHOG_KEY', '')
    vi.stubEnv('VITE_POSTHOG_KEY', '')
    const { captureServerEvent } = await import('@/lib/observability/posthog.server')

    captureServerEvent('diagnostic', 'test')

    expect(posthogMocks.construct).not.toHaveBeenCalled()
    expect(posthogMocks.capture).not.toHaveBeenCalled()
  })

  it('does not construct or capture when observability is disabled', async () => {
    vi.stubEnv('AE_DISABLE_OBSERVABILITY', 'true')
    const { captureServerEvent } = await import('@/lib/observability/posthog.server')

    captureServerEvent('diagnostic', 'test')

    expect(posthogMocks.construct).not.toHaveBeenCalled()
    expect(posthogMocks.capture).not.toHaveBeenCalled()
  })

  it('does not let constructor exceptions escape', async () => {
    posthogMocks.construct.mockImplementationOnce(() => {
      throw new Error('constructor failed')
    })
    const { captureServerEvent } = await import('@/lib/observability/posthog.server')

    expect(() => captureServerEvent('diagnostic', 'test')).not.toThrow()
  })

  it('does not let capture exceptions escape', async () => {
    posthogMocks.capture.mockImplementationOnce(() => {
      throw new Error('capture failed')
    })
    const { captureServerEvent } = await import('@/lib/observability/posthog.server')

    expect(() => captureServerEvent('diagnostic', 'test')).not.toThrow()
  })
})
