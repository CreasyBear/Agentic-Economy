import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as AgentsRoute } from '@/routes/for-agents'
import { handleDurableListServicesRequest } from '@/routes/api.v1.services'
import { handleDurableServiceDetailRequest } from '@/routes/api.v1.services.$serviceId'
import type { PublicBusinessCatalogApiV2Page } from '@/modules/registry/public'
import { projectPublicServicesPage } from '@/modules/registry/public'
import { registryServicesDetailAction, registryServicesListAction } from '@/modules/registry/registry.actions'

describe('services public route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists the V2 catalog through /api/v1/services', async () => {
    const expected = projectPublicServicesPage(page())
    const run = vi.spyOn(registryServicesListAction, 'run').mockResolvedValue(expected)
    const request = new Request('https://ae.example/api/v1/services?limit=5')

    const response = await handleDurableListServicesRequest(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const body = await response.json()
    const parsed = registryServicesListAction.outputSchema.parse(body)
    expect(parsed).toEqual(expected)
    expect(parsed.schemaVersion).toBe('public-services-api:v3')
    const service = parsed.services[0]
    if (service === undefined) throw new Error('Expected a projected service.')
    expect(service.networks).toEqual([])
    expect(service.enriched).toBe(false)
    expect(service.tags).toEqual(['plumbing'])
    expect(service.ae.trustTier).toBe('listed')
    expect(service.ae.businessContext).toEqual({
      kind: 'local_human',
      suburb: 'Fremantle',
      stateTerritory: 'WA',
    })
    expect(service.ae.publicUrl).toBe('https://acme.example')

    const endpoint = service.endpoints[0]
    if (endpoint === undefined) throw new Error('Expected a projected service endpoint.')
    expect(endpoint.description).toBe('Returns a sandbox quote.')
    expect(endpoint.parameters).toEqual([])
    expect(endpoint.tags).toEqual(['plumbing'])
    expect(endpoint.quality).toBeNull()
    expect(endpoint.ae.offeringRef).toBe('offering-open')
    expect(endpoint.ae.provenance).toBe('business_declared')
    expect(endpoint.ae.access).toBe('external')
    expect(endpoint.ae.authentication).toEqual({ kind: 'unknown' })
    expect(endpoint.ae.execution).toBe('catalog_only')
    expect(endpoint.ae.settlementSupport).toBe('unpriced')
    for (const legacyField of ['summary', 'catalogPrice', 'offeringRef', 'operationRef'] as const) {
      expect(endpoint).not.toHaveProperty(legacyField)
    }
    expect(run).toHaveBeenCalledWith({
      data: { limit: 5 },
      context: { caller: 'http', request },
    })
  })
  it('returns the exact canonical Service item for detail as list', async () => {
    const expected = projectPublicServicesPage(page())
    vi.spyOn(registryServicesListAction, 'run').mockResolvedValue(expected)
    const listResponse = await handleDurableListServicesRequest(
      new Request('https://ae.example/api/v1/services?limit=5'),
    )
    const listBody = await listResponse.json() as { services: readonly [typeof expected.services[number]] }

    const detail = {
      kind: 'found' as const,
      schemaVersion: 'public-services-api:v3' as const,
      service: expected.services[0]!,
    }
    const detailRun = vi.spyOn(registryServicesDetailAction, 'run').mockResolvedValue(detail)
    const detailRequest = new Request('https://ae.example/api/v1/services/acme-plumbing')
    const detailResponse = await handleDurableServiceDetailRequest('acme-plumbing', detailRequest)

    expect(detailResponse.status).toBe(200)
    const detailBody = await detailResponse.json() as typeof detail
    expect(detailBody.service).toEqual(listBody.services[0])
    expect(detailRun).toHaveBeenCalledWith({
      data: { slug: 'acme-plumbing' },
      context: { caller: 'http', request: detailRequest },
    })
  })


  it('refuses a search query on the list route', async () => {
    const run = vi.spyOn(registryServicesListAction, 'run')
    const response = await handleDurableListServicesRequest(
      new Request('https://ae.example/api/v1/services?q=emergency+plumbing'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'FAILED_PRECONDITION',
      code: 'unsupported_query_parameter',
      unsupported: ['q'],
      supported: ['cursor', 'limit'],
    })
    expect(run).not.toHaveBeenCalled()
  })
})

describe('agent route', () => {
  /** `/for-agents` is advertised in the sitemap and llms.txt, so it has to serve
   *  the agent door itself rather than bounce a reader back to home. */
  it('for-agents serves the agent door instead of redirecting', () => {
    expect(AgentsRoute.options.beforeLoad).toBeUndefined()
    expect(AgentsRoute.options.component).toBeDefined()
  })
})

function page(): PublicBusinessCatalogApiV2Page {
  return {
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v2',
    page: [
      {
        schemaVersion: 'public-business-catalog-api:v2',
        businessId: 'business-acme',
        slug: 'acme-plumbing',
        name: 'Acme Plumbing',
        category: 'plumbing',
        businessContext: { kind: 'local_human', suburb: 'Fremantle', stateTerritory: 'WA' },
        publicUrl: 'https://acme.example',
        trustTier: 'listed',
        photos: [],
        observedAt: 1_700_000_000_000,
        disposition: 'current',
        offerings: [
          {
            offeringRef: 'offering-open',
            revision: 3,
            name: 'Emergency checkup',
            category: 'plumbing',
            summary: 'A rapid plumbing checkup.',
            pricingSummary: 'From $80',
            price: {
              kind: 'fixed',
              amount: { currency: 'AUD', units: '8000', exponent: 2 },
              unit: 'job',
              taxTreatment: 'inclusive',
            },
            accessPaths: [
              {
                accessPathRef: 'path-open',
                offeringRevision: 3,
                kind: 'external_operation',
                name: 'Get a checkup quote',
                summary: 'Returns a sandbox quote.',
                url: 'https://another-origin.example/api/sandbox/acme-plumbing/checkup-quote',
                method: 'POST',
                authenticationSummary: 'No API key required in the sandbox.',
                provenance: 'business_declared',
              },
            ],
            support: { integrated: false, aeSupportedAction: false },
          },
        ],
        accessSummary: { humanRequest: true, externalOperation: true, aeSupportedAction: false },
      },
    ],
    isDone: true,
    continueCursor: 'cursor-out',
  }
}
