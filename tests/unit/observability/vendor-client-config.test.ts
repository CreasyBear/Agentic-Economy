/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ init: vi.fn(), identify: vi.fn(), capture: vi.fn(), sentryInit: vi.fn(), sentryCapture: vi.fn() }))
vi.mock('posthog-js', () => ({ default: { init: mocks.init, identify: mocks.identify, capture: mocks.capture } }))
vi.mock('@sentry/node', () => ({ init: mocks.sentryInit }))
vi.mock('@sentry/react', () => ({ init: mocks.sentryInit, captureException: mocks.sentryCapture }))
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); window.history.replaceState(null, '', '/'); })
afterEach(() => vi.unstubAllEnvs())
describe('telemetry configuration boundaries', () => {
  it('uses explicit events with replay and automatic DOM capture disabled', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'test-project-key')
    const client = await import('@/lib/observability/posthog.client')
    client.initPostHogClient()
    await vi.waitFor(() => expect(mocks.init).toHaveBeenCalled())
    expect(mocks.init).toHaveBeenCalledWith('test-project-key', expect.objectContaining({
      autocapture: false, disable_session_recording: true, capture_pageview: false,
      capture_pageleave: false, persistence: 'sessionStorage',
    }))
  })
  it('honors the server disable switch despite a configured DSN', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://public@example.ingest.sentry.io/1')
    vi.stubEnv('AE_DISABLE_OBSERVABILITY', 'true')
    const sentry = await import('@/lib/observability/sentry.server')
    expect(sentry.initSentryServer()).toBe(false)
    expect(mocks.sentryInit).not.toHaveBeenCalled()
  })
  it('honors the disable switch despite configured vendor keys', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'test-project-key')
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.ingest.sentry.io/1')
    vi.stubEnv('VITE_AE_DISABLE_OBSERVABILITY', 'true')
    const posthog = await import('@/lib/observability/posthog.client')
    const sentry = await import('@/lib/observability/sentry.client')
    posthog.initPostHogClient()
    await vi.dynamicImportSettled()
    expect(sentry.initSentryClient()).toBe(false)
    sentry.captureClientException(new Error('test only'))
    expect(mocks.init).not.toHaveBeenCalled()
    expect(mocks.sentryInit).not.toHaveBeenCalled()
    expect(mocks.sentryCapture).not.toHaveBeenCalled()
  })
})
