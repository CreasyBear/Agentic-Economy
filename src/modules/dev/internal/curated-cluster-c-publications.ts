import type {
  CapabilityContractMetadata,
  CapabilityPublicationImport,
} from '@/modules/capability-supply/public'

/**
 * Cluster C — observed Agentic-Market x402 listings. All were genuinely
 * observed on 2026-08-05 via the Agentic Market public services search endpoint
 * (200). AE does NOT execute or pay any of these endpoints; each is registered
 * in the curated catalog for discovery only, marked `not_available_yet` and
 * 'Not verified by AE'. The source is classified as x402 and each binding uses
 * provider-connection authority, so no observed paid listing can enter the
 * keyless execution surface.
 *
 * Request schemas use ONLY the observed listing params. Where a listing exposed
 * empty params (wolframalpha), the schema is kept minimal with provenance
 * marked 'observed listing'.
 */
const AE_PUBLIC_NETWORK = 'ae:public'
const X402_NETWORK = 'eip155:8453'
const X402_ASSET = '0x0000000000000000000000000000000000000001'
const X402_PAY_TO = '0x0000000000000000000000000000000000000002'
const X402_ASSET_EXPONENT = 6
const OBSERVED_DATE = '2026-08-05'

function x402Authority(provider: string) {
  return {
    kind: 'provider_connection' as const,
    connectionRef: `connection:agentic-market-${provider}-x402`,
    providerRef: `provider:agentic-market-${provider}-x402`,
  }
}

const fallibleResultOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    result: {
      type: ['string', 'number', 'boolean', 'null', 'object', 'array'],
      description: 'Primary result payload returned by the observed endpoint.',
    },
  },
  required: ['result'],
  additionalProperties: false,
} as const

const EXA_X402_SOURCE_EVIDENCE = [
  `https://api.agentic.market/v1/services/search?q=exa`,
  'https://api.exa.ai/search',
] as const

const exaSearchX402Contract: CapabilityContractMetadata = {
  capabilityId: 'exa-search-x402',
  version: 1,
  name: 'Exa search (x402, observed)',
  description: 'Agentic Market-listed x402 web search endpoint at api.exa.ai/search. Observed listing only; AE does not execute or pay it.',
  customerAnnotations: [
    { annotationId: 'query', document: 'input', pointer: '/query', label: 'Search query', role: 'request' },
    { annotationId: 'result', document: 'output', pointer: '/result', label: 'Search result', role: 'completion_evidence' },
  ],
  dataUse: [
    {
      effectId: 'query_release',
      inputPointer: '/query',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['search_public_web'],
    },
  ],
  effects: [
    {
      effectId: 'query_release',
      class: 'data_release',
      authority: 'mandate_or_explicit',
      reversibility: 'not_applicable',
    },
    {
      effectId: 'payment_release',
      class: 'financial_exposure',
      authority: 'mandate_or_explicit',
      reversibility: 'irreversible',
    },
  ],
  evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
}

