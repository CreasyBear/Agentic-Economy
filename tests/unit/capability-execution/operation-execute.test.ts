import { describe, expect, it, vi } from 'vitest'

const sourceMocks = vi.hoisted(() => ({
  callPublicSourceQuery: vi.fn(),
  createConvexServerFunctionAssertion: vi.fn(async () => ({
    principalId: 'ae:server-function',
    ownerId: 'ae:server-function',
    credentialId: 'ae:server-function',
    scopes: ['capability_supply:read_executable'],
    issuedAt: 1,
    signature: 'test-signature',
  })),
}))

vi.mock('@/lib/server/convex-source', () => ({
  callPublicSourceQuery: sourceMocks.callPublicSourceQuery,
  createConvexServerFunctionAssertion: sourceMocks.createConvexServerFunctionAssertion,
  sourceQuery: (name: string) => ({ name }),
}))

import {
  executeOperation,
  operationExecutionBindingDigest,
  type OperationExecutableDescriptor,
  type OperationExecuteResult,
} from '@/modules/capability-execution/operation-execute.functions'
import { convexKeylessExecutableSource } from '@/modules/capability-execution/operation-execute.actions'
import {
  CURATED_PROVIDER_PUBLICATIONS,
  isPublicOperationRef,
  normalizeCapabilityPublication,
} from '@/modules/capability-supply/public'
import {
  deriveKeylessDescriptors,
  seededDescriptorFor,
  seededKeylessSeeds,
  seedKeylessExecutableSource,
} from '../../helpers/keyless-seed-source'

const FX = {
  operationRef: 'operation:v1:' + 'a'.repeat(64),
  capabilityId: 'frankfurter.single-rate',
  name: 'Frankfurter single-pair rate',
  endpointUrl: 'https://api.frankfurter.app/latest',
  authority: { kind: 'keyless' },
  adapterId: 'http-json:v1',
  method: 'GET',
  price: { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 2 } },
  effects: [],
  query: [
    { inputPointer: '/from', parameter: 'from', required: true, style: 'form', explode: false },
    { inputPointer: '/to', parameter: 'to', required: true, style: 'form', explode: false },
  ],
  requestTimeoutMs: 10_000,
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { from: { type: 'string' }, to: { type: 'string' } },
    required: ['from', 'to'],
  },
  provenance: { publisher: 'ae_curated_external', sourceKind: 'openapi_http' },
} as const satisfies OperationExecutableDescriptor

type FetchFn = NonNullable<Parameters<typeof executeOperation>[1]['fetchImpl']>

function okFetch(fetchImpl: FetchFn = (_u, _i) => Promise.resolve(new Response(JSON.stringify({ base: 'EUR', date: '2026-01-01', rates: { USD: 1.08 } }), {
  status: 200, headers: { 'content-type': 'application/json' },
}))) {
  return fetchImpl
}

