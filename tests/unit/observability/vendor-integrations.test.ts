import { describe, expect, it } from 'vitest'

import { readObservabilityClientConfig, readObservabilityServerConfig } from '@/lib/observability/config'
import { buildFunnelEventProperties } from '@/lib/observability/funnel-event-props'

describe('observability config', () => {
  it('disables telemetry when explicitly turned off', () => {
    expect(
      readObservabilityClientConfig({
        VITE_AE_DISABLE_OBSERVABILITY: 'true',
        VITE_SENTRY_DSN: 'https://example.ingest.sentry.io/1',
        VITE_POSTHOG_KEY: 'phc_test',
      }),
    ).toMatchObject({ enabled: false })
  })

  it('enables server telemetry when keys are present', () => {
    expect(
      readObservabilityServerConfig({
        SENTRY_DSN: 'https://example.ingest.sentry.io/1',
        POSTHOG_KEY: 'phc_test',
        NODE_ENV: 'test',
        VERCEL_GIT_COMMIT_SHA: 'abc123',
      }),
    ).toMatchObject({
      enabled: true,
      environment: 'test',
      release: 'abc123',
    })
  })

  it('derives client release from deployment metadata', () => {
    expect(
      readObservabilityClientConfig({
        VITE_SENTRY_DSN: 'https://example.ingest.sentry.io/1',
        GITHUB_SHA: 'deploy-sha',
      }),
    ).toMatchObject({
      enabled: true,
      release: 'deploy-sha',
    })
  })
})

describe('buildFunnelEventProperties', () => {
  it('maps GTM fields into PostHog properties', () => {
    expect(
      buildFunnelEventProperties({
        eventType: 'registry_search',
        source: 'newsletter',
        stage: 'visitor',
        pseudonymousSessionId: 'sess_1',
        correlationId: 'registry:1',
        consentFlag: false,
        utmSource: 'newsletter',
        payload: { queryLength: 4 },
      }),
    ).toEqual({
      ae_source: 'newsletter',
      ae_stage: 'visitor',
      ae_correlation_id: 'registry:1',
      ae_consent_flag: false,
      utm_source: 'newsletter',
      queryLength: 4,
    })
  })
})
