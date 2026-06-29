import { describe, expect, it } from 'vitest'

import { FunnelEventTypeValues } from '@/modules/observability/public'
import { recordDeveloperDiscoveryFetch } from '@/modules/discovery/public'

const privateP2FieldNames = [
  'inquiryBody',
  'ownerReply',
  'claimantContact',
  'ownerNotes',
  'notificationPayload',
  'providerPayload',
  'adminEvidence',
] as const

describe('developer discovery fetch telemetry', () => {
  it.each([
    ['docs', 'successful', 'developer_docs_viewed', 'shipped'],
    ['schema', 'cached', 'schema_downloaded', 'shipped'],
    ['examples', 'stale', 'example_fixture_downloaded', 'degraded'],
    ['fixtures', 'schema_version_mismatch', 'example_fixture_downloaded', 'degraded'],
    ['health', 'invalid', 'discovery_health_viewed', 'withheld'],
    ['schema', 'not_found', 'schema_downloaded', 'unavailable'],
    ['docs', 'route_outage', 'developer_docs_viewed', 'unavailable'],
  ] as const)(
    'records %s %s fetches with canonical funnel and operator state',
    (kind, status, requiredFunnelEvent, operatorState) => {
      const readback = recordDeveloperDiscoveryFetch({
        kind,
        route: '</api/discovery/schema>',
        status,
        freshness: status === 'successful' || status === 'cached' ? 'current' : 'degraded',
        ...(status === 'successful' || status === 'cached' ? {} : { errorCode: `<${status}>` }),
        botClass: 'known_bot',
        publicBusinessId: '<public-business>',
        publicServiceId: '<public-service>',
        correlationId: '<corr:fetch>',
        timestamp: 6_000,
      })

      expect(readback).toMatchObject({
        requiredFunnelEvent,
        operatorState,
        telemetry: {
          route: '/api/discovery/schema',
          status,
          schemaVersion: 'developer-discovery:v1',
          cacheVersion: 'public-catalog-readonly-cache:v1',
          botClass: 'known_bot',
          publicBusinessId: 'public-business',
          publicServiceId: 'public-service',
          correlationId: 'corr:fetch',
          timestamp: 6_000,
        },
      })
      expect(JSON.stringify(readback)).not.toMatch(/[<>]/u)
      expectNoPrivateP2Fields(JSON.stringify(readback))
    }
  )

  it('keeps API-key events out of the base Phase 3 funnel contract', () => {
    expect(FunnelEventTypeValues).toEqual(
      expect.arrayContaining([
        'developer_docs_viewed',
        'schema_downloaded',
        'example_fixture_downloaded',
        'discovery_health_viewed',
      ])
    )
    expect(FunnelEventTypeValues).not.toContain('api_key_created')
    expect(FunnelEventTypeValues).not.toContain('api_key_revoked')
  })
})

function expectNoPrivateP2Fields(copy: string): void {
  for (const field of privateP2FieldNames) {
    expect(copy).not.toContain(field)
  }
}
