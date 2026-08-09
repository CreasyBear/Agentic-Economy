import { describe, expect, it, vi } from 'vitest'

import {
  importOpenApiHttpCapability,
  injectHttpJsonCredential,
  type CapabilityContractMetadata,
  type CapabilityImporterCommercialInput,
  type HttpJsonTransportConfiguration,
} from '@/modules/capability-supply/public'
import {
  invokePreparedRouteTransport,
  prepareRegisteredRouteTransportInvocation,
  type ProviderConnectionAuthorityLookup,
  type RouteTransportInvocation,
} from '@/modules/capability-supply/route-transport-runtime'
import { runCapabilityReadinessProbe } from '@/modules/capability-supply/internal/readiness-probe'
import { canonicalDigest } from '@/modules/common/canonical-digest'
const providerAuthority = {
  kind: 'provider_connection',
  connectionRef: 'connection:test-provider',
  providerRef: 'provider:test-provider',
} as const
const providerConnectionAuthority = {
  authorityGeneration: 1,
  authorityDigest: canonicalDigest({
    connectionRef: providerAuthority.connectionRef,
    providerRef: providerAuthority.providerRef,
    authorityGeneration: 1,
  }),
} as const
const providerCredentialRef = 'env:TEST_PROVIDER_SECRET'


describe('private HTTP credential placement', () => {
  it('places the SerpAPI query key on the route URL', async () => {
    const config = {
      method: 'GET' as const,
      query: [{ inputPointer: '/q', parameter: 'q' }],
      requestTimeoutMs: 5_000,
      credential: { kind: 'api_key' as const, location: 'query' as const, name: 'api_key' },
    }
    const captured: URL[] = []
    const invocation = routeInvocation('https://serpapi.com/search', config, { q: 'latest AI news' })
    const observed = await invokeRoute(
      invocation,
      captured,
      resolveProviderCredential('serp-secret'),
    )

    expect(observed).toMatchObject({ transport: 'http', disposition: 'succeeded' })
    expect(captured[0]?.href).toBe('https://serpapi.com/search?q=latest+AI+news&api_key=serp-secret')
  })

  it('places the OpenWeather query key on the route URL', async () => {
    const config = {
      method: 'GET' as const,
      query: [{ inputPointer: '/q', parameter: 'q' }],
      requestTimeoutMs: 5_000,
      credential: { kind: 'api_key' as const, location: 'query' as const, name: 'appid' },
    }
    const captured: URL[] = []
    const invocation = routeInvocation('https://api.openweathermap.org/data/2.5/weather', config, { q: 'London' })
    const observed = await invokeRoute(
      invocation,
      captured,
      resolveProviderCredential('weather-secret'),
    )

    expect(observed).toMatchObject({ transport: 'http', disposition: 'succeeded' })
    expect(captured[0]?.href).toBe('https://api.openweathermap.org/data/2.5/weather?q=London&appid=weather-secret')
  })

  it('places the CoinGecko demo key in its exact header', async () => {
    const config = {
      method: 'GET' as const,
      query: [{ inputPointer: '/ids', parameter: 'ids' }],
      requestTimeoutMs: 5_000,
      credential: { kind: 'api_key' as const, location: 'header' as const, name: 'x-cg-demo-api-key' },
    }
    const captured: Array<{ url: URL; headers: Readonly<Record<string, string>> }> = []
    const invocation = routeInvocation('https://api.coingecko.com/api/v3/simple/price', config, { ids: 'bitcoin' })
    const observed = await invokeRoute(
      invocation,
      [],
      resolveProviderCredential('coingecko-secret'),
      captured,
    )

    expect(observed).toMatchObject({ transport: 'http', disposition: 'succeeded' })
    expect(captured[0]?.url.href).toBe('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin')
    expect(captured[0]?.headers['x-cg-demo-api-key']).toBe('coingecko-secret')
    expect(captured[0]?.headers.Authorization).toBeUndefined()
  })

  it('uses Authorization only for an explicitly bearer-configured route', async () => {
    const config = {
      method: 'POST' as const,
      requestTimeoutMs: 5_000,
      credential: { kind: 'bearer' as const },
    }
    const captured: Array<{ url: URL; headers: Readonly<Record<string, string>> }> = []
    const invocation = routeInvocation('https://api.tavily.com/search', config, { query: 'AI news' })
    const observed = await invokeRoute(
      invocation,
      [],
      resolveProviderCredential('tavily-secret'),
      captured,
    )

    expect(observed).toMatchObject({ transport: 'http', disposition: 'succeeded' })
    expect(captured[0]?.headers.Authorization).toBe('Bearer tavily-secret')
  })

  it('does not mutate the caller-owned HTTP configuration while injecting credentials', () => {
    const configuration: HttpJsonTransportConfiguration = {
      method: 'GET',
      query: [{ inputPointer: '/q', parameter: 'q' }],
      fixedQuery: [{ parameter: 'providers', value: 'ECB' }],
      requestTimeoutMs: 5_000,
      credential: { kind: 'api_key', location: 'query', name: 'api_key' },
    }
    const original = structuredClone(configuration)
    const applied = injectHttpJsonCredential(
      configuration,
      new URL('https://provider.example/lookup?q=hello'),
      { Accept: 'application/json' },
      'secret',
    )

    expect(applied?.target.href).toBe('https://provider.example/lookup?q=hello&api_key=secret')
    expect(configuration).toEqual(original)
  })
})

