import type {
  CapabilityContractMetadata,
  CapabilityPublicationImport,
} from './public'

export const EXA_BUSINESS_SLUG = 'agentic-market-exa'
export const FRANKFURTER_BUSINESS_SLUG = 'frankfurter-ecb-rates'

const AE_PUBLIC_NETWORK = 'ae:public'
const EXA_CREDENTIAL_REF = 'env:EXA_API_KEY'
const EXA_PRICE = { currency: 'USD', amountMinor: 1 } as const
const FRANKFURTER_CREDENTIAL_REF = 'none'

const EXA_SOURCE_EVIDENCE = [
  'https://api.agentic.market/v1/services/api-exa-ai',
  'https://agentic.market/services/api-exa-ai',
  'https://exa.ai/docs/reference/x402-guide',
  'https://exa.ai/docs/exa-spec.yaml',
] as const

const EXA_SEARCH_EVIDENCE = [
  ...EXA_SOURCE_EVIDENCE,
  'https://api.exa.ai/search',
] as const

const EXA_CONTENTS_EVIDENCE = [
  ...EXA_SOURCE_EVIDENCE,
  'https://api.exa.ai/contents',
] as const

const FRANKFURTER_SOURCE_EVIDENCE = [
  'https://frankfurter.dev/',
  'https://api.frankfurter.dev/',
  'https://api.frankfurter.dev/v2/rates',
  'https://github.com/lineofflight/frankfurter',
  'https://github.com/lineofflight/frankfurter/blob/main/LICENSE',
  'https://www.ecb.europa.eu/services/disclaimer/html/index.en.html#c',
] as const

const exaSearchInputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      maxLength: 1_000,
      description: 'The web search query.',
    },
    numResults: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      default: 10,
      description: 'The maximum number of Exa results to return.',
    },
    type: {
      type: 'string',
      enum: ['auto', 'instant', 'fast', 'deep-lite', 'deep', 'deep-reasoning'],
      default: 'auto',
      description: 'The Exa search mode.',
    },
  },
  required: ['query'],
  additionalProperties: false,
} as const

const exaSearchOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    results: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string', format: 'uri', minLength: 1, maxLength: 2_048 },
          title: { type: 'string' },
          score: { type: 'number' },
          publishedDate: { type: 'string' },
          author: { type: 'string' },
          image: { type: 'string', format: 'uri' },
          favicon: { type: 'string', format: 'uri' },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
    requestId: { type: 'string' },
    costDollars: { type: 'number', minimum: 0 },
  },
  required: ['results'],
  additionalProperties: false,
} as const

const exaContentsInputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    urls: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: { type: 'string', format: 'uri', minLength: 1, maxLength: 2_048 },
      description: 'URLs selected from a preceding Exa search result.',
    },
    text: {
      type: 'boolean',
      default: true,
      description: 'Whether to return extracted page text.',
    },
  },
  required: ['urls'],
  additionalProperties: false,
} as const

const exaContentsOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    results: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string', format: 'uri', minLength: 1, maxLength: 2_048 },
          title: { type: 'string' },
          text: { type: 'string' },
          author: { type: 'string' },
          publishedDate: { type: 'string' },
          image: { type: 'string', format: 'uri' },
          favicon: { type: 'string', format: 'uri' },
          highlights: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
    statuses: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string', format: 'uri', minLength: 1, maxLength: 2_048 },
          status: { type: 'string', enum: ['success', 'error'] },
          source: { type: 'string', enum: ['cached', 'crawled'] },
          error: { type: 'string' },
        },
        required: ['status'],
        additionalProperties: false,
      },
    },
    requestId: { type: 'string' },
    costDollars: { type: 'number', minimum: 0 },
  },
  required: ['results'],
  additionalProperties: false,
} as const

export const frankfurterOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'array',
  minItems: 1,
  maxItems: 1,
  items: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      base: { type: 'string', pattern: '^[A-Z]{3}$', minLength: 3, maxLength: 3 },
      quote: { type: 'string', pattern: '^[A-Z]{3}$', minLength: 3, maxLength: 3 },
      rate: { type: 'number', exclusiveMinimum: 0 },
    },
    required: ['date', 'base', 'quote', 'rate'],
    additionalProperties: false,
  },
} as const

