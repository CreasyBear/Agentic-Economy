import { describe, expect, it } from 'vitest'
import type { OfferingPrice } from '@/modules/catalog/public'

import type { CatalogOfferingOperationMapEntry } from '@/modules/capability-supply/public'
import type {
  PublicBusinessCatalogApiV2Page,
  ServiceOperationMap,
} from '@/modules/registry/public'
import { projectPublicServicesPage, toConsumerSupplyOption } from '@/modules/registry/public'
import { isOpenSandboxEndpoint } from '@/modules/sandbox-supply/public'

describe('agentic.market Service mapping', () => {
  it('mirrors the v2 Service/Endpoint core keys and nests AE-only data', () => {
    const result = projectPublicServicesPage(mappingPage())

    expect(result.schemaVersion).toBe('public-services-api:v2')
    expect(result.services).toHaveLength(1)
    const service = result.services[0]!
    const firstEndpoint = service.endpoints[0]!
    const secondEndpoint = service.endpoints[1]!

    // Exact agentic.market Service core names. AE-only merchandising and
    // source data stay together under `ae`, never leak into the core.
    expect(Object.keys(service).sort()).toEqual([
      'ae',
      'category',
      'domain',
      'endpoints',
      'enriched',
      'id',
      'integrationType',
      'name',
      'networks',
      'priceSummary',
      'serviceName',
      'tags',
    ])
    expect(service).toMatchObject({
      id: 'api-exa-ai',
      name: 'EXA AI',
      category: 'search',
      domain: 'api.example',
      networks: [],
      enriched: false,
      integrationType: '3P',
      serviceName: 'EXA AI',
      tags: [],
      priceSummary: { currency: 'USDC', minAmount: '0.01', maxAmount: '0.07', avgCostBasis: 'varies' },
    })
    expect(Object.keys(service.ae).sort()).toEqual([
      'disposition',
      'links',
      'observedAt',
      'offerings',
      'photos',
      'publicUrl',
      'source',
      'stateTerritory',
      'suburb',
      'trustTier',
    ])
    expect(Object.keys(service.ae.links).sort()).toEqual(['business', 'manifest'])
    expect(service.ae).toMatchObject({
      trustTier: 'listed',
      suburb: 'Melbourne',
      stateTerritory: 'VIC',
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
    expect(service).not.toHaveProperty('trustTier')
    expect(service).not.toHaveProperty('suburb')
    expect(service).not.toHaveProperty('stateTerritory')
    expect(service).not.toHaveProperty('publicUrl')
    expect(service).not.toHaveProperty('source')
    expect(service).not.toHaveProperty('offerings')

    // Exact agentic.market Endpoint core names. Legacy AE endpoint fields
    // (`summary`, `catalogPrice`, `offeringRef`, `operationRef`) are absent at
    // the top level; the linkage belongs under `ae`.
    expect(Object.keys(firstEndpoint).sort()).toEqual([
      'ae',
      'description',
      'method',
      'parameters',
      'quality',
      'serviceName',
      'tags',
      'url',
    ])
    expect(firstEndpoint).toMatchObject({
      url: 'https://api.exa.ai/search',
      method: 'GET',
      description: 'Search the open web.',
      serviceName: 'EXA AI',
      parameters: [],
      quality: null,
      tags: [],
      ae: {
        offeringRef: 'offering:api-exa-ai:search',
        provenance: 'business_declared',
        access: 'external',
        authentication: { kind: 'unknown' },
        execution: 'catalog_only',
        settlementSupport: 'unpriced',
      },
    })
    expect(Object.keys(firstEndpoint.ae).sort()).toEqual([
      'access',
      'authentication',
      'execution',
      'offeringRef',
      'provenance',
      'settlementSupport',
    ])
    expect(secondEndpoint.ae.offeringRef).toBe('offering:api-exa-ai:contents')
    expect(firstEndpoint).not.toHaveProperty('summary')
    expect(firstEndpoint).not.toHaveProperty('catalogPrice')
    expect(firstEndpoint).not.toHaveProperty('offeringRef')
    expect(firstEndpoint).not.toHaveProperty('operationRef')
    expect(firstEndpoint).not.toHaveProperty('name')

    // NEGATIVE: endpoints[] must not inline the full execution schema.
    expect(firstEndpoint).not.toHaveProperty('inputJsonSchema')
    expect(firstEndpoint).not.toHaveProperty('outputJsonSchema')
    // NEGATIVE: a field with no source (operationRef) stays absent, not fabricated.
    expect(firstEndpoint.ae).not.toHaveProperty('operationRef')
  })

  it('derives integrationType 1P only from linked provider-owned supply', () => {
    expect(projectPublicServicesPage(mappingPage()).services[0]!).toMatchObject({ integrationType: '3P' })
    const observedService = projectPublicServicesPage(mappingPage('publicly_observed')).services[0]!
    expect(observedService).toMatchObject({ integrationType: '3P' })
    expect(observedService.endpoints[0]).not.toHaveProperty('providerName')
  })

  it('enriches a linked endpoint with operationRef+parameters+pricing and keeps an unlinked one absent (W1)', () => {
    const operationMap = linkedOperationMap('offering:api-exa-ai:search')
    const result = projectPublicServicesPage(mappingPage(), operationMap)

    const service = result.services[0]!
    const searchEndpoint = service.endpoints[0]!
    const contentsEndpoint = service.endpoints[1]!

    expect(service.enriched).toBe(true)
    expect(Object.keys(searchEndpoint).sort()).toEqual([
      'ae',
      'description',
      'method',
      'parameters',
      'pricing',
      'quality',
      'serviceName',
      'tags',
      'url',
    ])
    expect(searchEndpoint.ae).toMatchObject({
      operationRef: 'operation:v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      offeringRef: 'offering:api-exa-ai:search',
      provenance: 'business_declared',
      access: 'external',
      authentication: { kind: 'keyless' },
      execution: 'request_route',
      authorityMode: 'ae_curated_external',
      sourceKind: 'openapi_http',
      settlementSupport: 'catalog_only',
    })
    expect(Object.keys(searchEndpoint.ae).sort()).toEqual([
      'access',
      'authentication',
      'authorityMode',
      'execution',
      'offeringRef',
      'operationRef',
      'provenance',
      'settlementSupport',
      'sourceKind',
    ])
    for (const legacyKey of ['summary', 'catalogPrice', 'offeringRef', 'operationRef']) {
      expect(searchEndpoint).not.toHaveProperty(legacyKey)
    }
    expect(searchEndpoint.parameters).toEqual([
      { group: 'body', name: 'query', type: 'string', description: 'Search query', required: true },
    ])
    expect(searchEndpoint.pricing).toEqual({ scheme: 'exact', amount: '0.01', currency: 'USDC' })
    expect(searchEndpoint.pricing).not.toHaveProperty('network')

    // The contents offering is NOT in the map -> stays absent, never fabricated.
    expect(contentsEndpoint.ae).not.toHaveProperty('operationRef')
    expect(contentsEndpoint).not.toHaveProperty('pricing')
    expect(contentsEndpoint.parameters).toEqual([])
    expect(contentsEndpoint.tags).toEqual([])
    expect(contentsEndpoint.quality).toBeNull()
    // Unmapped run still yields plain endpoints (fully additive).
    const plainEndpoint = projectPublicServicesPage(mappingPage()).services[0]!.endpoints[0]!
    expect(plainEndpoint.ae).not.toHaveProperty('operationRef')
    expect(plainEndpoint).not.toHaveProperty('pricing')
  })
 
  it('preserves Agent Plugin MCP provenance in the public endpoint projection', () => {
    const linked = linkedOperationMap('offering:api-exa-ai:search')
    const pluginMap: ServiceOperationMap = {
      ...linked,
      'offering:api-exa-ai:search': linked['offering:api-exa-ai:search']!.map((entry) => ({
        ...entry,
        sourceKind: 'agent_plugin_mcp' as const,
      })),
    }
    const endpoint = projectPublicServicesPage(mappingPage(), pluginMap).services[0]!.endpoints[0]!
    expect(endpoint.ae).toMatchObject({ sourceKind: 'agent_plugin_mcp' })
  })

  it('refuses stale or ambiguous operation linkage', () => {
    const current = linkedOperationMap('offering:api-exa-ai:search')
    const stale: ServiceOperationMap = {
      ...current,
      'offering:api-exa-ai:search': [{
        ...current['offering:api-exa-ai:search']![0]!,
        offeringRevision: 2,
      }],
    }
    expect(projectPublicServicesPage(mappingPage(), stale).services[0]!.enriched).toBe(false)

    const ambiguous: ServiceOperationMap = {
      'offering:api-exa-ai:search': [
        ...current['offering:api-exa-ai:search']!,
        ...current['offering:api-exa-ai:search']!,
      ],
    }
    expect(projectPublicServicesPage(mappingPage(), ambiguous).services[0]!.enriched).toBe(false)

    const additionalPath = projectPublicServicesPage(
      mappingPageWithAdditionalPath(),
      linkedOperationMap('offering:api-exa-ai:search'),
    ).services[0]!
    expect(additionalPath.enriched).toBe(true)
    expect(additionalPath.endpoints[0]!.ae.operationRef).toBeDefined()
    expect(additionalPath.endpoints[1]!.ae).not.toHaveProperty('operationRef')
  })

  it('matches two same-offering paths to their distinct operation entries', () => {
    const first = linkedOperationEntry('offering:api-exa-ai:search')
    const secondOperationRef = 'operation:v1:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210' as CatalogOfferingOperationMapEntry['operationRef']
    const operationMap: ServiceOperationMap = {
      'offering:api-exa-ai:search': [
        first,
        {
          ...first,
          declaredAccessPathRef: 'path-search-mirror',
          accessPathSourceHash: 'source:search-mirror-path',
          endpointUrl: 'https://mirror.example/search',
          method: 'POST',
          operationRef: secondOperationRef,
        },
      ],
    }
    const endpoints = projectPublicServicesPage(mappingPageWithAdditionalPath(), operationMap).services[0]!.endpoints

    expect(endpoints.map((endpoint) => endpoint.ae.operationRef)).toEqual([
      first.operationRef,
      secondOperationRef,
      undefined,
    ])
    expect(JSON.stringify(endpoints)).not.toMatch(/credentialRef|credentialValue|env:/)
  })

  it('does not claim executable settlement for a non-routeable operation', () => {
    const entry = linkedOperationEntry('offering:api-exa-ai:search', {
      network: 'eip155:84532',
      asset: '0x0000000000000000000000000000000000000001',
      currency: 'USDC',
      routeAmountExponent: 2,
      assetAmountExponent: 6,
    })
    const operationMap: ServiceOperationMap = {
      'offering:api-exa-ai:search': [{ ...entry, routeable: false }],
    }
    const endpoint = projectPublicServicesPage(mappingPage(), operationMap).services[0]!.endpoints[0]!
    expect(endpoint.ae.settlementSupport).toBe('catalog_only')
  })

})
describe('agentic.market payment network projection', () => {
  it('deduplicates the payment network shared by two linked endpoints', () => {
    const network = 'eip155:84532'
    const operationMap: ServiceOperationMap = {
      'offering:api-exa-ai:search': [linkedOperationEntry('offering:api-exa-ai:search', {
        network,
        asset: '0x0000000000000000000000000000000000000001',
        currency: 'USDC',
        routeAmountExponent: 2,
        assetAmountExponent: 6,
      })],
      'offering:api-exa-ai:contents': [linkedOperationEntry('offering:api-exa-ai:contents', {
        network,
        asset: '0x0000000000000000000000000000000000000001',
        currency: 'USDC',
        routeAmountExponent: 2,
        assetAmountExponent: 6,
      })],
    }

    const service = projectPublicServicesPage(mappingPage(), operationMap).services[0]!

    expect(service.networks).toEqual([network])
    expect(service.endpoints.map((endpoint) => endpoint.pricing?.network)).toEqual([network, network])
    expect(service).not.toHaveProperty('networkId')
    expect(JSON.stringify(service)).not.toContain('ae:public')
  })

  it('sorts distinct CAIP-2 networks and never substitutes the AE registry partition', () => {
    const operationMap: ServiceOperationMap = {
      'offering:api-exa-ai:search': [linkedOperationEntry('offering:api-exa-ai:search', {
        network: 'solana:mainnet',
        asset: 'So11111111111111111111111111111111111111112',
        currency: 'USDC',
        routeAmountExponent: 2,
        assetAmountExponent: 6,
      })],
      'offering:api-exa-ai:contents': [linkedOperationEntry('offering:api-exa-ai:contents', {
        network: 'eip155:8453',
        asset: '0x0000000000000000000000000000000000000001',
        currency: 'USDC',
        routeAmountExponent: 2,
        assetAmountExponent: 6,
      })],
    }

    const service = projectPublicServicesPage(mappingPage(), operationMap).services[0]!

    expect(service.networks).toEqual(['eip155:8453', 'solana:mainnet'])
    expect(service.networks).not.toContain('ae:public')
    expect(service.endpoints.map((endpoint) => endpoint.pricing?.network)).toEqual([
      'solana:mainnet',
      'eip155:8453',
    ])
  })

  it('excludes keyless and unlinked endpoints from payment networks', () => {
    const operationMap = linkedOperationMap('offering:api-exa-ai:search')
    const service = projectPublicServicesPage(mappingPage(), operationMap).services[0]!
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
    const operationMap: ServiceOperationMap = {
      'offering:api-exa-ai:search': [linkedOperationEntry('offering:api-exa-ai:search', {
        network: 'eip155:84532',
        asset: '0x0000000000000000000000000000000000000001',
        currency: 'USD',
        routeAmountExponent: 2,
        assetAmountExponent: 6,
      })],
    }

    const endpoint = projectPublicServicesPage(mappingPage(), operationMap).services[0]!.endpoints[0]!

    expect(endpoint).not.toHaveProperty('pricing')
    expect(endpoint.pricing).toBeUndefined()
    expect(endpoint.ae).toMatchObject({
      operationRef: expect.any(String),
      settlementSupport: 'catalog_only',
    })
    expect(endpoint.ae).not.toHaveProperty('networkId')
  })
})

describe('public services API projection', () => {
  it('rolls one published business into ONE canonical Service with flat endpoints across offerings', () => {
    const result = projectPublicServicesPage(page())

    expect(result.services).toHaveLength(1)
    expect(result.services[0]).toMatchObject({
      id: 'acme-plumbing',
      name: 'Acme Plumbing',
      category: 'plumbing',
      domain: 'acme.example',
      networks: [],
      enriched: false,
      integrationType: '3P',
      serviceName: 'Acme Plumbing',
      tags: [],
      priceSummary: { currency: 'AUD', minAmount: '80.00', maxAmount: '80.00', avgCostBasis: 'exact' },
      ae: {
        suburb: 'Fremantle',
        stateTerritory: 'WA',
        source: 'ae_sandbox',
        offerings: [
          {
            offeringRef: 'offering-open',
            revision: 3,
            name: 'Emergency checkup',
            price: { kind: 'fixed', amount: { currency: 'AUD', units: '8000', exponent: 2 }, unit: 'job', taxTreatment: 'inclusive' },
            support: { integrated: false, routeable: false, observedAt: 1_700_000_000_001 },
          },
          { offeringRef: 'offering-empty', name: 'Inspection' },
        ],
        links: {
          business: '/api/businesses/acme-plumbing',
          manifest: '/acme-plumbing/ucp',
        },
      },
      endpoints: [
        {
          url: '/api/sandbox/acme-plumbing/checkup-quote',
          description: 'Returns a sandbox quote.',
          method: 'POST',
          serviceName: 'Acme Plumbing',
          parameters: [],
          quality: null,
          tags: [],
          ae: {
            offeringRef: 'offering-open',
            provenance: 'business_declared',
            access: 'open',
            authentication: { kind: 'keyless' },
            execution: 'request_route',
            authenticationSummary: 'No API key required in the sandbox.',
            settlementSupport: 'unpriced',
          },
        },
        {
          url: 'https://provider.example/operations/emergency-checkup',
          description: 'Provider-owned operation.',
          method: 'POST',
          serviceName: 'Acme Plumbing',
          parameters: [],
          quality: null,
          tags: [],
          ae: {
            offeringRef: 'offering-open',
            provenance: 'publicly_observed',
            access: 'external',
            authentication: { kind: 'unknown' },
            execution: 'catalog_only',
            settlementSupport: 'unpriced',
          },
        },
      ],
    })
    expect(result.services[0]).not.toHaveProperty('offerings')
    expect(result.services[0]!.ae).not.toHaveProperty('responseTimeMinutes')
    expect(result.services[0]!.endpoints[1]).not.toHaveProperty('providerName')
    expect(result.services[0]!.endpoints[0]).not.toHaveProperty('summary')
    expect(result.services[0]!.endpoints[0]).not.toHaveProperty('offeringRef')
  })

  it('carries exact published availability and observation into the consumer supply adapter', () => {
    const result = toConsumerSupplyOption(projectPublicServicesPage(page()).services[0]!)

    expect(result).toMatchObject({
      optionRef: 'acme-plumbing',
      business: { slug: 'acme-plumbing', name: 'Acme Plumbing', location: 'Fremantle, WA' },
      availability: { kind: 'published', summary: 'Weekdays by appointment' },
      evidence: { source: 'ae_sandbox', observedAt: 1_700_000_000_000 },
    })
  })

  it('passes source cursor state through', () => {
    const source = page()
    const result = projectPublicServicesPage(source)

    expect(result).toMatchObject({
      kind: 'ok',
      schemaVersion: 'public-services-api:v2',
      isDone: false,
      continueCursor: 'cursor-out',
    })
    expect(result.isDone).toBe(source.isDone)
    expect(result.continueCursor).toBe(source.continueCursor)
  })

  it('opens only the exact keyless POST quote path', () => {
    const path = '/api/sandbox/acme-plumbing/checkup-quote'
    expect(isOpenSandboxEndpoint(`https://other.example${path}`, 'acme-plumbing')).toBe(true)
    expect(isOpenSandboxEndpoint(path, 'acme-plumbing', 'POST')).toBe(true)
    expect(isOpenSandboxEndpoint(path, 'acme-plumbing', 'GET')).toBe(false)
    expect(isOpenSandboxEndpoint(`${path}?source=catalog`, 'acme-plumbing')).toBe(false)
    expect(isOpenSandboxEndpoint(`${path}#fragment`, 'acme-plumbing')).toBe(false)
    expect(isOpenSandboxEndpoint(`https://user:pass@other.example${path}`, 'acme-plumbing')).toBe(false)
  })
})

describe('agentic.market merchandising fields (CAVEAT 2)', () => {
  it('derives provider attribution only from authoritative provider-owned linkage and keeps networks empty', () => {
    const service = projectPublicServicesPage(mappingPage()).services[0]!

    expect(service.provider).toBeUndefined()
    expect(service.providerUrl).toBeUndefined()
    expect(service.domain).toBe('api.example')
    expect(service.networks).toEqual([])
  })

  it('omits domain when the public URL is not a parseable http(s) URL (no fabrication)', () => {
    const nonUrl = mappingPage()
    // Force an unparseable publicUrl so no domain may be derived.
    const page = nonUrl.kind === 'ok'
      ? { ...nonUrl, page: nonUrl.page.map((business) => business.slug === 'api-exa-ai'
          ? { ...business, publicUrl: 'not-a-url' }
          : business) }
      : nonUrl
    const service = projectPublicServicesPage(page).services[0]!
    expect(service.provider).toBeUndefined()
    expect(service.providerUrl).toBeUndefined()
    expect(service).not.toHaveProperty('domain')
    expect(service.networks).toEqual([])
  })
})

describe('Service price summary honesty', () => {
  it('omits a summary when a starting price has no published upper bound', () => {
    const service = projectPublicServicesPage(mappingPageWithPrices([
      { kind: 'from', amount: { currency: 'USDC', units: '1', exponent: 2 }, taxTreatment: 'inclusive' },
      { kind: 'fixed', amount: { currency: 'USDC', units: '7', exponent: 2 }, taxTreatment: 'inclusive' },
    ])).services[0]!
    expect(service).not.toHaveProperty('priceSummary')
  })

  it('omits a summary for prices with incomparable units or tax treatment', () => {
    const service = projectPublicServicesPage(mappingPageWithPrices([
      { kind: 'fixed', amount: { currency: 'USDC', units: '1', exponent: 2 }, unit: 'hour', taxTreatment: 'inclusive' },
      { kind: 'range', minimum: { currency: 'USDC', units: '4', exponent: 2 }, maximum: { currency: 'USDC', units: '7', exponent: 2 }, unit: 'job', taxTreatment: 'exclusive' },
    ])).services[0]!
    expect(service).not.toHaveProperty('priceSummary')
  })
})

describe('sub-cent catalog price representation (CAVEAT 3)', () => {
  it('maps a sub-cent catalog price while preserving the exact Service priceSummary', () => {
    const map: ServiceOperationMap = {
      'offering:api-exa-ai:search': [{
        ...linkedOperationEntry('offering:api-exa-ai:search'),
        catalogPrice: { scheme: 'exact', amount: '0.007', currency: 'USDC' },
      }],
    }
    const service = projectPublicServicesPage(mappingPage(), map).services[0]!

    // Catalog pricing mirrors agentic.market's pricing shape; subCent is AE
    // execution metadata, not a leaked core field.
    const endpoint = service.endpoints[0]!
    expect(endpoint.pricing).toEqual({ scheme: 'exact', amount: '0.007', currency: 'USDC' })
    expect(endpoint.pricing).not.toHaveProperty('network')
    expect(endpoint.pricing).not.toHaveProperty('subCent')
    expect(endpoint.ae.settlementSupport).toBe('catalog_only')
    expect(endpoint.ae.operationRef).toBeDefined()
    expect(service.enriched).toBe(true)

    // An admitted endpoint price is the source of the Service aggregate; the
    // human offering price is used only when no endpoint price exists.
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
    const operationMap: ServiceOperationMap = {
      'offering:api-exa-ai:search': [{
        ...linkedOperationEntry('offering:api-exa-ai:search'),
        catalogPrice: { scheme: 'exact', amount: '0.001', currency: 'USDC' },
      }],
      'offering:api-exa-ai:contents': [{
        ...linkedOperationEntry('offering:api-exa-ai:contents'),
        catalogPrice: { scheme: 'exact', amount: '0.007', currency: 'USDC' },
      }],
    }
    const service = projectPublicServicesPage(mappingPage(), operationMap).services[0]!

    expect(service.priceSummary).toEqual({
      currency: 'USDC',
      minAmount: '0.001',
      maxAmount: '0.007',
      avgCostPerTransaction: '0.004',
      avgCostBasis: 'exact',
    })
  })

  it('exposes public auth and execution only from linked operation metadata', () => {
    const source = mappingPage()
    if (source.kind !== 'ok') throw new Error('Expected a mapping page.')
    const oneOfferingPage: PublicBusinessCatalogApiV2Page = {
      ...source,
      page: source.page.map((business) => ({ ...business, offerings: [business.offerings[0]!] })),
    }
    const operationMap: ServiceOperationMap = {
      'offering:api-exa-ai:search': [{
        ...linkedOperationEntry('offering:api-exa-ai:search'),
        authorityMode: 'provider_owned',
        authentication: { kind: 'platform_credential', scheme: 'api_key', in: 'header', name: 'X-API-Key' },
        answerExecutable: true,
      }],
    }
    const service = projectPublicServicesPage(oneOfferingPage, operationMap).services[0]!
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
    const keylessAnswerService = projectPublicServicesPage(oneOfferingPage, {
      'offering:api-exa-ai:search': [{
        ...linkedOperationEntry('offering:api-exa-ai:search'),
        authorityMode: 'provider_owned',
        answerExecutable: true,
      }],
    }).services[0]!
    expect(keylessAnswerService.endpoints[0]!.ae.execution).toBe('answer_tool')
    expect(JSON.stringify(endpoint)).not.toMatch(/credentialRef|secret|env/i)

    const unlinked = projectPublicServicesPage(oneOfferingPage).services[0]!
    expect(unlinked.integrationType).toBe('3P')
    expect(unlinked.provider).toBeUndefined()
    expect(unlinked.endpoints[0]).not.toHaveProperty('providerName')
  })

  it('omits malformed endpoint URLs instead of fabricating callable paths', () => {
    const source = mappingPage()
    if (source.kind !== 'ok') throw new Error('Expected a mapping page.')
    const malformedPage: PublicBusinessCatalogApiV2Page = {
      ...source,
      page: source.page.map((business) => ({
        ...business,
        offerings: business.offerings.map((offering, index) => index === 0
          ? { ...offering, accessPaths: [{ ...offering.accessPaths[0]!, url: 'not-a-url' }] }
          : offering),
      })),
    }
    const service = projectPublicServicesPage(malformedPage).services[0]!

    expect(service.endpoints).toHaveLength(1)
    expect(service.endpoints[0]!.url).toBe('https://api.exa.ai/contents')
    expect(service.endpoints.some((endpoint) => endpoint.url === 'not-a-url')).toBe(false)
  })

  it('emits executable settlement without a sub-cent marker when the decimal equals the integer-minor amount', () => {
    const operationMap: ServiceOperationMap = {
      'offering:api-exa-ai:search': [linkedOperationEntry('offering:api-exa-ai:search', {
        network: 'eip155:84532',
        asset: '0x0000000000000000000000000000000000000001',
        currency: 'USDC',
        routeAmountExponent: 2,
        assetAmountExponent: 6,
      })],
    }
    const service = projectPublicServicesPage(mappingPage(), operationMap).services[0]!
    const endpoint = service.endpoints[0]!
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

function mappingPage(provenance: 'business_declared' | 'publicly_observed' = 'business_declared'): PublicBusinessCatalogApiV2Page {
  return {
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v2',
    page: [
      {
        schemaVersion: 'public-business-catalog-api:v2',
        businessId: 'business:api-exa-ai',
        slug: 'api-exa-ai',
        name: 'EXA AI',
        category: 'search',
        suburb: 'Melbourne',
        stateTerritory: 'VIC',
        publicUrl: 'https://api.example',
        trustTier: 'listed',
        photos: [],
        observedAt: 1_700_000_000_000,
        disposition: 'current',
        offerings: [
          {
            offeringRef: 'offering:api-exa-ai:search',
            revision: 1,
            name: 'Web search',
            category: 'search',
            summary: 'Search the open web.',
            price: { kind: 'fixed', amount: { currency: 'USDC', units: '1', exponent: 2 }, taxTreatment: 'inclusive' },
            accessPaths: [
              {
                accessPathRef: 'path-search',
                offeringRevision: 1,
                kind: 'external_operation',
                name: 'Web search',
                summary: 'Search the open web.',
                url: 'https://api.exa.ai/search',
                method: 'GET',
                provenance,
              },
            ],
            support: { integrated: true, aeSupportedAction: true, observedAt: 1_700_000_000_001 },
          },
          {
            offeringRef: 'offering:api-exa-ai:contents',
            revision: 1,
            name: 'Page contents',
            category: 'search',
            summary: 'Read the text of a page.',
            price: { kind: 'range', minimum: { currency: 'USDC', units: '4', exponent: 2 }, maximum: { currency: 'USDC', units: '7', exponent: 2 }, taxTreatment: 'inclusive' },
            accessPaths: [
              {
                accessPathRef: 'path-contents',
                offeringRevision: 1,
                kind: 'external_operation',
                name: 'Page contents',
                summary: 'Read the text of a page.',
                url: 'https://api.exa.ai/contents',
                method: 'POST',
                provenance,
              },
            ],
            support: { integrated: true, aeSupportedAction: true },
          },
        ],
        accessSummary: { humanRequest: false, externalOperation: true, aeSupportedAction: true },
      },
    ],
    isDone: true,
    continueCursor: '',
  }
}

function mappingPageWithPrices(prices: readonly [OfferingPrice, OfferingPrice]): PublicBusinessCatalogApiV2Page {
  const source = mappingPage()
  if (source.kind !== 'ok') return source
  return {
    ...source,
    page: source.page.map((business) => ({
      ...business,
      offerings: business.offerings.map((offering, index) => {
        const price = prices[index]
        return price === undefined ? offering : { ...offering, price }
      }),
    })),
  }
}
function mappingPageWithAdditionalPath(): PublicBusinessCatalogApiV2Page {
  const source = mappingPage()
  if (source.kind !== 'ok') return source
  return {
    ...source,
    page: source.page.map((business) => ({
      ...business,
      offerings: business.offerings.map((offering, index) => index !== 0
        ? offering
        : {
            ...offering,
            accessPaths: [
              ...offering.accessPaths,
              {
                accessPathRef: 'path-search-mirror',
                offeringRevision: 1,
                kind: 'external_operation' as const,
                name: 'Search mirror',
                summary: 'A second published path.',
                url: 'https://mirror.example/search',
                method: 'POST' as const,
                provenance: 'publicly_observed' as const,
              },
            ],
          }),
    })),
  }
}


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
            availabilitySummary: 'Weekdays by appointment',
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
              {
                accessPathRef: 'path-external',
                offeringRevision: 3,
                kind: 'external_operation',
                name: 'Provider operation',
                summary: 'Provider-owned operation.',
                url: 'https://provider.example/operations/emergency-checkup',
                method: 'POST',
                provenance: 'publicly_observed',
              },
              {
                accessPathRef: 'path-human',
                offeringRevision: 3,
                kind: 'human_request',
                channel: 'website',
                disclosure: 'Use the website.',
              },
            ],
            support: { integrated: false, aeSupportedAction: false, observedAt: 1_700_000_000_001 },
          },
          {
            offeringRef: 'offering-empty',
            revision: 1,
            name: 'Inspection',
            category: 'plumbing',
            summary: 'An inspection by request.',
            accessPaths: [],
            support: { integrated: false, aeSupportedAction: false },
          },
        ],
        accessSummary: { humanRequest: true, externalOperation: true, aeSupportedAction: false },
      },
    ],
    isDone: false,
    continueCursor: 'cursor-out',
  }
}