export const exaSearchX402PublicationImport: CapabilityPublicationImport = {
  kind: 'x402',
  resource: {
    resourceUrl: 'https://api.exa.ai/search',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 1_000, description: 'The web search query observed in the listing.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    outputSchema: fallibleResultOutputSchema,
    method: 'POST',
    price: { currency: 'USD', units: '7', exponent: 3 },
    scheme: 'exact',
    network: X402_NETWORK,
    asset: X402_ASSET,
    payTo: X402_PAY_TO,
    routeAmountExponent: 3,
    assetAmountExponent: X402_ASSET_EXPONENT,
  },
  contract: exaSearchX402Contract,
  commercial: {
    offering: {
      offeringId: 'offering:agentic-market-exa-x402:search:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'Exa search (x402, observed)',
        summary: 'Observed Agentic Market x402 web search listing. AE does not execute or pay this endpoint.',
        price: { kind: 'fixed', amount: { currency: 'USD', units: '7', exponent: 3 } },
        materialTerms: [
          { termId: 'ae-execution-boundary', label: 'Execution boundary', value: 'AE does not execute or pay this endpoint; registered for discovery only.' },
          { termId: 'provider-price-observed', label: 'Observed price', value: 'Listed public price ~USD 0.007 per request (x402); not paid by AE.' },
          { termId: 'provenance', label: 'Provenance', value: `Observed via Agentic Market public services search on ${OBSERVED_DATE}; re-confirms the existing AE-curated Exa entry.` },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'Observed external x402 listing with no commercial relationship to AE or the listing host.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...EXA_X402_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['exa', 'web search', 'x402', 'search the web', 'search results'],
      registrationEvidenceRefs: [...EXA_X402_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:agentic-market-exa-x402:search:v1',
    authority: x402Authority('exa'),
    registrationEvidenceRefs: [...EXA_X402_SOURCE_EVIDENCE],
    requestTimeoutMs: 15_000,
  },
  evidenceRefs: [...EXA_X402_SOURCE_EVIDENCE],
}

const TIMEZONE_X402_SOURCE_EVIDENCE = [
  `https://api.agentic.market/v1/services/search?q=timezone`,
  'https://402timezones.vercel.app/api/convert-timezone',
] as const

const timezoneX402Contract: CapabilityContractMetadata = {
  capabilityId: 'timezone-convert-x402',
  version: 1,
  name: 'Timezone convert (x402, observed)',
  description: 'Agentic Market-listed x402 endpoint converting an ISO time across IANA timezones. Observed listing only; AE does not execute or pay it.',
  customerAnnotations: [
    { annotationId: 'from', document: 'input', pointer: '/from', label: 'Source IANA timezone', role: 'request' },
    { annotationId: 'time', document: 'input', pointer: '/time', label: 'ISO time', role: 'request' },
    { annotationId: 'to', document: 'input', pointer: '/to', label: 'Destination IANA timezone', role: 'request' },
    { annotationId: 'result', document: 'output', pointer: '/result', label: 'Converted time', role: 'completion_evidence' },
  ],
  dataUse: [
    { effectId: 'query_release', inputPointer: '/from', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['convert_timezone'] },
    { effectId: 'query_release', inputPointer: '/time', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['convert_timezone'] },
    { effectId: 'query_release', inputPointer: '/to', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['convert_timezone'] },
  ],
  effects: [
    {
      effectId: 'query_release',
      class: 'data_release',
      authority: 'mandate_or_explicit',
      reversibility: 'not_applicable',
    },
    {
      effectId: 'payment_release',
      class: 'financial_exposure',
      authority: 'mandate_or_explicit',
      reversibility: 'irreversible',
    },
  ],
  evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
}

export const timezoneX402PublicationImport: CapabilityPublicationImport = {
  kind: 'x402',
  resource: {
    resourceUrl: 'https://402timezones.vercel.app/api/convert-timezone',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source IANA timezone, e.g. America/New_York.' },
        time: { type: 'string', description: 'ISO 8601 timestamp to convert.' },
        to: { type: 'string', description: 'Destination IANA timezone, e.g. Europe/London.' },
      },
      required: ['from', 'time', 'to'],
      additionalProperties: false,
    },
    outputSchema: fallibleResultOutputSchema,
    method: 'GET',
    query: [
      { parameter: 'from', inputPointer: '/from' },
      { parameter: 'time', inputPointer: '/time' },
      { parameter: 'to', inputPointer: '/to' },
    ],
    price: { currency: 'USD', units: '1', exponent: 3 },
    scheme: 'exact',
    network: X402_NETWORK,
    asset: X402_ASSET,
    payTo: X402_PAY_TO,
    routeAmountExponent: 3,
    assetAmountExponent: X402_ASSET_EXPONENT,
  },
  contract: timezoneX402Contract,
  commercial: {
    offering: {
      offeringId: 'offering:agentic-market-timezone-x402:convert:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'Timezone convert (x402, observed)',
        summary: 'Observed Agentic Market x402 timezone conversion listing. AE does not execute or pay this endpoint.',
        price: { kind: 'fixed', amount: { currency: 'USD', units: '1', exponent: 3 } },
        materialTerms: [
          { termId: 'ae-execution-boundary', label: 'Execution boundary', value: 'AE does not execute or pay this endpoint; registered for discovery only.' },
          { termId: 'provider-price-observed', label: 'Observed price', value: 'Listed public price ~USD 0.001 per request (x402); not paid by AE.' },
          { termId: 'provenance', label: 'Provenance', value: `Observed via Agentic Market public services search on ${OBSERVED_DATE}.` },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'Observed external x402 listing with no commercial relationship to AE or the listing host.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...TIMEZONE_X402_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['timezone', 'time zone', 'convert time', 'iana', 'time conversion', 'world clock'],
      registrationEvidenceRefs: [...TIMEZONE_X402_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:agentic-market-timezone-x402:convert:v1',
    authority: x402Authority('timezone'),
    registrationEvidenceRefs: [...TIMEZONE_X402_SOURCE_EVIDENCE],
    requestTimeoutMs: 15_000,
  },
  evidenceRefs: [...TIMEZONE_X402_SOURCE_EVIDENCE],
}

const WOLFRAMALPHA_X402_SOURCE_EVIDENCE = [
  `https://api.agentic.market/v1/services/search?q=wolframalpha`,
  'https://wolframalpha.x402.paysponge.com/v2/query',
] as const

const wolframalphaX402Contract: CapabilityContractMetadata = {
  capabilityId: 'wolframalpha-query-x402',
  version: 1,
  name: 'Wolfram|Alpha query (x402, observed)',
  description: 'Agentic Market-listed x402 Wolfram|Alpha query endpoint. The observed listing exposed empty params; only a minimal schema is modeled with provenance \'observed listing\'. AE does not execute or pay it.',
  customerAnnotations: [
    { annotationId: 'input', document: 'input', pointer: '/input', label: 'Query input', role: 'request' },
    { annotationId: 'result', document: 'output', pointer: '/result', label: 'Query result', role: 'completion_evidence' },
  ],
  dataUse: [
    { effectId: 'query_release', inputPointer: '/input', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['run_computational_query'] },
  ],
  effects: [
    {
      effectId: 'query_release',
      class: 'data_release',
      authority: 'mandate_or_explicit',
      reversibility: 'not_applicable',
    },
    {
      effectId: 'payment_release',
      class: 'financial_exposure',
      authority: 'mandate_or_explicit',
      reversibility: 'irreversible',
    },
  ],
  evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
}

export const wolframalphaX402PublicationImport: CapabilityPublicationImport = {
  kind: 'x402',
  resource: {
    resourceUrl: 'https://wolframalpha.x402.paysponge.com/v2/query',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Free-text query for the Wolfram|Alpha engine (minimal observed-listing schema).' },
      },
      required: ['input'],
      additionalProperties: false,
    },
    outputSchema: fallibleResultOutputSchema,
    method: 'GET',
    query: [{ parameter: 'input', inputPointer: '/input' }],
    price: { currency: 'USD', units: '2', exponent: 2 },
    scheme: 'exact',
    network: X402_NETWORK,
    asset: X402_ASSET,
    payTo: X402_PAY_TO,
    routeAmountExponent: 2,
    assetAmountExponent: X402_ASSET_EXPONENT,
  },
  contract: wolframalphaX402Contract,
  commercial: {
    offering: {
      offeringId: 'offering:agentic-market-wolframalpha-x402:query:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'Wolfram|Alpha query (x402, observed)',
        summary: 'Observed Agentic Market x402 Wolfram|Alpha query listing. AE does not execute or pay this endpoint.',
        price: { kind: 'fixed', amount: { currency: 'USD', units: '2', exponent: 2 } },
        materialTerms: [
          { termId: 'ae-execution-boundary', label: 'Execution boundary', value: 'AE does not execute or pay this endpoint; registered for discovery only.' },
          { termId: 'provider-price-observed', label: 'Observed price', value: 'Listed public price ~USD 0.02 per request (x402); not paid by AE.' },
          { termId: 'schema-provenance', label: 'Schema provenance', value: 'observed listing — the Agentic Market listing exposed empty params; schema kept minimal and is not a verified request contract.' },
          { termId: 'provenance', label: 'Provenance', value: `Observed via Agentic Market public services search on ${OBSERVED_DATE}.` },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'Observed external x402 listing with no commercial relationship to AE or the listing host.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...WOLFRAMALPHA_X402_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['wolfram alpha', 'wolframalpha', 'computation', 'computational knowledge', 'query'],
      registrationEvidenceRefs: [...WOLFRAMALPHA_X402_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:agentic-market-wolframalpha-x402:query:v1',
    authority: x402Authority('wolframalpha'),
    registrationEvidenceRefs: [...WOLFRAMALPHA_X402_SOURCE_EVIDENCE],
    requestTimeoutMs: 15_000,
  },
  evidenceRefs: [...WOLFRAMALPHA_X402_SOURCE_EVIDENCE],
}

const COINMARKETCAP_X402_SOURCE_EVIDENCE = [
  `https://api.agentic.market/v1/services/search?q=coinmarketcap`,
  'https://pro-api.coinmarketcap.com/x402/v3/cryptocurrency/quotes/latest',
] as const

const coinmarketcapX402Contract: CapabilityContractMetadata = {
  capabilityId: 'coinmarketcap-quotes-x402',
  version: 1,
  name: 'CoinMarketCap quotes (x402, observed)',
  description: 'Agentic Market-listed x402 CoinMarketCap cryptocurrency quotes endpoint. Observed listing only; AE does not execute or pay it.',
  customerAnnotations: [
    { annotationId: 'convert', document: 'input', pointer: '/convert', label: 'Convert currency', role: 'request' },
    { annotationId: 'id', document: 'input', pointer: '/id', label: 'CoinMarketCap ids', role: 'request' },
    { annotationId: 'result', document: 'output', pointer: '/result', label: 'Quotes', role: 'completion_evidence' },
  ],
  dataUse: [
    { effectId: 'query_release', inputPointer: '/convert', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_crypto_quotes'] },
    { effectId: 'query_release', inputPointer: '/id', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_crypto_quotes'] },
  ],
  effects: [
    {
      effectId: 'query_release',
      class: 'data_release',
      authority: 'mandate_or_explicit',
      reversibility: 'not_applicable',
    },
    {
      effectId: 'payment_release',
      class: 'financial_exposure',
      authority: 'mandate_or_explicit',
      reversibility: 'irreversible',
    },
  ],
  evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
}

export const coinmarketcapX402PublicationImport: CapabilityPublicationImport = {
  kind: 'x402',
  resource: {
    resourceUrl: 'https://pro-api.coinmarketcap.com/x402/v3/cryptocurrency/quotes/latest',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        convert: { type: 'string', description: 'Target currency symbol (ccy), e.g. USD.' },
        id: { type: 'string', description: 'Comma-separated list of CoinMarketCap ids to quote.' },
      },
      required: ['convert', 'id'],
      additionalProperties: false,
    },
    outputSchema: fallibleResultOutputSchema,
    method: 'GET',
    query: [
      { parameter: 'convert', inputPointer: '/convert' },
      { parameter: 'id', inputPointer: '/id' },
    ],
    price: { currency: 'USD', units: '1', exponent: 2 },
    scheme: 'exact',
    network: X402_NETWORK,
    asset: X402_ASSET,
    payTo: X402_PAY_TO,
    routeAmountExponent: 2,
    assetAmountExponent: X402_ASSET_EXPONENT,
  },
  contract: coinmarketcapX402Contract,
  commercial: {
    offering: {
      offeringId: 'offering:agentic-market-coinmarketcap-x402:quotes:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'CoinMarketCap quotes (x402, observed)',
        summary: 'Observed Agentic Market x402 cryptocurrency quotes listing. AE does not execute or pay this endpoint.',
        price: { kind: 'fixed', amount: { currency: 'USD', units: '1', exponent: 2 } },
        materialTerms: [
          { termId: 'ae-execution-boundary', label: 'Execution boundary', value: 'AE does not execute or pay this endpoint; registered for discovery only.' },
          { termId: 'provider-price-observed', label: 'Observed price', value: 'Listed public price ~USD 0.01 per request (x402); not paid by AE.' },
          { termId: 'provenance', label: 'Provenance', value: `Observed via Agentic Market public services search on ${OBSERVED_DATE}.` },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'Observed external x402 listing with no commercial relationship to AE or the listing host.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...COINMARKETCAP_X402_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['coinmarketcap', 'cryptocurrency', 'crypto quotes', 'market quotes', 'crypto prices'],
      registrationEvidenceRefs: [...COINMARKETCAP_X402_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:agentic-market-coinmarketcap-x402:quotes:v1',
    authority: x402Authority('coinmarketcap'),
    registrationEvidenceRefs: [...COINMARKETCAP_X402_SOURCE_EVIDENCE],
    requestTimeoutMs: 15_000,
  },
  evidenceRefs: [...COINMARKETCAP_X402_SOURCE_EVIDENCE],
}

const FLIGHTAWARE_X402_SOURCE_EVIDENCE = [
  `https://api.agentic.market/v1/services/search?q=flightaware`,
  'https://stabletravel.dev/api/flightaware/airports/nearby',
] as const

const flightawareX402Contract: CapabilityContractMetadata = {
  capabilityId: 'flightaware-nearby-x402',
  version: 1,
  name: 'FlightAware nearby airports (x402, observed)',
  description: 'Agentic Market-listed x402 endpoint listing airports near a latitude/longitude within a radius. Observed listing only; AE does not execute or pay it.',
  customerAnnotations: [
    { annotationId: 'latitude', document: 'input', pointer: '/latitude', label: 'Latitude', role: 'request' },
    { annotationId: 'longitude', document: 'input', pointer: '/longitude', label: 'Longitude', role: 'request' },
    { annotationId: 'radius', document: 'input', pointer: '/radius', label: 'Radius', role: 'constraint' },
    { annotationId: 'result', document: 'output', pointer: '/result', label: 'Nearby airports', role: 'completion_evidence' },
  ],
  dataUse: [
    { effectId: 'query_release', inputPointer: '/latitude', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['find_nearby_airports'] },
    { effectId: 'query_release', inputPointer: '/longitude', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['find_nearby_airports'] },
    { effectId: 'query_release', inputPointer: '/radius', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['bound_nearby_search_radius'] },
  ],
  effects: [
    {
      effectId: 'query_release',
      class: 'data_release',
      authority: 'mandate_or_explicit',
      reversibility: 'not_applicable',
    },
    {
      effectId: 'payment_release',
      class: 'financial_exposure',
      authority: 'mandate_or_explicit',
      reversibility: 'irreversible',
    },
  ],
  evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
}

export const flightawareX402PublicationImport: CapabilityPublicationImport = {
  kind: 'x402',
  resource: {
    resourceUrl: 'https://stabletravel.dev/api/flightaware/airports/nearby',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        latitude: { type: 'number', description: 'Latitude of the center point.' },
        longitude: { type: 'number', description: 'Longitude of the center point.' },
        radius: { type: 'number', description: 'Search radius in miles.' },
      },
      required: ['latitude', 'longitude', 'radius'],
      additionalProperties: false,
    },
    outputSchema: fallibleResultOutputSchema,
    method: 'GET',
    query: [
      { parameter: 'latitude', inputPointer: '/latitude' },
      { parameter: 'longitude', inputPointer: '/longitude' },
      { parameter: 'radius', inputPointer: '/radius' },
    ],
    price: { currency: 'USD', units: '8', exponent: 3 },
    scheme: 'exact',
    network: X402_NETWORK,
    asset: X402_ASSET,
    payTo: X402_PAY_TO,
    routeAmountExponent: 3,
    assetAmountExponent: X402_ASSET_EXPONENT,
  },
  contract: flightawareX402Contract,
  commercial: {
    offering: {
      offeringId: 'offering:agentic-market-flightaware-x402:nearby:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'FlightAware nearby airports (x402, observed)',
        summary: 'Observed Agentic Market x402 FlightAware nearby-airports listing. AE does not execute or pay this endpoint.',
        price: { kind: 'fixed', amount: { currency: 'USD', units: '8', exponent: 3 } },
        materialTerms: [
          { termId: 'ae-execution-boundary', label: 'Execution boundary', value: 'AE does not execute or pay this endpoint; registered for discovery only.' },
          { termId: 'provider-price-observed', label: 'Observed price', value: 'Listed public price ~USD 0.008 per request (x402); not paid by AE.' },
          { termId: 'provenance', label: 'Provenance', value: `Observed via Agentic Market public services search on ${OBSERVED_DATE}.` },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'Observed external x402 listing with no commercial relationship to AE or the listing host.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...FLIGHTAWARE_X402_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['flightaware', 'airports', 'nearby airports', 'airport nearby', 'flights'],
      registrationEvidenceRefs: [...FLIGHTAWARE_X402_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:agentic-market-flightaware-x402:nearby:v1',
    authority: x402Authority('flightaware'),
    registrationEvidenceRefs: [...FLIGHTAWARE_X402_SOURCE_EVIDENCE],
    requestTimeoutMs: 15_000,
  },
  evidenceRefs: [...FLIGHTAWARE_X402_SOURCE_EVIDENCE],
}

const BIZINTEL_X402_SOURCE_EVIDENCE = [
  `https://api.agentic.market/v1/services/search?q=frankfurter`,
  'https://bizintel-api.hahavoid0.workers.dev/finance/forex-rate',
] as const

const bizintelX402Contract: CapabilityContractMetadata = {
  capabilityId: 'bizintel-forex-rate-x402',
  version: 1,
  name: 'Bizintel forex rate (x402, observed)',
  description: 'Agentic Market-listed x402 forex-rate endpoint. Direct adversarial same-currency-domain overlap with the AE keyless Frankfurter capability. Observed listing only; AE does not execute or pay it.',
  customerAnnotations: [
    { annotationId: 'from', document: 'input', pointer: '/from', label: 'From currency', role: 'request' },
    { annotationId: 'to', document: 'input', pointer: '/to', label: 'To currency', role: 'request' },
    { annotationId: 'result', document: 'output', pointer: '/result', label: 'Forex rate', role: 'completion_evidence' },
  ],
  dataUse: [
    { effectId: 'query_release', inputPointer: '/from', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_forex_rate'] },
    { effectId: 'query_release', inputPointer: '/to', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_forex_rate'] },
  ],
  effects: [
    {
      effectId: 'query_release',
      class: 'data_release',
      authority: 'mandate_or_explicit',
      reversibility: 'not_applicable',
    },
    {
      effectId: 'payment_release',
      class: 'financial_exposure',
      authority: 'mandate_or_explicit',
      reversibility: 'irreversible',
    },
  ],
  evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
}

export const bizintelX402PublicationImport: CapabilityPublicationImport = {
  kind: 'x402',
  resource: {
    resourceUrl: 'https://bizintel-api.hahavoid0.workers.dev/finance/forex-rate',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source currency code.' },
        to: { type: 'string', description: 'Destination currency code.' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
    outputSchema: fallibleResultOutputSchema,
    method: 'POST',
    price: { currency: 'USD', units: '1', exponent: 2 },
    scheme: 'exact',
    network: X402_NETWORK,
    asset: X402_ASSET,
    payTo: X402_PAY_TO,
    routeAmountExponent: 2,
    assetAmountExponent: X402_ASSET_EXPONENT,
  },
  contract: bizintelX402Contract,
  commercial: {
    offering: {
      offeringId: 'offering:agentic-market-bizintel-x402:forex-rate:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'Bizintel forex rate (x402, observed)',
        summary: 'Observed Agentic Market x402 forex-rate listing, adversarial same-currency-domain overlap with Frankfurter. AE does not execute or pay this endpoint.',
        price: { kind: 'fixed', amount: { currency: 'USD', units: '1', exponent: 2 } },
        materialTerms: [
          { termId: 'ae-execution-boundary', label: 'Execution boundary', value: 'AE does not execute or pay this endpoint; registered for discovery only.' },
          { termId: 'provider-price-observed', label: 'Observed price', value: 'Listed public price ~USD 0.01 per request (x402); not paid by AE.' },
          { termId: 'domain-overlap', label: 'Domain overlap', value: 'Direct adversarial same-currency-domain overlap with the AE keyless Frankfurter capability for routing/selection pressure-testing.' },
          { termId: 'provenance', label: 'Provenance', value: `Observed via Agentic Market public services search on ${OBSERVED_DATE}.` },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'Observed external x402 listing with no commercial relationship to AE or the listing host.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...BIZINTEL_X402_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['frankfurter', 'forex rate', 'exchange rate', 'currency conversion', 'bizintel', 'forex'],
      registrationEvidenceRefs: [...BIZINTEL_X402_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:agentic-market-bizintel-x402:forex-rate:v1',
    authority: x402Authority('bizintel'),
    registrationEvidenceRefs: [...BIZINTEL_X402_SOURCE_EVIDENCE],
    requestTimeoutMs: 15_000,
  },
  evidenceRefs: [...BIZINTEL_X402_SOURCE_EVIDENCE],
}

const TAVILY_X402_SOURCE_EVIDENCE = [
  `https://api.agentic.market/v1/services/search?q=tavily`,
  'https://x402.tavily.com/search',
] as const

const tavilyX402Contract: CapabilityContractMetadata = {
  capabilityId: 'tavily-search-x402',
  version: 1,
  name: 'Tavily search (x402, observed)',
  description: 'Agentic Market-listed x402 Tavily search endpoint, used for x402-vs-keyed routing testing against the AE-curated keyless/existing entries. Observed listing only; AE does not execute or pay it.',
  customerAnnotations: [
    { annotationId: 'query', document: 'input', pointer: '/query', label: 'Search query', role: 'request' },
    { annotationId: 'result', document: 'output', pointer: '/result', label: 'Search result', role: 'completion_evidence' },
  ],
  dataUse: [
    { effectId: 'query_release', inputPointer: '/query', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['search_public_web'] },
  ],
  effects: [
    {
      effectId: 'query_release',
      class: 'data_release',
      authority: 'mandate_or_explicit',
      reversibility: 'not_applicable',
    },
    {
      effectId: 'payment_release',
      class: 'financial_exposure',
      authority: 'mandate_or_explicit',
      reversibility: 'irreversible',
    },
  ],
  evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
}

export const tavilyX402PublicationImport: CapabilityPublicationImport = {
  kind: 'x402',
  resource: {
    resourceUrl: 'https://x402.tavily.com/search',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 1_000, description: 'The web search query observed in the listing.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    outputSchema: fallibleResultOutputSchema,
    method: 'POST',
    price: { currency: 'USD', units: '1', exponent: 2 },
    scheme: 'exact',
    network: X402_NETWORK,
    asset: X402_ASSET,
    payTo: X402_PAY_TO,
    routeAmountExponent: 2,
    assetAmountExponent: X402_ASSET_EXPONENT,
  },
  contract: tavilyX402Contract,
  commercial: {
    offering: {
      offeringId: 'offering:agentic-market-tavily-x402:search:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'Tavily search (x402, observed)',
        summary: 'Observed Agentic Market x402 Tavily search listing, for x402-vs-keyed routing tests. AE does not execute or pay this endpoint.',
        price: { kind: 'fixed', amount: { currency: 'USD', units: '1', exponent: 2 } },
        materialTerms: [
          { termId: 'ae-execution-boundary', label: 'Execution boundary', value: 'AE does not execute or pay this endpoint; registered for discovery only.' },
          { termId: 'provider-price-observed', label: 'Observed price', value: 'Listed public price ~USD 0.01 per request (x402); not paid by AE.' },
          { termId: 'routing-test', label: 'Routing test', value: 'Used to pressure-test x402-vs-keyed routing against the AE-curated catalog.' },
          { termId: 'provenance', label: 'Provenance', value: `Observed via Agentic Market public services search on ${OBSERVED_DATE}.` },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'Observed external x402 listing with no commercial relationship to AE or the listing host.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...TAVILY_X402_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['tavily', 'web search', 'agent search', 'search', 'x402 tavily'],
      registrationEvidenceRefs: [...TAVILY_X402_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:agentic-market-tavily-x402:search:v1',
    authority: x402Authority('tavily'),
    registrationEvidenceRefs: [...TAVILY_X402_SOURCE_EVIDENCE],
    requestTimeoutMs: 15_000,
  },
  evidenceRefs: [...TAVILY_X402_SOURCE_EVIDENCE],
}

export const CLUSTER_C_PUBLICATIONS = [
  { businessSlug: 'agentic-market-exa-x402', publication: exaSearchX402PublicationImport },
  { businessSlug: 'agentic-market-timezone-x402', publication: timezoneX402PublicationImport },
  { businessSlug: 'agentic-market-wolframalpha-x402', publication: wolframalphaX402PublicationImport },
  { businessSlug: 'agentic-market-coinmarketcap-x402', publication: coinmarketcapX402PublicationImport },
  { businessSlug: 'agentic-market-flightaware-x402', publication: flightawareX402PublicationImport },
  { businessSlug: 'agentic-market-bizintel-x402', publication: bizintelX402PublicationImport },
  { businessSlug: 'agentic-market-tavily-x402', publication: tavilyX402PublicationImport },
] as const satisfies readonly {
  businessSlug: string
  publication: CapabilityPublicationImport
}[]
