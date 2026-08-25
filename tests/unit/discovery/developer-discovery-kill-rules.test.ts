import { describe, expect, it } from 'vitest'

import { createFixtureDiscoverySourceState } from '../../helpers/discovery-fixture-source-state'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import {
  createDeveloperDiscoverySupportRecord,
  evaluateDeveloperDiscoveryLaunchSupport,
  readDeveloperDiscoveryRoute,
  renderDeveloperDiscoveryRouteCopy,
} from '@/modules/discovery/developer-discovery'

describe('developer discovery support records', () => {
  it('requires a source-owned support record with channels, evidence, and incident thresholds', () => {
    expect(evaluateDeveloperDiscoveryLaunchSupport({ requiredFunnelEvent: 'developer_docs_viewed' })).toMatchObject({
      launchReady: false,
      status: 'missing_support_record',
    })

    const ready = evaluateDeveloperDiscoveryLaunchSupport({
      supportRecord: createDeveloperDiscoverySupportRecord(),
      requiredFunnelEvent: 'developer_docs_viewed',
    })
    expect(ready).toMatchObject({
      launchReady: true,
      status: 'ready',
      requiredFunnelEvent: 'developer_docs_viewed',
    })

    const exceeded = evaluateDeveloperDiscoveryLaunchSupport({
      supportRecord: createDeveloperDiscoverySupportRecord({
        phaseIncidentCounts: {
          staleArtifacts: 0,
          routeParityFailures: 1,
          privateDataExposure: 0,
          botAbuse: 0,
          apiKeyRevokeRotate: 0,
        },
      }),
      requiredFunnelEvent: 'developer_docs_viewed',
    })
    expect(exceeded).toMatchObject({
      launchReady: false,
      status: 'incident_threshold_exceeded',
    })
  })

  it('publishes current artifacts directly from source state', () => {
    const state = availableDiscoveryState()
    const readback = readDeveloperDiscoveryRoute(state, {
      now: 4_000,
      supportRecord: createDeveloperDiscoverySupportRecord(),
    })
    const copy = renderDeveloperDiscoveryRouteCopy(readback)

    expect(readback.freshness.state).toBe('current')
    expect(readback.artifacts.every((artifact) => artifact.state === 'available')).toBe(true)
    expect(copy).not.toContain('Discovery publication gate')
    expect(copy).not.toContain('Discovery API key gate')
  })
})

function availableDiscoveryState(): DiscoverySourceState {
  return createFixtureDiscoverySourceState()
}
