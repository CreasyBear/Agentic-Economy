import { isRedirect } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as AboutRoute } from '@/routes/about'
import { Route as AgentsRoute } from '@/routes/for-agents'
import { Route as HelpRoute } from '@/routes/help'
import { handleDurableListServicesRequest } from '@/routes/api.v1.services'
import type { PublicBusinessCatalogApiV2Page } from '@/modules/registry/public'
import { projectPublicServicesPage } from '@/modules/registry/public'
import { registryServicesListAction } from '@/modules/registry/registry.actions'

describe('services public route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists the V2 catalog through /api/v1/services', async () => {
    const expected = projectPublicServicesPage(page())
    const run = vi.spyOn(registryServicesListAction, 'run').mockResolvedValue(expected)
    const request = new Request('https://ae.example/api/v1/services?limit=5')

    const response = await handleDurableListServicesRequest(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual(expected)
    expect(run).toHaveBeenCalledWith({
      data: { limit: 5 },
      context: { caller: 'http', request },
    })
  })

  it('refuses a search query on the list route', async () => {
    const run = vi.spyOn(registryServicesListAction, 'run')
    const response = await handleDurableListServicesRequest(
      new Request('https://ae.example/api/v1/services?q=emergency+plumbing'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'refused',
      reason: 'unsupported_query_parameter',
      unsupported: ['q'],
      supported: ['cursor', 'limit'],
    })
    expect(run).not.toHaveBeenCalled()
  })
})

describe('legacy human route redirects', () => {
  it.each([
    ['about', AboutRoute],
    ['help', HelpRoute],
  ])('%s permanently redirects to /', (_name, route) => {
    const beforeLoad = route.options.beforeLoad
    if (beforeLoad === undefined) throw new Error('legacy redirect is unavailable')

    let thrown: unknown
    try {
      beforeLoad({} as never)
    } catch (error) {
      thrown = error
    }

    expect(isRedirect(thrown)).toBe(true)
    if (!isRedirect(thrown)) return
    expect(thrown.options).toMatchObject({ to: '/', statusCode: 301 })
  })


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
        suburb: 'Fremantle',
        stateTerritory: 'WA',
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
              currency: 'AUD',
              amountMinor: 8000,
              unit: 'job',
              taxTreatment: 'inclusive',
            },
            accessPaths: [
              {
                accessPathRef: 'path-open',
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
