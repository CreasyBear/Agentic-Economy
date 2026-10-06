import { describe, expect, it } from 'vitest'

import { isProductAnalyticsDisabled, readObservabilityClientConfig, readObservabilityServerConfig } from '@/lib/observability/config'

describe('product analytics opt-out', () => {
  it.each(['DO_NOT_TRACK', 'AE_DISABLE_ANALYTICS', 'VITE_AE_DISABLE_ANALYTICS'])('disables PostHog while preserving Sentry with %s', name => {
    const env = { [name]: '1', POSTHOG_KEY: 'phc_test', VITE_POSTHOG_KEY: 'phc_test', SENTRY_DSN: 'https://public@example.ingest.sentry.io/1', VITE_SENTRY_DSN: 'https://public@example.ingest.sentry.io/1' }
    for (const read of [readObservabilityClientConfig, readObservabilityServerConfig]) {
      expect(read(env)).toMatchObject({ enabled: true, sentryDsn: env.SENTRY_DSN })
      expect(read(env).posthogKey).toBeUndefined()
      expect(read({ [name]: '1', POSTHOG_KEY: 'phc_test', VITE_POSTHOG_KEY: 'phc_test' }).enabled).toBe(false)
    }
  })

  it.each(['', '0', 'false', ' FALSE ', 'no', 'off'])('keeps analytics enabled for explicit false %j', value => {
    expect(isProductAnalyticsDisabled({ DO_NOT_TRACK: value })).toBe(false)
    expect(readObservabilityServerConfig({ DO_NOT_TRACK: value, POSTHOG_KEY: 'phc_test' }).posthogKey).toBe('phc_test')
  })

  it.each(['1', 'true', 'yes', 'on', 'disabled'])('opts out for %j', value => {
    expect(isProductAnalyticsDisabled({ DO_NOT_TRACK: value })).toBe(true)
  })
})
