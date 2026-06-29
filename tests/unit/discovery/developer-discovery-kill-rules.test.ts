import { describe, expect, it } from 'vitest'

import {
  createDefaultDiscoverySourceState,
  regenerateDiscoveryManifest,
} from '@/modules/discovery/public'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import {
  createDeveloperDiscoverySupportRecord,
  evaluateDeveloperDiscoveryLaunchSupport,
  readDeveloperDiscoveryPublicationControls,
  readDeveloperDiscoveryRoute,
  renderDeveloperDiscoveryRouteCopy,
} from '@/modules/discovery/developer-discovery'

describe('developer discovery support records and kill controls', () => {
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

  it('keeps API-key authority unavailable and lets publication control withhold artifacts', () => {
    const state = availableDiscoveryState()
    const controls = readDeveloperDiscoveryPublicationControls()
    const disabledReadback = readDeveloperDiscoveryRoute(state, {
      now: 4_000,
      operatorControls: [{ key: 'developer_discovery_publish_enabled', effectiveEnabled: false }],
      supportRecord: createDeveloperDiscoverySupportRecord(),
    })
    const copy = renderDeveloperDiscoveryRouteCopy(disabledReadback)

    expect(controls).toEqual({
      developerDiscoveryPublishEnabled: true,
      discoveryApiKeysEnabled: false,
    })
    expect(disabledReadback.publicationControls).toEqual({
      developerDiscoveryPublishEnabled: false,
      discoveryApiKeysEnabled: false,
    })
    expect(disabledReadback.freshness).toMatchObject({
      state: 'unavailable',
      label: 'Publication disabled',
    })
    expect(disabledReadback.artifacts.every((artifact) => artifact.state === 'unavailable')).toBe(true)
    expect(copy).toContain('Discovery publication gate: unavailable')
    expect(copy).toContain('Discovery API key gate: unavailable')
    expect(copy).not.toMatch(/\bapi keys?\b.{0,40}\b(?:live|available|enabled|ready|created|issued)\b/iu)
  })
})

function availableDiscoveryState(): DiscoverySourceState {
  const state = createDefaultDiscoverySourceState()
  const business = state.businesses.at(0)

  if (business === undefined) {
    throw new Error('Expected default discovery source state to include a business.')
  }

  const generated = regenerateDiscoveryManifest(state, { businessId: business.businessId }, { now: 3_000 })
  if (generated.kind !== 'ok') {
    throw new Error(`Expected discovery manifest generation to succeed: ${generated.reason}`)
  }

  return state
}