const exaSearchContract: CapabilityContractMetadata = {
  capabilityId: 'exa.search',
  version: 2,
  name: 'Exa web search',
  description: 'Searches the public web through Exa and returns bounded result links for further inspection.',
  customerAnnotations: [
    { annotationId: 'query', document: 'input', pointer: '/query', label: 'Search query', role: 'request' },
    { annotationId: 'num_results', document: 'input', pointer: '/numResults', label: 'Result limit', role: 'constraint' },
    { annotationId: 'search_type', document: 'input', pointer: '/type', label: 'Search mode', role: 'constraint' },
    { annotationId: 'results', semanticIdentity: 'ae.public-web-urls:v1', document: 'output', pointer: '/results', label: 'Search results', role: 'completion_evidence' },
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
    {
      effectId: 'query_release',
      inputPointer: '/numResults',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['bound_search_result_count'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/type',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['select_search_mode'],
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
  evidence: [{ evidenceId: 'results', outputPointer: '/results', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
}

const exaContentsContract: CapabilityContractMetadata = {
  capabilityId: 'exa.contents',
  version: 2,
  name: 'Exa web contents',
  description: 'Retrieves bounded contents for URLs selected from a public Exa search result.',
  customerAnnotations: [
    { annotationId: 'urls', semanticIdentity: 'ae.public-web-urls:v1', document: 'input', pointer: '/urls', label: 'Selected URLs', role: 'request' },
    { annotationId: 'text', document: 'input', pointer: '/text', label: 'Page text', role: 'constraint' },
    { annotationId: 'results', document: 'output', pointer: '/results', label: 'Retrieved contents', role: 'completion_evidence' },
  ],
  dataUse: [
    {
      effectId: 'query_release',
      inputPointer: '/urls',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['retrieve_selected_public_pages'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/text',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['select_content_representation'],
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
  evidence: [{ evidenceId: 'results', outputPointer: '/results', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
}

export const frankfurterContract: CapabilityContractMetadata = {
  capabilityId: 'frankfurter.single-rate',
  version: 1,
  name: 'Frankfurter ECB single-pair rate',
  description: 'Returns one current European Central Bank reference rate through the public Frankfurter v2 API.',
  customerAnnotations: [
    { annotationId: 'base', document: 'input', pointer: '/base', label: 'Base currency', role: 'request' },
    { annotationId: 'quote', document: 'input', pointer: '/quote', label: 'Quote currency', role: 'request' },
    { annotationId: 'rate', document: 'output', pointer: '/0', label: 'ECB reference rate', role: 'completion_evidence' },
  ],
  dataUse: [
    {
      effectId: 'query_release',
      inputPointer: '/base',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['retrieve_ecb_reference_rate'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/quote',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['retrieve_ecb_reference_rate'],
    },
  ],
  effects: [{
    effectId: 'query_release',
    class: 'data_release',
    authority: 'mandate_or_explicit',
    reversibility: 'not_applicable',
  }],
  evidence: [{ evidenceId: 'rate', outputPointer: '/0', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
}

const exaOpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Exa Public API',
    version: '2.0.0',
    description: 'Official Exa search and contents API contract.',
  },
  servers: [{ url: 'https://api.exa.ai' }],
  security: [{ bearer: [] }],
  components: {
    securitySchemes: {
      bearer: { type: 'http', scheme: 'bearer' },
    },
  },
  paths: {
    '/search': {
      post: {
        operationId: 'exa.search',
        description: 'Search the public web and return bounded result links.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: exaSearchInputSchema } },
        },
        responses: {
          '200': {
            description: 'Bounded Exa search results.',
            content: { 'application/json': { schema: exaSearchOutputSchema } },
          },
        },
      },
    },
    '/contents': {
      post: {
        operationId: 'exa.contents',
        description: 'Retrieve bounded contents for selected public URLs.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: exaContentsInputSchema } },
        },
        responses: {
          '200': {
            description: 'Bounded page contents.',
            content: { 'application/json': { schema: exaContentsOutputSchema } },
          },
        },
      },
    },
  },
} as const

export const exaSearchPublicationImport: CapabilityPublicationImport = {
  kind: 'openapi_http',
  document: exaOpenApiDocument,
  operation: { path: '/search', method: 'post' },
  contract: exaSearchContract,
  commercial: {
    offering: {
      offeringId: 'offering:agentic-market-exa:search:v2',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'Exa web search',
        summary: 'AE-curated external access to Exa public web search through the official API.',
        price: { kind: 'fixed', ...EXA_PRICE },
        materialTerms: [
          { termId: 'ae-price-ceiling', label: 'AE price ceiling', value: 'USD 0.01 per invocation.' },
          { termId: 'provider-cost', label: 'Provider cost', value: 'Platform-funded Exa API usage; no customer payment is submitted.' },
          { termId: 'source-attribution', label: 'Source', value: 'Official Exa OpenAPI contract; the Agentic Market listing is provenance only.' },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'AE-curated external publication with no commercial relationship to Exa or the source listing.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...EXA_SEARCH_EVIDENCE],
        },
      },
      searchTerms: ['exa', 'web search', 'search the web', 'research', 'search results'],
      registrationEvidenceRefs: [...EXA_SEARCH_EVIDENCE],
    },
    bindingId: 'binding:agentic-market-exa:search:api-key:v2',
    credentialRef: EXA_CREDENTIAL_REF,
    registrationEvidenceRefs: [...EXA_SEARCH_EVIDENCE],
    requestTimeoutMs: 30_000,
  },
  evidenceRefs: [...EXA_SEARCH_EVIDENCE],
}

export const exaContentsPublicationImport: CapabilityPublicationImport = {
  kind: 'openapi_http',
  document: exaOpenApiDocument,
  operation: { path: '/contents', method: 'post' },
  contract: exaContentsContract,
  commercial: {
    offering: {
      offeringId: 'offering:agentic-market-exa:contents:v2',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'Exa web contents',
        summary: 'AE-curated external access to Exa page contents through the official API.',
        price: { kind: 'fixed', ...EXA_PRICE },
        materialTerms: [
          { termId: 'ae-price-ceiling', label: 'AE price ceiling', value: 'USD 0.01 per invocation.' },
          { termId: 'provider-cost', label: 'Provider cost', value: 'Platform-funded Exa API usage; no customer payment is submitted.' },
          { termId: 'source-attribution', label: 'Source', value: 'Official Exa OpenAPI contract; the Agentic Market listing is provenance only.' },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'AE-curated external publication with no commercial relationship to Exa or the source listing.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...EXA_CONTENTS_EVIDENCE],
        },
      },
      searchTerms: ['exa', 'web contents', 'page contents', 'retrieve web pages', 'research sources'],
      registrationEvidenceRefs: [...EXA_CONTENTS_EVIDENCE],
    },
    bindingId: 'binding:agentic-market-exa:contents:api-key:v2',
    credentialRef: EXA_CREDENTIAL_REF,
    registrationEvidenceRefs: [...EXA_CONTENTS_EVIDENCE],
    requestTimeoutMs: 30_000,
  },
  evidenceRefs: [...EXA_CONTENTS_EVIDENCE],
}

export const frankfurterSingleRatePublicationImport: CapabilityPublicationImport = {
  kind: 'openapi_http',
  document: {
    openapi: '3.1.0',
    info: {
      title: 'Frankfurter v2 public API',
      version: '2',
      description: 'Public exchange-rate API using European Central Bank reference data.',
    },
    servers: [{ url: 'https://api.frankfurter.dev/v2' }],
    paths: {
      '/rates': {
        get: {
          operationId: 'frankfurter.single-rate',
          description: 'Returns one ECB reference rate for the requested base and quote currencies.',
          parameters: [
            {
              name: 'base',
              in: 'query',
              required: true,
              schema: { type: 'string', pattern: '^[A-Z]{3}$', minLength: 3, maxLength: 3 },
            },
            {
              name: 'quotes',
              'x-ae-input-name': 'quote',
              in: 'query',
              required: true,
              schema: { type: 'string', pattern: '^[A-Z]{3}$', minLength: 3, maxLength: 3 },
            },
          ],
          responses: {
            '200': {
              description: 'One current ECB reference-rate row.',
              content: { 'application/json': { schema: frankfurterOutputSchema } },
            },
          },
        },
      },
    },
  },
  operation: { path: '/rates', method: 'get' },
  fixedQuery: [{ parameter: 'providers', value: 'ECB' }],
  contract: frankfurterContract,
  commercial: {
    offering: {
      offeringId: 'offering:frankfurter-ecb-rates:single-rate:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'Frankfurter ECB single-pair rate',
        summary: 'AE-curated external access to one current ECB reference rate through Frankfurter v2.',
        price: { kind: 'fixed', currency: 'USD', amountMinor: 0 },
        materialTerms: [
          { termId: 'provider-cost', label: 'Provider cost', value: 'Public keyless HTTPS; platform-funded provider cost is USD 0.' },
          { termId: 'source-attribution', label: 'Source', value: 'European Central Bank via Frankfurter.' },
          { termId: 'usage-boundary', label: 'Use', value: 'Reference data only; not a tradable quote, guarantee, or financial advice.' },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'AE-curated external publication with ECB attribution and no provider endorsement implied.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...FRANKFURTER_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['frankfurter', 'exchange rates', 'ecb rates', 'currency conversion', 'single currency pair'],
      registrationEvidenceRefs: [...FRANKFURTER_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:frankfurter-ecb-rates:single-rate:v1',
    credentialRef: FRANKFURTER_CREDENTIAL_REF,
    registrationEvidenceRefs: [...FRANKFURTER_SOURCE_EVIDENCE],
    requestTimeoutMs: 10_000,
  },
  evidenceRefs: [...FRANKFURTER_SOURCE_EVIDENCE],
}

type CuratedProviderPublication = Readonly<{
  businessSlug: string
  publication: CapabilityPublicationImport
}>

export const CURATED_PROVIDER_PUBLICATIONS = [
  { businessSlug: EXA_BUSINESS_SLUG, publication: exaSearchPublicationImport },
  { businessSlug: EXA_BUSINESS_SLUG, publication: exaContentsPublicationImport },
  { businessSlug: FRANKFURTER_BUSINESS_SLUG, publication: frankfurterSingleRatePublicationImport },
] as const satisfies readonly CuratedProviderPublication[]