describe('OpenAPI credential admission', () => {
  it.each([
    ['OpenWeather query key', 'query', 'appid', 'env:OPENWEATHER_API_KEY'],
    ['SerpAPI query key', 'query', 'api_key', 'env:SERPAPI_API_KEY'],
    ['CoinGecko header key', 'header', 'x-cg-demo-api-key', 'env:COINGECKO_DEMO_API_KEY'],
    ['bearer', 'bearer', undefined, 'env:TAVILY_API_KEY'],
  ] as const)('preserves %s placement without exposing its environment reference', async (_label, location, name, environmentRef) => {
    const bearer = location === 'bearer'
    const keyedLocation = location === 'header' ? 'header' : 'query'
    const result = await importOpenApiHttpCapability({
      kind: 'openapi_http',
      document: bearer ? bearerDocument() : keyedDocument(keyedLocation, name ?? ''),
      operation: { path: bearer ? '/search' : '/lookup', method: bearer ? 'post' : 'get' },
      contract: contractMetadata(`test.${location}`),
      commercial: commercialInput(providerAuthority),
      evidenceRefs: ['source:provider'],
    })

    expect(result.kind).toBe('normalized')
    if (result.kind !== 'normalized') return
    const config = result.draft.binding.adapter.config as Record<string, unknown>
    expect(config.credential).toEqual(bearer
      ? { kind: 'bearer' }
      : { kind: 'api_key', location, name })
    expect(result.draft.documentJson).not.toContain(environmentRef)
    expect(result.draft.documentJson).not.toContain('secret')
  })

  it('refuses basic and ambiguous OpenAPI security instead of treating either as bearer', async () => {
    const basic = await importOpenApiHttpCapability({
      kind: 'openapi_http', document: securityDocument({ basic: [] }, { basic: { type: 'http', scheme: 'basic' } }),
      operation: { path: '/lookup', method: 'get' }, contract: contractMetadata('test.basic'),
      commercial: commercialInput(providerAuthority), evidenceRefs: ['source:basic'],
    })
    const ambiguous = await importOpenApiHttpCapability({
      kind: 'openapi_http', document: securityDocument(
        [{ apiKey: [] }, { bearer: [] }],
        { apiKey: { type: 'apiKey', in: 'query', name: 'api_key' }, bearer: { type: 'http', scheme: 'bearer' } },
      ),
      operation: { path: '/lookup', method: 'get' }, contract: contractMetadata('test.ambiguous'),
      commercial: commercialInput(providerAuthority), evidenceRefs: ['source:ambiguous'],
    })

    expect(basic).toEqual({ kind: 'refused', reason: 'transport_unsupported' })
    expect(ambiguous).toEqual({ kind: 'refused', reason: 'transport_unsupported' })
  })
})

