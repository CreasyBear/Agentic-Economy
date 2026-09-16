import { describe, expect, it } from 'vitest'
import type { OfferingPrice } from '@/modules/catalog/public'
import type { CatalogOfferingToolMapEntry } from '@/modules/capability-supply/public'
import type {
  PublicBusinessCatalogApiV2Page,
  PublicBusinessCatalogApiV2SearchPage,
  ServiceToolMap,
} from '@/modules/registry/public'
import { projectPublicServicesPage, projectPublicServicesSearchPage } from '@/modules/registry/public'
import {
  USDC_BASE_SEPOLIA_PAYMENT,
  acmeCatalogPage,
  acmeProjectedServiceExpectation,
  dualOfferingToolMap,
  linkedToolEntry,
  linkedToolMap,
  malformedSearchUrlMappingPage,
  mappingPage,
  mappingPageWithAdditionalPath,
  mappingPageWithPrices,
  offeringToolMap,
  singleOfferingMappingPage,
} from '../../helpers/services-api-projection-fixtures'

const SERVICE_CORE_KEYS = ['ae', 'category', 'description', 'domain', 'endpoints', 'enriched', 'id', 'integrationType', 'name', 'networks', 'priceSummary', 'provider', 'providerUrl', 'serviceName', 'tags'] as const
const SERVICE_AE_KEYS = ['businessContext', 'disposition', 'links', 'observedAt', 'offerings', 'photos', 'publicUrl', 'source', 'trustTier'] as const
const SERVICE_AE_LINK_KEYS = ['business', 'manifest'] as const
const SERVICE_TOP_LEVEL_LEAKS = ['trustTier', 'suburb', 'stateTerritory', 'publicUrl', 'source', 'offerings'] as const
const ENDPOINT_CORE_KEYS = ['ae', 'description', 'method', 'parameters', 'quality', 'serviceName', 'tags', 'url'] as const
const ENDPOINT_CORE_KEYS_ENRICHED = [...ENDPOINT_CORE_KEYS.slice(0, 4), 'pricing', ...ENDPOINT_CORE_KEYS.slice(4)] as const
const ENDPOINT_AE_UNLINKED_KEYS = ['access', 'authentication', 'execution', 'offeringRef', 'provenance', 'settlementSupport'] as const
const ENDPOINT_AE_LINKED_KEYS = ['access', 'authentication', 'authorityMode', 'execution', 'offeringRef', 'provenance', 'settlementSupport', 'sourceKind', 'toolRef'] as const
const LEGACY_ENDPOINT_TOP_KEYS = ['summary', 'catalogPrice', 'offeringRef', 'toolRef'] as const
const CREDENTIAL_LEAK_PATTERN = /credentialRef|credentialValue|env:/u
const CREDENTIAL_LEAK_AMBIGUOUS_PATTERN = /credentialRef|credentialValue|env/u
const CREDENTIAL_LEAK_AUTH_PATTERN = /credentialRef|secret|env/i

function expectSortedKeys(target: object, keys: readonly string[]) {
  expect(Object.keys(target).sort()).toEqual([...keys].sort())
}

function expectAbsentProperties(target: object, keys: readonly string[]) {
  for (const key of keys) {
    expect(target).not.toHaveProperty(key)
  }
}

function firstProjectedService(page: PublicBusinessCatalogApiV2Page = mappingPage(), toolMap?: ServiceToolMap) {
  return projectPublicServicesPage(page, toolMap).services[0]!
}