function linkedOperationMap(offeringRef: string): ServiceOperationMap {
  return { [offeringRef]: [linkedOperationEntry(offeringRef)] }
}

function linkedOperationEntry(
  offeringRef: string,
  payment?: NonNullable<CatalogOfferingOperationMapEntry['payment']>,
): CatalogOfferingOperationMapEntry {
  const contents = offeringRef.endsWith(':contents')
  return {
    offeringRef,
    offeringRevision: 1,
    offeringSourceHash: contents ? 'source:contents-offering' : 'source:search-offering',
    declaredAccessPathRef: contents ? 'path-contents' : 'path-search',
    accessPathSourceHash: contents ? 'source:contents-path' : 'source:search-path',
    endpointUrl: contents ? 'https://api.exa.ai/contents' : 'https://api.exa.ai/search',
    method: contents ? 'POST' : 'GET',
    authorityMode: 'ae_curated_external',
    sourceKind: 'openapi_http',
    authentication: payment === undefined ? { kind: 'keyless' } : { kind: 'x402' },
    routeable: true,
    answerExecutable: false,
    readiness: { observedAt: 1_700_000_000_001 },
    operationRef: 'operation:v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as CatalogOfferingOperationMapEntry['operationRef'],
    parameters: [{ group: 'body', name: 'query', type: 'string', description: 'Search query', required: true }],
    catalogPrice: { scheme: 'exact', amount: '0.01', currency: 'USDC' },
    ...(payment === undefined ? {} : { payment }),
  }
}