describe('schema-conformant readiness', () => {
  const outputSchema = {
    type: 'object',
    properties: { rates: { type: 'object' } },
    required: ['rates'],
    additionalProperties: false,
  }
  const target = {
    publicationRef: 'publication:frankfurter:single-rate', revision: 1,
    bindingId: 'binding:frankfurter', capabilityId: 'frankfurter.single-rate',
    endpointUrl: 'https://api.frankfurter.app/latest', authority: { kind: 'keyless' as const }, adapterId: 'http-json:v1',
    probeKind: 'openapi_http' as const, probeMethod: 'GET' as const, probeQuery: [],
    transportConfigJson: JSON.stringify({
      method: 'GET', query: [
        { inputPointer: '/from', parameter: 'from' },
        { inputPointer: '/to', parameter: 'to' },
      ], requestTimeoutMs: 5_000, credential: { kind: 'none' },
    }),
    probeInputJson: JSON.stringify({ from: 'EUR', to: 'USD' }),
    outputSchemaJson: JSON.stringify(outputSchema),
  }

  it('keeps a 200 wrong-shape Frankfurter response unhealthy', async () => {
    const result = await runCapabilityReadinessProbe(target, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send: async (request) => {
        expect(request.url).toBe('https://api.frankfurter.app/latest?from=EUR&to=USD')
        return Response.json({ wrong: true })
      },
      now: () => 10_000,
    })

    expect(result).toMatchObject({ outcome: 'response_invalid', healthState: 'unhealthy' })
  })

  it('accepts a schema-conformant 200 response and leaves its schema immutable', async () => {
    const schema = structuredClone(outputSchema)
    const result = await runCapabilityReadinessProbe({ ...target, outputSchemaJson: JSON.stringify(schema) }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send: async () => Response.json({ rates: { USD: 1.08 } }),
      now: () => 10_000,
    })

    expect(result.outcome).toBe('healthy')
    expect(schema).toEqual(outputSchema)
  })
})

function routeInvocation(
  endpointUrl: string,
  config: Record<string, unknown>,
  input: Record<string, unknown>,
): RouteTransportInvocation {
  return {
    binding: {
      adapterId: 'http-json:v1', endpointUrl, authority: providerAuthority,
      configJson: JSON.stringify(config), configDigest: canonicalDigest(config),
    },
    authority: {
      attemptRef: 'attempt:test', operationKeyDigest: 'sha256:operation',
      mandateDigest: 'sha256:mandate', grantDigest: 'sha256:grant', capabilityContractDigest: 'sha256:contract',
      maximumSpend: { currency: 'USD', units: '1', exponent: 2 }, expiresAt: Date.now() + 60_000,
      callIdentity: { keyId: 'key:test', signature: 'signature:test' },
      authorityGeneration: providerConnectionAuthority.authorityGeneration,
      authorityDigest: providerConnectionAuthority.authorityDigest,
    },
    inputJson: JSON.stringify(input),
  }
}
function resolveProviderCredential(credential: string) {
  return (reference: string) =>
    reference === providerCredentialRef ? credential : undefined
}
function readProviderConnectionCredential(input: ProviderConnectionAuthorityLookup) {
  if (
    input.connectionRef !== providerAuthority.connectionRef
    || input.providerRef !== providerAuthority.providerRef
    || input.adapterId !== 'http-json:v1'
  ) {
    return { kind: 'unavailable' as const, reason: 'not_found' as const }
  }
  if (input.authorityGeneration !== providerConnectionAuthority.authorityGeneration) {
    return { kind: 'unavailable' as const, reason: 'stale_generation' as const }
  }
  if (input.authorityDigest !== providerConnectionAuthority.authorityDigest) {
    return { kind: 'unavailable' as const, reason: 'digest_mismatch' as const }
  }
  return { kind: 'resolved' as const, credentialRef: providerCredentialRef }
}
 