describe('catalogue Services API Service mapping', () => {
  it('omits businesses without public offerings while preserving page and search cursors', () => {
    const source = mappingPage()
    const publishedBusiness = source.page[0]!
    const emptyBusiness = {
      ...publishedBusiness,
      businessId: 'business-empty',
      slug: 'empty-business',
      name: 'Empty Business',
      offerings: [],
      accessSummary: { humanRequest: false, externalOperation: false, aeSupportedAction: false },
    }
    const page: PublicBusinessCatalogApiV2Page = { ...source, page: [emptyBusiness, publishedBusiness] }
    const projectedPage = projectPublicServicesPage(page)
    expect(projectedPage.services.map(({ id }) => id)).toEqual(['api-exa-ai'])
    expect(projectedPage.isDone).toBe(source.isDone)
    expect(projectedPage.continueCursor).toBe(source.continueCursor)

    const searchPage: PublicBusinessCatalogApiV2SearchPage = {
      kind: 'ok',
      schemaVersion: source.schemaVersion,
      query: 'api',
      items: [emptyBusiness, publishedBusiness],
      pagination: { cursor: 'cursor-in', nextCursor: 'cursor-out', limit: 2, total: 2, hasMore: true },
    }
    const projectedSearch = projectPublicServicesSearchPage(searchPage)
    expect(projectedSearch.services.map(({ id }) => id)).toEqual(['api-exa-ai'])
    expect(projectedSearch.query).toBe('api')
    expect(projectedSearch.pagination).toEqual(searchPage.pagination)
  })

  it('mirrors the v2 Service/Endpoint core keys and nests AE-only data', () => {
    const result = projectPublicServicesPage(mappingPage())
    expect(result.schemaVersion).toBe('public-services-api:v3')
    expect(result.services).toHaveLength(1)
    const service = result.services[0]!
    const firstEndpoint = service.endpoints[0]!
    const secondEndpoint = service.endpoints[1]!

    expectSortedKeys(service, SERVICE_CORE_KEYS)
    expect(service).toMatchObject({
      id: 'api-exa-ai',
      name: 'EXA AI',
      category: 'search',
      domain: 'api.example',
      description: 'Read the text of a page. Search the open web.',
      networks: [],
      enriched: false,
      integrationType: '3P',
      provider: 'EXA AI',
      providerUrl: 'https://api.example',
      serviceName: 'EXA AI',
      tags: ['search'],
      priceSummary: { currency: 'USDC', minAmount: '0.01', maxAmount: '0.07', avgCostBasis: 'varies' },
    })
    expectSortedKeys(service.ae, SERVICE_AE_KEYS)
    expectSortedKeys(service.ae.links, SERVICE_AE_LINK_KEYS)
    expect(service.ae).toMatchObject({
      trustTier: 'listed',
      businessContext: { kind: 'programmable_provider', website: 'https://api.example', providerIdentifier: 'EXA AI' },
      publicUrl: 'https://api.example',
      photos: [],
      observedAt: 1_700_000_000_000,
      disposition: 'current',
      source: 'business_published',
      offerings: expect.arrayContaining([
        expect.objectContaining({ offeringRef: 'offering:api-exa-ai:search' }),
        expect.objectContaining({ offeringRef: 'offering:api-exa-ai:contents' }),
      ]),
    })
    expectAbsentProperties(service, SERVICE_TOP_LEVEL_LEAKS)

    expectSortedKeys(firstEndpoint, ENDPOINT_CORE_KEYS)
    expect(firstEndpoint).toMatchObject({
      url: 'https://api.exa.ai/search',
      method: 'GET',
      description: 'Search the open web.',
      serviceName: 'EXA AI',
      parameters: [],
      quality: null,
      tags: ['search'],
      ae: {
        offeringRef: 'offering:api-exa-ai:search',
        provenance: 'business_declared',
        access: 'external',
        authentication: { kind: 'unknown' },
        execution: 'catalog_only',
        settlementSupport: 'unpriced',
      },
    })
    expectSortedKeys(firstEndpoint.ae, ENDPOINT_AE_UNLINKED_KEYS)
    expect(secondEndpoint.ae.offeringRef).toBe('offering:api-exa-ai:contents')
    expectAbsentProperties(firstEndpoint, [...LEGACY_ENDPOINT_TOP_KEYS, 'name'])
    expectAbsentProperties(firstEndpoint, ['inputJsonSchema', 'outputJsonSchema'])
    expect(firstEndpoint.ae).not.toHaveProperty('toolRef')
  })

  it('derives integrationType 1P only from linked provider-owned supply', () => {
    expect(firstProjectedService()).toMatchObject({ integrationType: '3P' })
    const observedService = firstProjectedService(mappingPage('publicly_observed'))
    expect(observedService).toMatchObject({ integrationType: '3P' })
    expect(observedService.endpoints[0]).not.toHaveProperty('providerName')
  })

  it('enriches a linked endpoint with toolRef+parameters+pricing and keeps an unlinked one absent (W1)', () => {
    const service = firstProjectedService(mappingPage(), linkedToolMap('offering:api-exa-ai:search'))
    const searchEndpoint = service.endpoints[0]!
    const contentsEndpoint = service.endpoints[1]!

    expect(service.enriched).toBe(true)
    expectSortedKeys(searchEndpoint, ENDPOINT_CORE_KEYS_ENRICHED)
    expect(searchEndpoint.ae).toMatchObject({
      toolRef: 'operation:v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      offeringRef: 'offering:api-exa-ai:search',
      provenance: 'business_declared',
      access: 'external',
      authentication: { kind: 'ae_api_key' },
      execution: 'tool_call',
      authorityMode: 'ae_curated_external',
      sourceKind: 'openapi_http',
      settlementSupport: 'catalog_only',
    })
    expectSortedKeys(searchEndpoint.ae, ENDPOINT_AE_LINKED_KEYS)
    expectAbsentProperties(searchEndpoint, LEGACY_ENDPOINT_TOP_KEYS)
    expect(searchEndpoint.parameters).toEqual([
      { group: 'body', name: 'query', type: 'string', description: 'Search query', required: true },
    ])
    expect(searchEndpoint.pricing).toEqual({ scheme: 'exact', amount: '0.01', currency: 'USDC' })
    expect(searchEndpoint.pricing).not.toHaveProperty('network')

    expect(contentsEndpoint.ae).not.toHaveProperty('toolRef')
    expect(contentsEndpoint).not.toHaveProperty('pricing')
    expect(contentsEndpoint.parameters).toEqual([])
    expect(contentsEndpoint.tags).toEqual(['search'])
    expect(contentsEndpoint.quality).toBeNull()

    const plainEndpoint = firstProjectedService().endpoints[0]!
    expect(plainEndpoint.ae).not.toHaveProperty('toolRef')
    expect(plainEndpoint).not.toHaveProperty('pricing')
  })

  it('preserves Agent Plugin MCP provenance in the public endpoint projection', () => {
    const linked = linkedToolMap('offering:api-exa-ai:search')
    const pluginMap: ServiceToolMap = {
      ...linked,
      'offering:api-exa-ai:search': linked['offering:api-exa-ai:search']!.map((entry) => ({
        ...entry,
        sourceKind: 'agent_plugin_mcp' as const,
      })),
    }
    expect(firstProjectedService(mappingPage(), pluginMap).endpoints[0]!.ae).toMatchObject({
      sourceKind: 'agent_plugin_mcp',
    })
  })

  it('refuses stale or ambiguous Tool linkage', () => {
    const current = linkedToolMap('offering:api-exa-ai:search')
    const stale: ServiceToolMap = {
      ...current,
      'offering:api-exa-ai:search': [{ ...current['offering:api-exa-ai:search']![0]!, offeringRevision: 2 }],
    }
    expect(firstProjectedService(mappingPage(), stale).enriched).toBe(false)

    const ambiguous: ServiceToolMap = {
      'offering:api-exa-ai:search': [
        ...current['offering:api-exa-ai:search']!,
        ...current['offering:api-exa-ai:search']!,
      ],
    }
    const ambiguousService = firstProjectedService(mappingPage(), ambiguous)
    expect(ambiguousService.enriched).toBe(false)
    const ambiguousEndpoint = ambiguousService.endpoints[0]!
    expect(ambiguousEndpoint.ae).toMatchObject({
      access: 'external',
      execution: 'catalog_only',
      authentication: { kind: 'unknown' },
      settlementSupport: 'unpriced',
    })
    expect(ambiguousEndpoint.ae).not.toHaveProperty('toolRef')
    expect(ambiguousEndpoint).not.toHaveProperty('pricing')
    expect(JSON.stringify(ambiguousEndpoint)).not.toMatch(CREDENTIAL_LEAK_AMBIGUOUS_PATTERN)

    const additionalPath = firstProjectedService(
      mappingPageWithAdditionalPath(),
      linkedToolMap('offering:api-exa-ai:search'),
    )
    expect(additionalPath.enriched).toBe(true)
    expect(additionalPath.endpoints[0]!.ae.toolRef).toBeDefined()
    expect(additionalPath.endpoints[1]!.ae).not.toHaveProperty('toolRef')
  })

  it('matches two same-offering paths to their distinct Tool entries', () => {
    const first = linkedToolEntry('offering:api-exa-ai:search')
    const secondToolRef = 'operation:v1:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210' as CatalogOfferingToolMapEntry['toolRef']
    const toolMap: ServiceToolMap = {
      'offering:api-exa-ai:search': [
        first,
        {
          ...first,
          declaredAccessPathRef: 'path-search-mirror',
          accessPathSourceHash: 'source:search-mirror-path',
          endpointUrl: 'https://mirror.example/search',
          method: 'POST',
          toolRef: secondToolRef,
        },
      ],
    }
    const endpoints = firstProjectedService(mappingPageWithAdditionalPath(), toolMap).endpoints
    expect(endpoints.map((endpoint) => endpoint.ae.toolRef)).toEqual([first.toolRef, secondToolRef, undefined])
    expect(JSON.stringify(endpoints)).not.toMatch(CREDENTIAL_LEAK_PATTERN)
  })

  it('uses the canonical tool_call execution enum only for linked ae_api_key Tools', () => {
    const entry = linkedToolEntry('offering:api-exa-ai:search')
    const endpoint = firstProjectedService(mappingPage(), offeringToolMap({ 'offering:api-exa-ai:search': entry })).endpoints[0]!
    expect(endpoint.ae).toMatchObject({ access: 'external', execution: 'tool_call', toolRef: entry.toolRef })
  })

  it('does not claim executable settlement for a non-routeable operation', () => {
    const entry = linkedToolEntry('offering:api-exa-ai:search', USDC_BASE_SEPOLIA_PAYMENT)
    const endpoint = firstProjectedService(mappingPage(), offeringToolMap({
      'offering:api-exa-ai:search': { ...entry, routeable: false },
    })).endpoints[0]!
    expect(endpoint.ae.settlementSupport).toBe('catalog_only')
    expect(endpoint.ae).toMatchObject({ access: 'external', execution: 'catalog_only' })
  })
})

