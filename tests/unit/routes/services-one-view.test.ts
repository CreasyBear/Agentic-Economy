import { isRedirect } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as AboutRoute } from '@/routes/about'
import { Route as AgentsRoute } from '@/routes/for-agents'
import { Route as HelpRoute } from '@/routes/help'
import { Route as RegistryRoute } from '@/routes/registry'
import { loadServicesRouteReadback } from '@/routes/index'
import type { PublicBusinessCatalogApiV2Page } from '@/modules/registry/public'
import { projectPublicServicesPage } from '@/modules/registry/public'
import { registryServicesSearchAction } from '@/modules/registry/registry.actions'

describe('services one-view route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not load a directory before the visitor asks', async () => {
    const run = vi.spyOn(registryServicesSearchAction, 'run')

    await expect(loadServicesRouteReadback({})).resolves.toBeUndefined()
    expect(run).not.toHaveBeenCalled()
  })

  it('trims q and invokes the registered search action', async () => {
    const sourcePage = page()
    const expected = projectPublicServicesPage(sourcePage)
    const run = vi.spyOn(registryServicesSearchAction, 'run').mockResolvedValue(expected)

    await expect(loadServicesRouteReadback({ q: '  emergency plumbing  ' })).resolves.toEqual(expected)
    expect(run).toHaveBeenCalledWith({
      data: { query: 'emergency plumbing', limit: 10 },
      context: { caller: 'ui' },
    })
  })
})

describe('legacy human route redirects', () => {
  it('/registry permanently redirects to / and keeps q', () => {
    const beforeLoad = RegistryRoute.options.beforeLoad
    if (beforeLoad === undefined) throw new Error('registry redirect is unavailable')

    let thrown: unknown
    try {
      beforeLoad({ search: { q: 'dental' } } as never)
    } catch (error) {
      thrown = error
    }

    expect(isRedirect(thrown)).toBe(true)
    if (!isRedirect(thrown)) return
    expect(thrown.options).toMatchObject({ to: '/', statusCode: 301, search: { q: 'dental' } })
  })

  it.each([
    ['about', AboutRoute],
    ['for-agents', AgentsRoute],
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
})

function page(): PublicBusinessCatalogApiV2Page {
  return {
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v2',
    query: 'emergency plumbing',
    items: [
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
    pagination: { cursor: 'cursor-in', nextCursor: 'cursor-out', limit: 5, total: 1, hasMore: true },
  }
}