async function invokeRoute(
  invocation: RouteTransportInvocation,
  urls: URL[],
  resolveCredential: (reference: string) => string | undefined,
  captures: Array<{ url: URL; headers: Readonly<Record<string, string>> }> = [],
) {
  const preparation = prepareRegisteredRouteTransportInvocation(invocation, undefined)
  if (preparation.kind !== 'prepared') throw new Error('route_preparation_refused')
  return await invokePreparedRouteTransport(preparation.prepared, {
    resolveCredential,
    readProviderConnectionCredentialRef: readProviderConnectionCredential,
    send: vi.fn(async (url, init) => {
      urls.push(url)
      captures.push({ url, headers: init?.headers ?? {} })
      return Response.json({ result: 'ok' })
    }),
  })
}
 

function contractMetadata(capabilityId: string): CapabilityContractMetadata {
  return {
    capabilityId, version: 1, name: 'Provider lookup', description: 'Returns one provider result.',
    customerAnnotations: [
      { annotationId: 'query', document: 'input', pointer: '/query', label: 'Query', role: 'request' },
      { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
    ],
    dataUse: [{
      effectId: 'query_release', inputPointer: '/query', classification: 'public', phase: 'execution',
      recipient: { kind: 'selected_binding' }, purposes: ['lookup'],
    }],
    effects: [{ effectId: 'query_release', class: 'data_release', authority: 'explicit', reversibility: 'irreversible' }],
    evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
    lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
    inputExamples: [{ label: 'Representative lookup', input: { query: 'hello' } }],
  }
}

function commercialInput(authority: CapabilityImporterCommercialInput['authority']): CapabilityImporterCommercialInput {
  return {
    offering: {
      offeringId: 'offering:test:lookup', networkId: 'ae:public',
      presentation: {
        label: 'Provider lookup', summary: 'Returns one result.',
        price: { kind: 'fixed', amount: { currency: 'USD', units: '1', exponent: 2 } },
        materialTerms: [],
        commercialRelationship: {
          kind: 'none', summary: 'No commercial influence.', influencesEligibility: false,
          influencesInclusion: false, influencesOrder: false, evidenceRefs: ['commercial:none'],
        },
      },
      searchTerms: ['lookup'], registrationEvidenceRefs: ['registration:offering'],
    },
    bindingId: 'binding:test:lookup', authority,
    registrationEvidenceRefs: ['registration:binding'], requestTimeoutMs: 5_000,
  }
}

function keyedDocument(location: 'query' | 'header', name: string) {
  return securityDocument({ provider: [] }, { provider: { type: 'apiKey', in: location, name } })
}

function bearerDocument() {
  return {
    openapi: '3.1.0', servers: [{ url: 'https://provider.example' }], security: [{ bearer: [] }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
    paths: {
      '/search': { post: {
        requestBody: { content: { 'application/json': { schema: inputSchema() } } },
        responses: { '200': { content: { 'application/json': { schema: outputSchema() } } } },
      } },
    },
  }
}

function securityDocument(security: unknown, schemes: Record<string, unknown>) {
  const getSecurity = Array.isArray(security) ? security : [security]
  return {
    openapi: '3.1.0', servers: [{ url: 'https://provider.example' }], security: getSecurity,
    components: { securitySchemes: schemes },
    paths: {
      '/lookup': { get: {
        parameters: [{ in: 'query', name: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { content: { 'application/json': { schema: outputSchema() } } } },
      } },
    },
  }
}

function inputSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false,
  }
}

function outputSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { result: { type: 'string' } },
    required: ['result'],
    additionalProperties: false,
  }
}