describe('catalogue Services API payment network projection', () => {
  it('deduplicates the payment network shared by two linked endpoints', () => {
    const network = USDC_BASE_SEPOLIA_PAYMENT.network
    const service = firstProjectedService(mappingPage(), dualOfferingToolMap(USDC_BASE_SEPOLIA_PAYMENT))
    expect(service.networks).toEqual([network])
    expect(service.endpoints.map((endpoint) => endpoint.pricing?.network)).toEqual([network, network])
    expect(service).not.toHaveProperty('networkId')
    expect(JSON.stringify(service)).not.toContain('ae:public')
  })

  it('sorts distinct CAIP-2 networks and never substitutes the AE registry partition', () => {
    const service = firstProjectedService(mappingPage(), offeringToolMap({
      'offering:api-exa-ai:search': {
        network: 'solana:mainnet',
        asset: 'So11111111111111111111111111111111111111112',
        currency: 'USDC',
        routeAmountExponent: 2,
        assetAmountExponent: 6,
      },
      'offering:api-exa-ai:contents': {
        network: 'eip155:8453',
        asset: '0x0000000000000000000000000000000000000001',
        currency: 'USDC',
        routeAmountExponent: 2,
        assetAmountExponent: 6,
      },
    }))
    expect(service.networks).toEqual(['eip155:8453', 'solana:mainnet'])
    expect(service.networks).not.toContain('ae:public')
    expect(service.endpoints.map((endpoint) => endpoint.pricing?.network)).toEqual(['solana:mainnet', 'eip155:8453'])
  })

  it('excludes keyless and unlinked endpoints from payment networks', () => {
    const service = firstProjectedService(mappingPage(), linkedToolMap('offering:api-exa-ai:search'))
    const keylessEndpoint = service.endpoints[0]!
    const unlinkedEndpoint = service.endpoints[1]!
    expect(service.networks).toEqual([])
    expect(keylessEndpoint.pricing).toEqual({ scheme: 'exact', amount: '0.01', currency: 'USDC' })
    expect(keylessEndpoint.pricing).not.toHaveProperty('network')
    expect(keylessEndpoint.ae.settlementSupport).toBe('catalog_only')
    expect(unlinkedEndpoint).not.toHaveProperty('pricing')
    expect(unlinkedEndpoint.ae.settlementSupport).toBe('unpriced')
  })

  it('omits pricing and network on a payment-price currency mismatch', () => {
    const endpoint = firstProjectedService(mappingPage(), offeringToolMap({
      'offering:api-exa-ai:search': { ...USDC_BASE_SEPOLIA_PAYMENT, currency: 'USD' },
    })).endpoints[0]!
    expect(endpoint).not.toHaveProperty('pricing')
    expect(endpoint.pricing).toBeUndefined()
    expect(endpoint.ae).toMatchObject({ toolRef: expect.any(String), settlementSupport: 'catalog_only' })
    expect(endpoint.ae).not.toHaveProperty('networkId')
  })
})