async function run(
  descriptor: OperationExecutableDescriptor | null,
  input: Record<string, unknown>,
  fetchImpl?: FetchFn,
): Promise<{ result: OperationExecuteResult; lastUrl: string | undefined }> {
  let lastUrl: string | undefined
  const callFetch = fetchImpl ?? okFetch((url) => {
    lastUrl = String(url)
    return Promise.resolve(new Response(JSON.stringify({ base: 'EUR', date: '2026-01-01', rates: { USD: 1.08 } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
  })
  const result = await executeOperation(
    { operationRef: FX.operationRef, input },
    { readDescriptor: async () => descriptor, isPublicTarget: async () => true, fetchImpl: callFetch },
  )
  return { result, lastUrl }
}

describe('operation.execute executor (pure, DB-driven)', () => {
  it('executes a keyless http-json GET against the DB endpoint with mapped query params', async () => {
    const { result, lastUrl } = await run(FX, { from: 'EUR', to: 'USD' })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.output).toMatchObject({ base: 'EUR', rates: { USD: 1.08 } })
      expect(result.evidenceHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
    expect(lastUrl).toContain('https://api.frankfurter.app/latest')
    expect(lastUrl).toContain('from=EUR')
    expect(lastUrl).toContain('to=USD')
  })
  it('refuses a paid keyless descriptor before network access', async () => {
    const paid: OperationExecutableDescriptor = {
      ...FX,
      price: { kind: 'fixed', amount: { currency: 'USD', units: '1', exponent: 2 } },
    }
    const fetch = vi.fn()
    const { result } = await run(paid, { from: 'EUR', to: 'USD' }, fetch as unknown as FetchFn)
    expect(result).toEqual({
      kind: 'refused',
      operationRef: FX.operationRef,
      reason: 'operation_not_executable',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('enforces the DB response status before exact base media and body validation', async () => {
    const descriptor: OperationExecutableDescriptor = {
      ...FX,
      responseStatus: 201,
      responseContentType: 'application/json',
    }
    const wrongStatus = await run(descriptor, { from: 'EUR', to: 'USD' }, () => Promise.resolve(
      new Response('not-json', {
        status: 200,
        headers: { 'content-type': 'application/json-invalid' },
      }),
    ))
    expect(wrongStatus.result).toMatchObject({
      kind: 'error',
      code: 'response_invalid',
      reason: 'The operation returned HTTP 200; expected HTTP 201.',
    })

    const accepted = await run(descriptor, { from: 'EUR', to: 'USD' }, () => Promise.resolve(
      new Response(JSON.stringify({ base: 'EUR', date: '2026-01-01', rates: { USD: 1.08 } }), {
        status: 201,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    ))
    expect(accepted.result.kind).toBe('ok')

    const wrongMedia = await run(descriptor, { from: 'EUR', to: 'USD' }, () => Promise.resolve(
      new Response(JSON.stringify({ base: 'EUR', date: '2026-01-01', rates: { USD: 1.08 } }), {
        status: 201,
        headers: { 'content-type': 'application/json-invalid' },
      }),
    ))
    expect(wrongMedia.result).toMatchObject({
      kind: 'error',
      code: 'response_invalid',
      reason: 'The operation did not return application/json.',
    })
  })

  it('refuses a readable operation ref before reading the descriptor or network', async () => {
    const readDescriptorPort = vi.fn()
    const fetch = vi.fn()
    const readableRef = `operation:v1:${FX.capabilityId}`

    const result = await executeOperation(
      { operationRef: readableRef, input: {} },
      { readDescriptor: readDescriptorPort, isPublicTarget: async () => true, fetchImpl: fetch as unknown as FetchFn },
    )

    expect(result).toEqual({ kind: 'refused', operationRef: readableRef, reason: 'operation_not_found' })
    expect(readDescriptorPort).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a descriptor whose canonical identity differs before network access', async () => {
    const mismatched: OperationExecutableDescriptor = {
      ...FX,
      operationRef: `operation:v1:${'b'.repeat(64)}`,
    }
    const readDescriptorPort = vi.fn(async () => mismatched)
    const fetch = vi.fn()

    const result = await executeOperation(
      { operationRef: FX.operationRef, input: { from: 'EUR', to: 'USD' } },
      { readDescriptor: readDescriptorPort, isPublicTarget: async () => true, fetchImpl: fetch as unknown as FetchFn },
    )

    expect(result).toEqual({ kind: 'refused', operationRef: FX.operationRef, reason: 'operation_not_found' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('refuses a binding changed after selection before provider dispatch', async () => {
    const replacement: OperationExecutableDescriptor = {
      ...FX,
      endpointUrl: 'https://replacement.example.test/current',
      inputSchema: {
        ...FX.inputSchema,
        properties: { from: { type: 'string' }, to: { type: 'number' } },
      },
    }
    let current: OperationExecutableDescriptor = FX
    const readDescriptor = vi.fn(async () => current)
    const selected = await readDescriptor()
    const expectedExecutionBindingDigest = operationExecutionBindingDigest(selected)
    current = replacement
    const fetch = vi.fn()
    const isPublicTarget = vi.fn(async () => true)

    const result = await executeOperation(
      { operationRef: FX.operationRef, input: { from: 'EUR', to: 'USD' } },
      { readDescriptor, isPublicTarget, fetchImpl: fetch as unknown as FetchFn },
      expectedExecutionBindingDigest,
    )

    expect(result).toEqual({
      kind: 'refused',
      operationRef: FX.operationRef,
      reason: 'operation_not_executable',
    })
    expect(readDescriptor).toHaveBeenCalledTimes(2)
    expect(isPublicTarget).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('refuses malformed executable material before digest or provider dispatch', async () => {
    const malformed = { ...FX, price: undefined } as unknown as OperationExecutableDescriptor
    const fetch = vi.fn()
    const isPublicTarget = vi.fn(async () => true)

    const result = await executeOperation(
      { operationRef: FX.operationRef, input: { from: 'EUR', to: 'USD' } },
      {
        readDescriptor: async () => malformed,
        isPublicTarget,
        fetchImpl: fetch as unknown as FetchFn,
      },
    )

    expect(result).toEqual({
      kind: 'refused',
      operationRef: FX.operationRef,
      reason: 'operation_not_executable',
    })
    expect(isPublicTarget).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses when the operation is not in the DB', async () => {
    const { result } = await run(null, { from: 'EUR', to: 'USD' })
    expect(result).toMatchObject({ kind: 'refused', reason: 'operation_not_found' })
  })

  it('refuses a keyed operation (credential required) without executing', async () => {
    const keyed: OperationExecutableDescriptor = {
      ...FX,
      authority: {
        kind: 'provider_connection',
        connectionRef: 'connection:xyz',
        providerRef: 'provider:xyz',
      },
    }
    const fetch = vi.fn()
    const { result } = await run(keyed, { from: 'EUR', to: 'USD' }, fetch as unknown as FetchFn)
    expect(result).toMatchObject({ kind: 'refused', reason: 'operation_not_keyless' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses an observed x402 listing (never executable)', async () => {
    const observed: OperationExecutableDescriptor = { ...FX, provenance: { publisher: 'observed_external', sourceKind: 'x402' } }
    const fetch = vi.fn()
    const { result } = await run(observed, { from: 'EUR', to: 'USD' }, fetch as unknown as FetchFn)
    expect(result).toMatchObject({ kind: 'refused', reason: 'operation_not_executable' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses input that fails the DB-held input schema', async () => {
    const fetch = vi.fn()
    // missing required `to` field -> schema invalid -> no network
    const { result } = await run(FX, { from: 'EUR' }, fetch as unknown as FetchFn)
    expect(result).toMatchObject({ kind: 'refused', reason: 'input_invalid' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a non-HTTPS endpoint (SSRF floor) without executing', async () => {
    const http: OperationExecutableDescriptor = { ...FX, endpointUrl: 'http://api.frankfurter.app/latest' }
    const fetch = vi.fn()
    const { result } = await run(http, { from: 'EUR', to: 'USD' }, fetch as unknown as FetchFn)
    expect(result).toMatchObject({ kind: 'refused', reason: 'endpoint_invalid' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports a typed retryable provider error on 5xx', async () => {
    const fetch = (_u: unknown, _i: unknown) => Promise.resolve(new Response('boom', {
      status: 503, headers: { 'content-type': 'text/plain' },
    }))
    const { result } = await run(FX, { from: 'EUR', to: 'USD' }, fetch)
    expect(result).toMatchObject({ kind: 'error', code: 'provider_error', retryable: true })
  })

  it('rejects a response that fails the DB output schema', async () => {
    const withOutput: OperationExecutableDescriptor = {
      ...FX,
      outputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['rates'] },
    }
    const fetch = () => Promise.resolve(new Response(JSON.stringify({ no: 'rates' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    const { result } = await run(withOutput, { from: 'EUR', to: 'USD' }, fetch)
    expect(result).toMatchObject({ kind: 'error', code: 'response_invalid', retryable: false })
  })

  it('validates immutable contract output schemas without mutating them', async () => {
    const outputSchema = Object.freeze({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { rates: { type: 'object' } },
      required: ['rates'],
    })
    const withOutput: OperationExecutableDescriptor = { ...FX, outputSchema }
    const { result } = await run(withOutput, { from: 'EUR', to: 'USD' })

    expect(result.kind).toBe('ok')
    expect(Object.isFrozen(outputSchema)).toBe(true)
  })
  it('sends fixed JSON format for an ipify response without accepting a format override', async () => {
    const ipify: OperationExecutableDescriptor = {
      ...FX,
      capabilityId: 'ipify.public-ip',
      name: 'Get public IP',
      endpointUrl: 'https://api.ipify.org/',
      query: [],
      fixedQuery: [{ parameter: 'format', value: 'json' }],
      inputSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      outputSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { ip: { type: 'string', format: 'ipv4' } },
        required: ['ip'],
        additionalProperties: false,
      },
    }
    let lastUrl: URL | undefined
    const fetch: FetchFn = (input, _init) => {
      lastUrl = new URL(String(input))
      return Promise.resolve(new Response(JSON.stringify({ ip: '203.0.113.5' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    }
    const { result } = await run(ipify, {}, fetch)
    expect(result.kind).toBe('ok')
    expect(lastUrl?.searchParams.get('format')).toBe('json')
  })
  it('executes a safe keyless POST descriptor with mapped query parameters', async () => {
    const descriptor: OperationExecutableDescriptor = {
      ...FX,
      method: 'POST',
      endpointUrl: 'https://api.example.test/query-only',
      query: [{ inputPointer: '/query', parameter: 'query', required: true, style: 'form', explode: true }],
      inputSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
    }
    const fetch = vi.fn(async (input: URL | string, init?: RequestInit) => {
      expect(new URL(String(input)).searchParams.get('query')).toBe('hello')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeUndefined()
      return new Response(JSON.stringify({ result: 'safe' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    })
    const { result } = await run(descriptor, { query: 'hello' }, fetch as unknown as FetchFn)

    expect(result.kind).toBe('ok')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('refuses a consequential keyless POST descriptor before network access', async () => {
    const descriptor: OperationExecutableDescriptor = {
      ...FX,
      method: 'POST',
      effects: [{ class: 'external_state_change', authority: 'mandate_or_explicit' }],
    }
    const fetch = vi.fn()
    const { result } = await run(descriptor, { from: 'EUR', to: 'USD' }, fetch as unknown as FetchFn)

    expect(result).toMatchObject({ kind: 'refused', reason: 'operation_not_executable' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses an effectful GET descriptor before network access', async () => {
    const descriptor: OperationExecutableDescriptor = {
      ...FX,
      effects: [{ class: 'external_state_change', authority: 'mandate_or_explicit' }],
    }
    const fetch = vi.fn()
    const { result } = await run(descriptor, { from: 'EUR', to: 'USD' }, fetch as unknown as FetchFn)

    expect(result).toMatchObject({ kind: 'refused', reason: 'operation_not_executable' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('curated provider execution fixtures', () => {
  it('accepts a representative Open-Meteo current-weather response and rejects malformed weather codes', async () => {
    const publicationEntry = CURATED_PROVIDER_PUBLICATIONS.find(({ publication }) => (
      publication.kind === 'openapi_http' && publication.contract.capabilityId === 'open-meteo.forecast'
    ))
    if (publicationEntry === undefined || publicationEntry.publication.kind !== 'openapi_http') {
      throw new Error('curated_publication_missing:open-meteo.forecast')
    }
    const normalized = await normalizeCapabilityPublication(publicationEntry.publication)
    if (normalized.kind !== 'normalized') throw new Error(`curated_publication_refused:${normalized.reason}`)
    const document = JSON.parse(normalized.draft.documentJson) as {
      inputSchema: Record<string, unknown>
      outputSchema: Record<string, unknown>
    }
    const descriptor: OperationExecutableDescriptor = {
      ...FX,
      capabilityId: 'open-meteo.forecast',
      name: 'Open-Meteo weather forecast',
      endpointUrl: 'https://api.open-meteo.com/v1/forecast',
      query: [
        { inputPointer: '/latitude', parameter: 'latitude' },
        { inputPointer: '/longitude', parameter: 'longitude' },
        { inputPointer: '/current_weather', parameter: 'current_weather' },
      ],
      inputSchema: document.inputSchema,
      outputSchema: document.outputSchema,
    }
    const response = {
      latitude: 48.86,
      longitude: 2.3599997,
      generationtime_ms: 0.0869,
      utc_offset_seconds: 0,
      timezone: 'GMT',
      timezone_abbreviation: 'GMT',
      elevation: 40,
      current_weather_units: {
        time: 'iso8601',
        interval: 'seconds',
        temperature: '°C',
        windspeed: 'km/h',
        winddirection: '°',
        is_day: '',
        weathercode: 'wmo code',
      },
      current_weather: {
        time: '2026-08-08T11:45',
        interval: 900,
        temperature: 27.8,
        windspeed: 4.1,
        winddirection: 38,
        is_day: 1,
        weathercode: 0,
      },
    }
    const fetchResponse = () => Promise.resolve(new Response(JSON.stringify(response), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    const valid = await run(descriptor, { latitude: 48.857, longitude: 2.352, current_weather: true }, fetchResponse)
    expect(valid.result.kind).toBe('ok')

    const malformed = await run(descriptor, { latitude: 48.857, longitude: 2.352, current_weather: true }, () =>
      Promise.resolve(new Response(JSON.stringify({
        ...response,
        current_weather: { ...response.current_weather, weathercode: '0' },
      }), { status: 200, headers: { 'content-type': 'application/json' } })),
    )
    expect(malformed.result).toMatchObject({ kind: 'error', code: 'response_invalid' })
  })
})
describe('canonical seed operation references', () => {
  it('round-trips canonical refs through the seed source and rejects readable refs', async () => {
    sourceMocks.callPublicSourceQuery.mockRejectedValue(new Error('convex unavailable'))
    const descriptors = await deriveKeylessDescriptors()
    expect(descriptors.length).toBeGreaterThan(0)
    const capabilityIds = descriptors.map((descriptor) => descriptor.capabilityId)
    expect(capabilityIds).toEqual(expect.arrayContaining([
      'coingecko.simple-price',
      'open-meteo.forecast',
      'open-meteo.geocoding',
    ]))
    for (const canonicalCapabilityId of [
      'coingecko.simple-price',
      'open-meteo.forecast',
      'wikipedia-rest.page-summary',
    ]) {
      expect(CURATED_PROVIDER_PUBLICATIONS.some(({ publication }) => (
        publication.kind === 'openapi_http' && publication.contract.capabilityId === canonicalCapabilityId
      ))).toBe(true)
    }

    const frankfurter = descriptors.filter((descriptor) => descriptor.capabilityId === 'frankfurter.single-rate')
    expect(frankfurter).toHaveLength(1)
    expect(frankfurter[0]).toMatchObject({
      operationRef: expect.stringMatching(/^operation:v1:[0-9a-f]{64}$/),
      capabilityId: 'frankfurter.single-rate',
      query: [
        { inputPointer: '/base', parameter: 'base', required: true, style: 'form', explode: true },
        { inputPointer: '/quote', parameter: 'quotes', required: true, style: 'form', explode: true },
      ],
      inputSchema: {
        properties: { base: expect.any(Object), quote: expect.any(Object) },
        required: ['base', 'quote'],
        additionalProperties: false,
      },
    })
    expect((frankfurter[0]!.inputSchema.properties as Record<string, unknown>)).not.toHaveProperty('quotes')

    for (const excludedCapabilityId of [
      'exa.search',
      'exa.contents',
      'openweathermap.current-weather',
      'tavily.search',
      'serpapi.google-search',
      'coingecko.simple-price-demo',
      'wikipedia-rest.page-summary',
      'exa-search-x402',
      'timezone-convert-x402',
      'wolframalpha-query-x402',
      'coinmarketcap-quotes-x402',
      'flightaware-nearby-x402',
      'bizintel-forex-rate-x402',
      'tavily-search-x402',
    ]) {
      expect(capabilityIds).not.toContain(excludedCapabilityId)
    }

    for (const descriptor of descriptors) {
      expect(isPublicOperationRef(descriptor.operationRef)).toBe(true)
    }
    const ipify = descriptors.find((descriptor) => descriptor.capabilityId === 'ipify.public-ip')
    expect(ipify).toMatchObject({
      fixedQuery: [{ parameter: 'format', value: 'json' }],
      inputSchema: { properties: {}, required: [], additionalProperties: false },
    })
    expect(ipify).not.toHaveProperty('query')
    const coingeckoSeed = (await seededKeylessSeeds())
      .find(({ capabilityId }) => capabilityId === 'coingecko.simple-price')
    expect(coingeckoSeed?.name).toBe('CoinGecko simple price')
    expect(coingeckoSeed?.inputExamples).toContainEqual({
      label: 'bitcoin price',
      input: { ids: 'bitcoin', vs_currencies: 'usd' },
    })

    const descriptor = descriptors[0]!
    await expect(seededDescriptorFor(descriptor.operationRef)).resolves.toEqual(descriptor)

    const readableRef = `operation:v1:${descriptor.capabilityId}`
    expect(isPublicOperationRef(readableRef)).toBe(false)
    await expect(seededDescriptorFor(readableRef)).resolves.toBeUndefined()
    await expect(seedKeylessExecutableSource.read(readableRef)).resolves.toBeNull()
    sourceMocks.callPublicSourceQuery.mockClear()
    await expect(convexKeylessExecutableSource.read(readableRef)).resolves.toBeNull()
    expect(sourceMocks.callPublicSourceQuery).not.toHaveBeenCalled()
  })

  it('accepts canonical DB identities and hides noncanonical DB rows', async () => {
    sourceMocks.callPublicSourceQuery.mockReset()
    sourceMocks.createConvexServerFunctionAssertion.mockClear()
    const descriptors = await deriveKeylessDescriptors()
    const descriptor = descriptors[0]!
    const noncanonicalRef = `operation:v1:${descriptor.capabilityId}`

    const {
      inputSchema,
      outputSchema,
      ...wireDescriptor
    } = descriptor
    sourceMocks.callPublicSourceQuery.mockResolvedValueOnce({
      ...wireDescriptor,
      inputSchemaJson: JSON.stringify(inputSchema),
      ...(outputSchema === undefined ? {} : { outputSchemaJson: JSON.stringify(outputSchema) }),
    })
    await expect(convexKeylessExecutableSource.read(descriptor.operationRef)).resolves.toEqual(descriptor)
    expect(sourceMocks.createConvexServerFunctionAssertion).toHaveBeenCalledWith({
      operation: 'capabilitySupplyOperations:readKeylessExecutable',
      scope: 'capability_supply:read_executable',
      command: { operationRef: descriptor.operationRef },
    })

    sourceMocks.callPublicSourceQuery.mockResolvedValueOnce({
      ...wireDescriptor,
      inputSchemaJson: JSON.stringify(inputSchema),
      ...(outputSchema === undefined ? {} : { outputSchemaJson: JSON.stringify(outputSchema) }),
      operationRef: noncanonicalRef,
    })
    await expect(convexKeylessExecutableSource.read(descriptor.operationRef)).resolves.toBeNull()

    sourceMocks.callPublicSourceQuery.mockResolvedValueOnce([
      { ...descriptor, operationRef: noncanonicalRef, inputSchemaJson: JSON.stringify(descriptor.inputSchema) },
      {
        operationRef: descriptor.operationRef,
        capabilityId: descriptor.capabilityId,
        name: descriptor.name,
        summary: descriptor.name,
        searchTerms: [descriptor.capabilityId],
        inputSchemaJson: JSON.stringify(descriptor.inputSchema),
        inputExamplesJson: JSON.stringify([{ label: 'example', input: { value: 'x' } }]),
      },
    ])
    const listed = await convexKeylessExecutableSource.list()
    expect(listed.some(({ operationRef }) => operationRef === noncanonicalRef)).toBe(false)
    expect(listed.some(({ operationRef }) => operationRef === descriptor.operationRef)).toBe(true)
    expect(listed.find(({ operationRef }) => operationRef === descriptor.operationRef)?.inputSchema)
      .toEqual(descriptor.inputSchema)
    expect(listed.find(({ operationRef }) => operationRef === descriptor.operationRef)?.inputExamples)
      .toEqual([{ label: 'example', input: { value: 'x' } }])
  })
})