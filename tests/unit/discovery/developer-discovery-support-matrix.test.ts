import { describe, expect, it } from 'vitest'

import {
  createDefaultDiscoverySourceState,
  regenerateDiscoveryManifest,
} from '@/modules/discovery/public'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import {
  evaluateDiscoveryProjectionGate,
  readDeveloperDiscoveryGatedExclusions,
  readDeveloperDiscoveryRoute,
  readDeveloperDiscoverySupportMatrix,
} from '@/modules/discovery/developer-discovery'

describe('developer discovery support matrix', () => {
  it('ships only base public readback surfaces unless projection evidence accepts optional rows', () => {
    const state = availableDiscoveryState()
    const readback = readDeveloperDiscoveryRoute(state, { now: 4_000 })

    expect(readback.supportMatrix.map((row) => row.surface)).toEqual([
      'public_json_routes',
      'ae_hosted_ucp_fallback',
      'llms_txt',
      'sitemap',
      'robots',
      'schema_examples',
      'route_health',
    ])
    expect(readback.supportMatrix.every((row) => hasCompleteSupportRow(row))).toBe(true)

    const accepted = readDeveloperDiscoverySupportMatrix({
      freshness: readback.freshness,
      projectionGates: [
        {
          surface: 'openapi_read_projection',
          routeParity: true,
          descriptorScanClean: true,
          evidence: ['route:/api/businesses', 'scan:read-only-projection'],
        },
      ],
    })

    expect(accepted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: 'openapi_read_projection',
          state: 'shipped',
          evidence: expect.arrayContaining(['route:/api/businesses', 'scan:read-only-projection']),
        }),
      ])
    )
  })

  it('withholds optional projections and keeps platform/payment/action surfaces in gated exclusions', () => {
    expect(evaluateDiscoveryProjectionGate({
      surface: 'mcp_read_projection',
      routeParity: true,
      descriptorScanClean: true,
      evidence: [],
    })).toMatchObject({ kind: 'withheld', reason: 'Source-owned projection evidence is missing.' })

    const exclusions = readDeveloperDiscoveryGatedExclusions()
    expect(exclusions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ surface: 'api_keys', state: 'unavailable' }),
        expect.objectContaining({ surface: 'sdk', state: 'deferred' }),
        expect.objectContaining({ surface: 'cli', state: 'deferred' }),
        expect.objectContaining({ surface: 'plugin', state: 'deferred' }),
        expect.objectContaining({ surface: 'hosted_mcp_byo_proxy', state: 'unavailable' }),
        expect.objectContaining({ surface: 'agent_router', state: 'unavailable' }),
        expect.objectContaining({ surface: 'developer_gallery', state: 'deferred' }),
        expect.objectContaining({ surface: 'payment_descriptors', state: 'unavailable' }),
        expect.objectContaining({ surface: 'protected_action_descriptors', state: 'unavailable' }),
      ])
    )
    expect(exclusions.every((exclusion) => exclusion.reason.length > 0 && exclusion.nextAction.length > 0)).toBe(true)
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

function hasCompleteSupportRow(row: {
  state: string
  evidence: readonly string[]
  owner: string
  routeReadbackStatus: string
  blocker: string
  nextAction: string
}): boolean {
  return (
    row.state.length > 0 &&
    row.evidence.length > 0 &&
    row.owner.length > 0 &&
    row.routeReadbackStatus.length > 0 &&
    row.blocker.length > 0 &&
    row.nextAction.length > 0
  )
}