describe('public services API projection', () => {
  it('rolls one published business into ONE canonical Service with flat endpoints across offerings', () => {
    const result = projectPublicServicesPage(acmeCatalogPage())
    expect(result.services).toHaveLength(1)
    expect(result.services[0]).toMatchObject(acmeProjectedServiceExpectation())
    expect(result.services[0]).not.toHaveProperty('offerings')
    expect(result.services[0]!.ae).not.toHaveProperty('responseTimeMinutes')
    expect(result.services[0]!.endpoints[1]).not.toHaveProperty('providerName')
    expect(result.services[0]!.endpoints[0]).not.toHaveProperty('summary')
    expect(result.services[0]!.endpoints[0]).not.toHaveProperty('offeringRef')
  })

  it('passes source cursor state through', () => {
    const source = acmeCatalogPage()
    const result = projectPublicServicesPage(source)
    expect(result).toMatchObject({
      kind: 'ok',
      schemaVersion: 'public-services-api:v3',
      isDone: false,
      continueCursor: 'cursor-out',
    })
    expect(result.isDone).toBe(source.isDone)
    expect(result.continueCursor).toBe(source.continueCursor)
  })
})

describe('catalogue Services API merchandising fields (CAVEAT 2)', () => {
  it('derives provider identity and domain from programmable-provider context', () => {
    const service = firstProjectedService()
    expect(service.provider).toBe('EXA AI')
    expect(service.providerUrl).toBe('https://api.example')
    expect(service.domain).toBe('api.example')
    expect(service.networks).toEqual([])
  })

  it('omits provider URL and domain when the programmable-provider website is not http(s)', () => {
    const source = mappingPage()
    const pageWithBadUrl: PublicBusinessCatalogApiV2Page = {
      ...source,
      page: source.page.map((business) => ({
        ...business,
        publicUrl: 'not-a-url',
        businessContext: { kind: 'programmable_provider' as const, website: 'not-a-url', providerIdentifier: 'EXA AI' },
      })),
    }
    const service = firstProjectedService(pageWithBadUrl)
    expect(service.provider).toBe('EXA AI')
    expect(service.providerUrl).toBe('not-a-url')
    expect(service).not.toHaveProperty('domain')
    expect(service.networks).toEqual([])
  })
})

