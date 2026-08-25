import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFixtureDiscoverySourceState } from '../helpers/discovery-fixture-source-state'
import { handleUcpManifestRequest } from '../helpers/discovery-fixture-routes'

import { createDurablePublishedDiscoveryState } from '../fixtures/discovery-published-state'

beforeEach(() => {
  vi.stubEnv('AE_CANONICAL_HOST_ALLOWLIST', 'ae.example')
  vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://ae.example')
  vi.stubEnv('AE_ROUTING_PUBLIC_BASE_URL', 'https://ae.example')
})

afterEach(() => {
  vi.unstubAllEnvs()
})
describe('discovery route handlers', () => {
  it('generates a non-default source UCP manifest with strict public Offering fields', async () => {
    const state = createDurablePublishedDiscoveryState({
      businessName: 'Fremantle Heat Pump Repairs',
      requestedSlug: 'fremantle-heat-pump-repairs',
      serviceName: 'Heat pump diagnostics',
      serviceQuery: 'heat pump fremantle',
      suburb: 'Fremantle',
      idPrefix: 'discovery-route-test',
    })
    const response = handleUcpManifestRequest(
      new Request('https://ae.example/fremantle-heat-pump-repairs/ucp'),
      'fremantle-heat-pump-repairs',
      state,
    )
    const body = await response.json()

    expect(body).toMatchObject({
      schemaVersion: 'ae-ucp:v2',
      businessCatalogSchemaVersion: 'public-business-catalog-api:v2',
      slug: 'fremantle-heat-pump-repairs',
      businessName: 'Fremantle Heat Pump Repairs',
      disposition: 'current',
      offerings: [
        {
          name: 'Heat pump diagnostics',
          accessPaths: [],
          support: expect.objectContaining({
            integrated: false,
            aeSupportedAction: false,
          }),
        },
      ],
    })
    expect(JSON.stringify(body)).not.toMatch(
      /demo-listed-provider|rawContact|ownerId|clerk|private:evidence|admin|sourceRefs|callable":true|paymentRequired":true/
    )
  })

  it('serves the explicit local AE-hosted UCP manifest with route-safe headers', async () => {
    const response = handleUcpManifestRequest(
      new Request('https://ae.example/demo-listed-provider/ucp'),
      'demo-listed-provider',
      createFixtureDiscoverySourceState(),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(body).toMatchObject({
      schemaVersion: 'ae-ucp:v2',
      businessCatalogSchemaVersion: 'public-business-catalog-api:v2',
      slug: 'demo-listed-provider',
      manifestUrl: 'https://ae.example/demo-listed-provider/ucp',
      disposition: 'current',
      offerings: [
        {
          name: 'Listed offering',
          accessPaths: [],
          support: expect.objectContaining({
            integrated: false,
            aeSupportedAction: false,
          }),
        },
      ],
    })
    expect(JSON.stringify(body)).not.toMatch(/businessId|sourceHash|rawContact|ownerId|clerk|private:evidence/)
  })

  it('returns an explicit local not-found shape for absent or non-public slugs', async () => {
    const response = handleUcpManifestRequest(
      new Request('https://ae.example/missing-business/ucp'),
      'missing-business',
      createFixtureDiscoverySourceState(),
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body).toMatchObject({
      kind: 'NOT_FOUND',
      code: 'discovery_manifest_not_found',
      detail: 'No public discovery manifest exists for this slug.',
    })
  })
})
