import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  normalizeEnvironment,
  readObservabilityClientConfig,
  readObservabilityServerConfig,
} from '@/lib/observability/config'

const dsn = 'https://key@example.ingest.sentry.io/1'

describe('observability environment gate', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('maps everything but production and preview to development', () => {
    expect(normalizeEnvironment('production')).toBe('production')
    expect(normalizeEnvironment('Preview')).toBe('preview')
    for (const raw of ['development', 'test', 'setup-verification', '', undefined]) {
      expect(normalizeEnvironment(raw)).toBe('development')
    }
  })

  it('never enables Sentry for non-prod environments, even with a DSN', () => {
    vi.stubEnv('VITEST', undefined)
    for (const SENTRY_ENVIRONMENT of ['development', 'test', 'setup-verification']) {
      expect(readObservabilityServerConfig({ SENTRY_DSN: dsn, SENTRY_ENVIRONMENT }).sentryEnabled).toBe(false)
    }
  })

  it('is off under Vitest even for production', () => {
    expect(readObservabilityServerConfig({ SENTRY_DSN: dsn, VERCEL_ENV: 'production' }).sentryEnabled).toBe(false)
  })

  it('enables production and preview outside Vitest and carries the client release', () => {
    const original = process.env.VITEST
    delete process.env.VITEST
    try {
      for (const VERCEL_ENV of ['production', 'preview']) {
        expect(readObservabilityServerConfig({ SENTRY_DSN: dsn, VERCEL_ENV }).sentryEnabled).toBe(true)
      }
      const client = readObservabilityClientConfig({
        VITE_SENTRY_DSN: dsn,
        VITE_SENTRY_ENVIRONMENT: 'preview',
        VITE_SENTRY_RELEASE: 'abc123',
      })
      expect(client).toMatchObject({ sentryEnabled: true, release: 'abc123', environment: 'preview' })
    } finally {
      if (original !== undefined) process.env.VITEST = original
    }
  })
})