describe('Service price summary honesty', () => {
  it.each([
    {
      label: 'a starting price has no published upper bound',
      prices: [
        { kind: 'from', amount: { currency: 'USDC', units: '1', exponent: 2 }, taxTreatment: 'inclusive' },
        { kind: 'fixed', amount: { currency: 'USDC', units: '7', exponent: 2 }, taxTreatment: 'inclusive' },
      ] satisfies readonly [OfferingPrice, OfferingPrice],
    },
    {
      label: 'prices have incomparable units or tax treatment',
      prices: [
        { kind: 'fixed', amount: { currency: 'USDC', units: '1', exponent: 2 }, unit: 'hour', taxTreatment: 'inclusive' },
        { kind: 'range', minimum: { currency: 'USDC', units: '4', exponent: 2 }, maximum: { currency: 'USDC', units: '7', exponent: 2 }, unit: 'job', taxTreatment: 'exclusive' },
      ] satisfies readonly [OfferingPrice, OfferingPrice],
    },
  ])('omits a summary when $label', ({ prices }) => {
    expect(firstProjectedService(mappingPageWithPrices(prices))).not.toHaveProperty('priceSummary')
  })
})

describe('sub-cent catalog price representation (CAVEAT 3)', () => {
  it('maps a sub-cent catalog price while preserving the exact Service priceSummary', () => {
    const service = firstProjectedService(mappingPage(), offeringToolMap({
      'offering:api-exa-ai:search': {
        ...linkedToolEntry('offering:api-exa-ai:search'),
        catalogPrice: { scheme: 'exact', amount: '0.007', currency: 'USDC' },
      },
    }))
    const endpoint = service.endpoints[0]!
    expect(endpoint.pricing).toEqual({ scheme: 'exact', amount: '0.007', currency: 'USDC' })
    expect(endpoint.pricing).not.toHaveProperty('network')
    expect(endpoint.pricing).not.toHaveProperty('subCent')
    expect(endpoint.ae.settlementSupport).toBe('catalog_only')
    expect(endpoint.ae.toolRef).toBeDefined()
    expect(service.enriched).toBe(true)
    expect(service.priceSummary).toEqual({
      currency: 'USDC',
      minAmount: '0.007',
      maxAmount: '0.007',
      avgCostPerTransaction: '0.007',
      avgCostBasis: 'exact',
    })
    expect(service.ae.offerings[0]!.price).toEqual(
      expect.objectContaining({ kind: 'fixed', amount: { currency: 'USDC', units: '1', exponent: 2 } }),
    )
  })

  it('aggregates endpoint prices exactly at a common exponent', () => {
    const service = firstProjectedService(mappingPage(), offeringToolMap({
      'offering:api-exa-ai:search': {
        ...linkedToolEntry('offering:api-exa-ai:search'),
        catalogPrice: { scheme: 'exact', amount: '0.001', currency: 'USDC' },
      },
      'offering:api-exa-ai:contents': {
        ...linkedToolEntry('offering:api-exa-ai:contents'),
        catalogPrice: { scheme: 'exact', amount: '0.007', currency: 'USDC' },
      },
    }))
    expect(service.priceSummary).toEqual({
      currency: 'USDC',
      minAmount: '0.001',
      maxAmount: '0.007',
      avgCostPerTransaction: '0.004',
      avgCostBasis: 'exact',
    })
  })

  it('exposes public auth and execution only from linked operation metadata', () => {
    const oneOfferingPage = singleOfferingMappingPage()
    const service = firstProjectedService(oneOfferingPage, offeringToolMap({
      'offering:api-exa-ai:search': {
        ...linkedToolEntry('offering:api-exa-ai:search'),
        authorityMode: 'provider_owned',
        authentication: { kind: 'platform_credential', scheme: 'api_key', in: 'header', name: 'X-API-Key' },
      },
    }))
    const endpoint = service.endpoints[0]!
    expect(service.integrationType).toBe('1P')
    expect(service.provider).toBe('EXA AI')
    expect(endpoint.providerName).toBe('EXA AI')
    expect(endpoint.ae).toMatchObject({
      authentication: { kind: 'platform_credential', scheme: 'api_key', in: 'header', name: 'X-API-Key' },
      execution: 'request_route',
      authorityMode: 'provider_owned',
      sourceKind: 'openapi_http',
    })
    expect(firstProjectedService(oneOfferingPage, offeringToolMap({
      'offering:api-exa-ai:search': { ...linkedToolEntry('offering:api-exa-ai:search'), authorityMode: 'provider_owned' },
    })).endpoints[0]!.ae.execution).toBe('tool_call')
    expect(JSON.stringify(endpoint)).not.toMatch(CREDENTIAL_LEAK_AUTH_PATTERN)

    const unlinked = firstProjectedService(oneOfferingPage)
    expect(unlinked.integrationType).toBe('3P')
    expect(unlinked.provider).toBe('EXA AI')
    expect(unlinked.endpoints[0]).not.toHaveProperty('providerName')
  })

  it('omits malformed endpoint URLs instead of fabricating callable paths', () => {
    const service = firstProjectedService(malformedSearchUrlMappingPage())
    expect(service.endpoints).toHaveLength(1)
    expect(service.endpoints[0]!.url).toBe('https://api.exa.ai/contents')
    expect(service.endpoints.some((endpoint) => endpoint.url === 'not-a-url')).toBe(false)
  })

  it('emits executable settlement without a sub-cent marker when the decimal equals the integer-minor amount', () => {
    const endpoint = firstProjectedService(mappingPage(), offeringToolMap({
      'offering:api-exa-ai:search': USDC_BASE_SEPOLIA_PAYMENT,
    })).endpoints[0]!
    expect(endpoint.pricing).toEqual({
      scheme: 'exact',
      amount: '0.01',
      currency: 'USDC',
      network: 'eip155:84532',
    })
    expect(endpoint.pricing).not.toHaveProperty('subCent')
    expect(endpoint.ae.settlementSupport).toBe('executable')
  })
})
