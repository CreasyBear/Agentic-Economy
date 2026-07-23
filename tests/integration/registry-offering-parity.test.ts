import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import type { BusinessSupplyProjection } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  projectBusinessSupplyToPublicApi,
} from '@/modules/registry/public'
import {
  registryDetailAction,
  registryListAction,
  registrySearchAction,
} from '@/modules/registry/registry.actions'
import {
  handleDurableListBusinessesRequest,
} from '@/routes/api.businesses'
import {
  handleDurableBusinessDetailRequest,
} from '@/routes/api.businesses.$slug'
import {
  handleDurableSearchBusinessesRequest,
} from '@/routes/api.businesses.search'

describe('Offering-v2 registry HTTP/action parity', () => {
  it('round-trips both closed profiles through list/search/detail actions without semantic loss', async () => {
    const businesses = [professionalProjection(), machineProjection()]
      .map((projection) => projectBusinessSupplyToPublicApi(projection))
    const page = {
      kind: 'ok' as const,
      schemaVersion: 'public-business-catalog-api:v2' as const,
      items: businesses,
      pagination: { limit: 10, total: 2, hasMore: false },
    }
    const listRun = vi.spyOn(registryListAction, 'run').mockResolvedValue(page)
    const searchRun = vi.spyOn(registrySearchAction, 'run').mockResolvedValue({ ...page, query: 'fixture' })
    const detailRun = vi.spyOn(registryDetailAction, 'run').mockResolvedValue({
      kind: 'found',
      schemaVersion: 'public-business-catalog-api:v2',
      business: businesses[0]!,
    })

    const httpList = await (await handleDurableListBusinessesRequest(
      new Request('https://ae.example/api/businesses?limit=10'),
    )).json()
    const httpSearch = await (await handleDurableSearchBusinessesRequest(
      new Request('https://ae.example/api/businesses/search?q=fixture&limit=10'),
    )).json()
    const httpDetail = await (await handleDurableBusinessDetailRequest('professional-co')).json()

    expect(listRun).toHaveBeenCalledOnce()
    expect(searchRun).toHaveBeenCalledOnce()
    expect(detailRun).toHaveBeenCalledOnce()
    expect(digest(httpList)).toBe(digest(page))
    expect(digest(httpSearch)).toBe(digest({ ...page, query: 'fixture' }))
    expect(digest(httpDetail)).toBe(digest({
      kind: 'found',
      schemaVersion: 'public-business-catalog-api:v2',
      business: businesses[0],
    }))
    expect(httpList.items.map((item: { offerings: unknown[] }) => item.offerings)).toHaveLength(2)
    expect(JSON.stringify([httpList, httpSearch, httpDetail])).not.toMatch(
      /services|trustTier|legacy-offering|contactAvailabilityOrder|sourceHash|credentials|adapterConfig|privateReasons/u,
    )
  })

  it('keeps all three registered operations anonymous, replayable, inspect-only, and effect-free', () => {
    for (const action of [registryListAction, registrySearchAction, registryDetailAction]) {
      expect(action.readOnly).toBe(true)
      expect(action.invocationContract).toMatchObject({
        consequenceClass: 'read_only',
        authorityRequirement: 'none',
        retryClass: 'replayable',
      })
      expect(action.boundaries.join(' ')).toMatch(/does not.*book|charge|dispatch|send inquiries/iu)
    }
  })
})

function professionalProjection(): BusinessSupplyProjection {
  return projection('business:professional', 'professional-co', 'offering:professional', {
    schemaVersion: 'offering-comparison:v1',
    profile: {
      profileId: 'professional_service:v1',
      scopeBasis: known('Fixed scope'),
      priceBasis: known({ description: 'Quoted total', currency: 'AUD', amountMinor: 20_000, unit: 'total' }),
      timingBasis: known('Two weeks'),
      serviceArea: known('Perth'),
    },
  })
}

function machineProjection(): BusinessSupplyProjection {
  return projection('business:machine', 'machine-co', 'offering:machine', {
    schemaVersion: 'offering-comparison:v1',
    profile: {
      profileId: 'machine_data:v1',
      interfaceFormat: known('graphql'),
      requestMethod: known('POST'),
      authentication: known('api_key'),
      priceBasis: known({ description: 'Per request', currency: 'AUD', amountMinor: 5, unit: 'request' }),
      freshnessOrUpdateCadence: known('Updated hourly'),
    },
  })
}

function projection(
  businessId: string,
  slug: string,
  offeringRef: string,
  comparison: BusinessSupplyProjection['offerings'][number]['offering']['comparison'],
): BusinessSupplyProjection {
  return {
    business: {
      businessId: brandNonEmpty(businessId, 'BusinessId'),
      slug,
      name: slug,
      category: 'Fixture',
      suburb: 'Perth',
      stateTerritory: 'WA',
      publicUrl: `/${slug}`,
    },
    offerings: [{
      offering: {
        offeringRef: brandNonEmpty(offeringRef, 'OfferingRef'),
        revision: 3,
        name: `${slug} Offering`,
        category: 'Fixture',
        summary: 'Labelled fixture Offering.',
        comparison,
      },
      accessPaths: [],
      support: {
        integrated: false,
        routeable: false,
        reasons: ['not_integrated'],
      },
    }],
    sourceRevision: 3,
    sourceDigest: brandNonEmpty('hash:fixture', 'SourceHash'),
    observedAt: 100,
    disposition: 'current',
  }
}

function known<T>(value: T) {
  return {
    kind: 'known' as const,
    value,
    source: { kind: 'business_supplied' as const },
    observedAt: 100,
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
