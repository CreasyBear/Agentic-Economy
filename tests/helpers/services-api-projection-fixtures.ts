import type { OfferingPrice } from '@/modules/catalog/public'
import type { CatalogOfferingToolMapEntry } from '@/modules/capability-supply/public'
import type { PublicBusinessCatalogApiV2Page, ServiceToolMap } from '@/modules/registry/public'

export const USDC_BASE_SEPOLIA_PAYMENT = {
  network: 'eip155:84532',
  asset: '0x0000000000000000000000000000000000000001',
  currency: 'USDC',
  routeAmountExponent: 2,
  assetAmountExponent: 6,
} satisfies NonNullable<CatalogOfferingToolMapEntry['payment']>

const SEARCH_TOOL_REF =
  'operation:v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as CatalogOfferingToolMapEntry['toolRef']

export function mappingPage(
  provenance: 'business_declared' | 'publicly_observed' = 'business_declared',
): PublicBusinessCatalogApiV2Page {
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
        businessContext: {
          kind: 'programmable_provider',
          website: 'https://api.example',
          providerIdentifier: 'EXA AI',
        },
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
            accessPaths: [{
              accessPathRef: 'path-search',
              offeringRevision: 1,
              kind: 'external_operation',
              name: 'Web search',
              summary: 'Search the open web.',
              url: 'https://api.exa.ai/search',
              method: 'GET',
              provenance,
            }],
            support: { integrated: true, aeSupportedAction: true, observedAt: 1_700_000_000_001 },
          },
          {
            offeringRef: 'offering:api-exa-ai:contents',
            revision: 1,
            name: 'Page contents',
            category: 'search',
            summary: 'Read the text of a page.',
            price: {
              kind: 'range',
              minimum: { currency: 'USDC', units: '4', exponent: 2 },
              maximum: { currency: 'USDC', units: '7', exponent: 2 },
              taxTreatment: 'inclusive',
            },
            accessPaths: [{
              accessPathRef: 'path-contents',
              offeringRevision: 1,
              kind: 'external_operation',
              name: 'Page contents',
              summary: 'Read the text of a page.',
              url: 'https://api.exa.ai/contents',
              method: 'POST',
              provenance,
            }],
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

export function mappingPageWithPrices(prices: readonly [OfferingPrice, OfferingPrice]): PublicBusinessCatalogApiV2Page {
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

export function mappingPageWithAdditionalPath(): PublicBusinessCatalogApiV2Page {
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

export function singleOfferingMappingPage(): PublicBusinessCatalogApiV2Page {
  const source = mappingPage()
  if (source.kind !== 'ok') throw new Error('Expected a mapping page.')
  return {
    ...source,
    page: source.page.map((business) => ({ ...business, offerings: [business.offerings[0]!] })),
  }
}

export function malformedSearchUrlMappingPage(): PublicBusinessCatalogApiV2Page {
  const source = mappingPage()
  if (source.kind !== 'ok') throw new Error('Expected a mapping page.')
  return {
    ...source,
    page: source.page.map((business) => ({
      ...business,
      offerings: business.offerings.map((offering, index) => index === 0
        ? { ...offering, accessPaths: [{ ...offering.accessPaths[0]!, url: 'not-a-url' }] }
        : offering),
    })),
  }
}

export function acmeCatalogPage(): PublicBusinessCatalogApiV2Page {
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
                summary: 'Returns a provider quote.',
                name: 'Get a checkup quote',
                url: 'https://another-origin.example/api/provider/acme-plumbing/checkup-quote',
                method: 'POST',
                authenticationSummary: 'Provider endpoint does not expose credentials.',
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

export function acmeProjectedServiceExpectation() {
  return {
    id: 'acme-plumbing',
    name: 'Acme Plumbing',
    category: 'plumbing',
    description: 'A rapid plumbing checkup. An inspection by request.',
    domain: 'acme.example',
    networks: [],
    enriched: false,
    integrationType: '3P',
    serviceName: 'Acme Plumbing',
    tags: ['plumbing'],
    priceSummary: { currency: 'AUD', minAmount: '80.00', maxAmount: '80.00', avgCostBasis: 'exact' },
    ae: {
      businessContext: { kind: 'local_human', suburb: 'Fremantle', stateTerritory: 'WA' },
      source: 'business_published',
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
      links: { business: '/api/businesses/acme-plumbing', manifest: '/acme-plumbing/ucp' },
    },
    endpoints: [
      {
        url: 'https://another-origin.example/api/provider/acme-plumbing/checkup-quote',
        description: 'Returns a provider quote.',
        method: 'POST',
        serviceName: 'Acme Plumbing',
        parameters: [],
        quality: null,
        tags: ['plumbing'],
        ae: {
          offeringRef: 'offering-open',
          provenance: 'business_declared',
          access: 'external',
          authentication: { kind: 'unknown' },
          execution: 'catalog_only',
          authenticationSummary: 'Provider endpoint does not expose credentials.',
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
        tags: ['plumbing'],
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
  }
}

export function linkedToolMap(offeringRef: string): ServiceToolMap {
  return { [offeringRef]: [linkedToolEntry(offeringRef)] }
}

export function linkedToolEntry(
  offeringRef: string,
  payment?: NonNullable<CatalogOfferingToolMapEntry['payment']>,
): CatalogOfferingToolMapEntry {
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
    authentication: payment === undefined ? { kind: 'ae_api_key' } : { kind: 'x402' },
    routeable: true,
    readiness: { observedAt: 1_700_000_000_001 },
    toolRef: SEARCH_TOOL_REF,
    parameters: [{ group: 'body', name: 'query', type: 'string', description: 'Search query', required: true }],
    catalogPrice: { scheme: 'exact', amount: '0.01', currency: 'USDC' },
    ...(payment === undefined ? {} : { payment }),
  }
}

export function offeringToolMap(
  entries: Record<string, CatalogOfferingToolMapEntry | Parameters<typeof linkedToolEntry>[1] | undefined>,
): ServiceToolMap {
  return Object.fromEntries(
    Object.entries(entries).map(([offeringRef, entry]) => [
      offeringRef,
      [typeof entry === 'object' && entry !== null && 'toolRef' in entry
        ? entry
        : linkedToolEntry(offeringRef, entry)],
    ]),
  ) as ServiceToolMap
}

export function dualOfferingToolMap(
  payment?: NonNullable<CatalogOfferingToolMapEntry['payment']>,
): ServiceToolMap {
  return offeringToolMap({
    'offering:api-exa-ai:search': payment,
    'offering:api-exa-ai:contents': payment,
  })
}
