import { describe, expect, it } from 'vitest'
import { Validator, type Schema } from '@cfworker/json-schema'

import {
  normalizeCapabilityPublication,
} from '@/modules/capability-supply/public'
import {
  CURATED_PROVIDER_PUBLICATIONS,
  exaContentsPublicationImport,
  exaSearchPublicationImport,
  frankfurterSingleRatePublicationImport,
} from '@/modules/dev/public'
import { CLUSTER_C_PUBLICATIONS } from '@/modules/dev/internal/curated-cluster-c-publications'

describe('curated provider publications', () => {
  it('normalizes every curated real-provider operation through the generic import boundary', async () => {
    const normalized = await Promise.all(CURATED_PROVIDER_PUBLICATIONS.map(({ publication }) =>
      normalizeCapabilityPublication(publication),
    ))

    expect(normalized.every(({ kind }) => kind === 'normalized')).toBe(true)
    expect(normalized.map((result) => (
      result.kind === 'normalized'
        ? JSON.parse(result.draft.documentJson).capabilityId as string
        : result.reason
    ))).toEqual([
      'exa.search', 'exa.contents', 'frankfurter.single-rate',
      'open-meteo.forecast', 'open-meteo.geocoding', 'wikipedia-rest.page-summary', 'mockster.cat-images',
      'coingecko.simple-price', 'ipify.public-ip', 'openweathermap.current-weather', 'tavily.search',
      'serpapi.google-search', 'coingecko.simple-price-demo',
      'exa-search-x402', 'timezone-convert-x402', 'wolframalpha-query-x402', 'coinmarketcap-quotes-x402',
      'flightaware-nearby-x402', 'bizintel-forex-rate-x402', 'tavily-search-x402',
    ])
  })
  it('keeps observed x402 listings paid and outside keyless execution', async () => {
    const observedPublications = new Set<unknown>(CLUSTER_C_PUBLICATIONS.map(({ publication }) => publication))
    const observed = CURATED_PROVIDER_PUBLICATIONS.filter(({ publication }) => observedPublications.has(publication))
    expect(observed).toHaveLength(CLUSTER_C_PUBLICATIONS.length)
    expect(observed.length).toBeGreaterThan(0)
    expect(observed.every(({ publication }) => publication.kind === 'x402')).toBe(true)
    const normalized = await Promise.all(observed.map(({ publication }) => normalizeCapabilityPublication(publication)))
    expect(normalized.every((result) => result.kind === 'normalized')).toBe(true)
    for (const result of normalized) {
      if (result.kind !== 'normalized') continue
      expect(result.draft.source.kind).toBe('x402')
      expect(result.draft.offering.presentation.price.kind).toBe('fixed')
      if (result.draft.offering.presentation.price.kind === 'fixed') {
        expect(result.draft.offering.presentation.price.amount.units).not.toMatch(/^0+$/)
      }
      expect(result.draft.binding.authority.kind).toBe('provider_connection')
      expect(result.draft.binding.adapter.adapterId).toBe('x402-fetch:v2')
      expect(JSON.stringify(result.draft.binding)).not.toMatch(/credentialRef|access[-_]location|accessLocation|env:/iu)
      expect(result.draft.binding.adapter.config).toMatchObject({ scheme: 'exact', network: 'eip155:8453' })
    }
  })


  it('keeps Exa API-key endpoints in source-owned OpenAPI records without payment transport', async () => {
    const imports = [exaSearchPublicationImport, exaContentsPublicationImport]
    const normalized = await Promise.all(imports.map((publication) => normalizeCapabilityPublication(publication)))

    expect(imports.map(({ kind }) => kind)).toEqual(['openapi_http', 'openapi_http'])
    expect(normalized).toMatchObject([
      {
        kind: 'normalized',
        draft: {
          binding: {
            endpointUrl: 'https://api.exa.ai/search',
            authority: { kind: 'provider_connection', connectionRef: 'connection:exa', providerRef: 'provider:exa' },
            adapter: { adapterId: 'http-json:v1' },
          },
        },
      },
      {
        kind: 'normalized',
        draft: {
          binding: {
            endpointUrl: 'https://api.exa.ai/contents',
            authority: { kind: 'provider_connection', connectionRef: 'connection:exa', providerRef: 'provider:exa' },
            adapter: { adapterId: 'http-json:v1' },
          },
        },
      },
    ])
  })

  it('carries seeded inputExamples through normalization and omits them for unseeded ops', async () => {
    const normalized = await Promise.all(CURATED_PROVIDER_PUBLICATIONS.map(({ publication }) =>
      normalizeCapabilityPublication(publication),
    ))
    const byCapability = new Map<string, Readonly<{ capabilityId: string; inputExamples?: unknown }>[]>()
    for (const result of normalized) {
      if (result.kind !== 'normalized') continue
      const document = JSON.parse(result.draft.documentJson) as Readonly<{ capabilityId: string; inputExamples?: unknown }>
      const bucket = byCapability.get(document.capabilityId) ?? []
      bucket.push(document)
      byCapability.set(document.capabilityId, bucket)
    }
    const seeded = new Map<string, unknown>([
      ['open-meteo.forecast', { latitude: 48.857, longitude: 2.352, current_weather: true }],
      ['open-meteo.geocoding', { name: 'Paris', count: 5 }],
      ['frankfurter.single-rate', { base: 'EUR', quote: 'USD' }],
      ['exa.search', { query: 'latest AI news' }],
      ['coingecko.simple-price', { ids: 'bitcoin', vs_currencies: 'usd' }],
      ['openweathermap.current-weather', { q: 'London' }],
      ['serpapi.google-search', { q: 'agent economy', num: 3 }],
      ['coingecko.simple-price-demo', {}],
      ['wikipedia-rest.page-summary', { title: 'Paris' }],
      ['mockster.cat-images', { count: 1 }],
      ['ipify.public-ip', {}],
    ])
    for (const [capabilityId, input] of seeded) {
      const docs = byCapability.get(capabilityId) ?? []
      const carrying = docs.find((document) => document.inputExamples !== undefined)
      expect(carrying).toBeTruthy()
      const examples = carrying?.inputExamples
      if (!Array.isArray(examples) || examples.length === 0) continue
      const first = examples[0]
      if (typeof first !== 'object' || first === null || !('input' in first)) continue
      expect(first.input).toEqual(input)
    }
    const unseeded = [...byCapability.entries()]
      .filter(([capabilityId]) => !seeded.has(capabilityId) && capabilityId !== 'exa.contents')
    expect(unseeded.length).toBeGreaterThan(0)
    for (const [, docs] of unseeded) {
      for (const document of docs) {
        expect(document.inputExamples).toBeUndefined()
      }
    }
  })

  it('gives every keyless cluster-A op a probe-target-valid inputExample (drops input_unrepresentable)', async () => {
    const normalized = await Promise.all(CURATED_PROVIDER_PUBLICATIONS.map(({ publication }) =>
      normalizeCapabilityPublication(publication),
    ))
    const clusterAKeyless = new Set([
      'open-meteo.forecast',
      'open-meteo.geocoding',
      'wikipedia-rest.page-summary',
      'mockster.cat-images',
      'ipify.public-ip',
    ])
    const byCapability = new Map<string, Readonly<{ capabilityId: string; inputSchema?: Schema; inputExamples?: Array<{ input: unknown }> }>>()
    for (const result of normalized) {
      if (result.kind !== 'normalized') continue
      const document = JSON.parse(result.draft.documentJson) as Readonly<{ capabilityId: string; inputSchema?: Schema; inputExamples?: Array<{ input: unknown }> }>
      if (clusterAKeyless.has(document.capabilityId)) byCapability.set(document.capabilityId, document)
    }
    expect([...byCapability.keys()].sort()).toEqual([...clusterAKeyless].sort())
    for (const [capabilityId, document] of byCapability) {
      expect(document.inputSchema, `${capabilityId} inputSchema`).toBeTruthy()
      const examples = document.inputExamples ?? []
      expect(examples.length, `${capabilityId} must seed at least one inputExample`).toBeGreaterThan(0)
      const validator = new Validator(document.inputSchema as Schema)
      for (const { input } of examples) {
        const result = validator.validate(input)
        expect(result.valid, `${capabilityId} example ${JSON.stringify(input)} must satisfy inputSchema`).toBe(true)
      }
    }
  })

  it('maps generic CoinGecko inputs onto query transport and keeps root completion evidence', async () => {
    const entry = CURATED_PROVIDER_PUBLICATIONS.find(({ publication }) => (
      publication.kind === 'openapi_http' && publication.contract.capabilityId === 'coingecko.simple-price'
    ))
    if (entry === undefined || entry.publication.kind !== 'openapi_http') {
      throw new Error('curated_publication_missing:coingecko.simple-price')
    }
    const normalized = await normalizeCapabilityPublication(entry.publication)
    expect(normalized).toMatchObject({
      kind: 'normalized',
      draft: {
        binding: {
          adapter: {
            config: {
              method: 'GET',
              query: [
                { inputPointer: '/ids', parameter: 'ids' },
                { inputPointer: '/vs_currencies', parameter: 'vs_currencies' },
                { inputPointer: '/include_24hr_change', parameter: 'include_24hr_change' },
              ],
            },
          },
        },
      },
    })
    if (normalized.kind !== 'normalized') return
    const document = JSON.parse(normalized.draft.documentJson) as Record<string, unknown>
    expect(document.inputExamples).toEqual([
      { label: 'bitcoin price', input: { ids: 'bitcoin', vs_currencies: 'usd' } },
      { label: 'ethereum price', input: { ids: 'ethereum', vs_currencies: 'usd' } },
      {
        label: 'bitcoin and ethereum comparison',
        input: { ids: 'bitcoin,ethereum', vs_currencies: 'usd', include_24hr_change: true },
      },
    ])
    expect(document.customerAnnotations).toEqual(expect.arrayContaining([
      expect.objectContaining({ annotationId: 'prices', document: 'output', pointer: '', role: 'completion_evidence' }),
    ]))
    expect(document.evidence).toEqual(expect.arrayContaining([
      { evidenceId: 'prices', outputPointer: '', purpose: 'completion' },
    ]))
  })

  it('pins the Frankfurter provider query while exposing the contract key quote', async () => {
    const result = await normalizeCapabilityPublication(frankfurterSingleRatePublicationImport)

    expect(result).toMatchObject({
      kind: 'normalized',
      draft: {
        binding: {
          endpointUrl: 'https://api.frankfurter.dev/v2/rates',
          authority: { kind: 'keyless' },
          adapter: {
            adapterId: 'http-json:v1',
            config: {
              method: 'GET',
              query: [
                { inputPointer: '/base', parameter: 'base' },
                { inputPointer: '/quote', parameter: 'quotes' },
              ],
              fixedQuery: [{ parameter: 'providers', value: 'ECB' }],
            },
          },
        },
      },
    })
    if (result.kind === 'normalized') {
      expect(JSON.parse(result.draft.documentJson)).toMatchObject({
        inputSchema: {
          required: ['base', 'quote'],
          additionalProperties: false,
        },
      })
    }
  })
})

type NormalizedDocument = Readonly<{
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
}>

async function normalizedDocument(capabilityId: string): Promise<NormalizedDocument> {
  const entry = CURATED_PROVIDER_PUBLICATIONS.find(({ publication }) => (
    publication.kind === 'openapi_http' && publication.contract.capabilityId === capabilityId
  ))
  if (entry === undefined || entry.publication.kind !== 'openapi_http') {
    throw new Error(`curated_publication_missing:${capabilityId}`)
  }
  const result = await normalizeCapabilityPublication(entry.publication)
  if (result.kind !== 'normalized') throw new Error(`curated_publication_refused:${result.reason}`)
  return JSON.parse(result.draft.documentJson) as NormalizedDocument
}

function outputValid(document: NormalizedDocument, value: unknown): boolean {
  const validator = new Validator(structuredClone(document.outputSchema) as Schema, '2020-12', false)
  return validator.validate(value).valid
}

function inputValid(document: NormalizedDocument, value: unknown): boolean {
  const validator = new Validator(structuredClone(document.inputSchema) as Schema, '2020-12', false)
  return validator.validate(value).valid
}

describe('curated provider wire-shape contracts', () => {
  it('keeps observed OpenWeatherMap, Open-Meteo, and SerpAPI fields bounded', async () => {
    const openweather = await normalizedDocument('openweathermap.current-weather')
    expect(openweather.outputSchema).toMatchObject({
      type: 'object',
      properties: {
        base: { type: 'string' },
        main: { properties: { sea_level: { type: 'integer' }, grnd_level: { type: 'integer' } } },
        rain: { properties: { '1h': { type: 'number' } }, additionalProperties: false },
        sys: { properties: { type: { type: 'integer' }, id: { type: 'integer' }, country: { type: 'string' } } },
      },
      additionalProperties: false,
    })

    const forecast = await normalizedDocument('open-meteo.forecast')
    expect(forecast.outputSchema).toMatchObject({
      properties: {
        current_weather_units: {
          required: ['time', 'interval', 'temperature', 'windspeed', 'winddirection', 'weathercode', 'is_day'],
          additionalProperties: false,
        },
        current_weather: {
          properties: { interval: { type: 'integer' }, weathercode: { type: 'number' } },
          required: ['temperature', 'windspeed', 'winddirection', 'weathercode', 'is_day', 'time', 'interval'],
        },
      },
    })

    const serpapi = await normalizedDocument('serpapi.google-search')
    const serpapiProperties = serpapi.outputSchema.properties as Record<string, unknown>
    expect(serpapi.outputSchema).toMatchObject({ required: ['organic_results'] })
    expect(serpapiProperties.search_metadata).not.toHaveProperty('required')
    expect(serpapiProperties.search_parameters).not.toHaveProperty('required')
    expect(serpapiProperties.organic_results).toMatchObject({ items: { required: ['title', 'link'] } })
    const coingeckoDemo = await normalizedDocument('coingecko.simple-price-demo')
    expect(coingeckoDemo.inputSchema).toMatchObject({
      properties: {
        include_market_cap: { type: 'boolean' },
        include_24hr_vol: { type: 'boolean' },
        include_24hr_change: { type: 'boolean' },
        include_last_updated_at: { type: 'boolean' },
      },
      required: [],
      additionalProperties: false,
    })
    expect(coingeckoDemo.inputSchema.properties).not.toHaveProperty('ids')
    expect(coingeckoDemo.inputSchema.properties).not.toHaveProperty('vs_currencies')
    expect(coingeckoDemo.outputSchema).toMatchObject({
      required: ['bitcoin'],
      properties: {
        bitcoin: {
          required: ['usd'],
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    })
    const coingecko = await normalizedDocument('coingecko.simple-price')
    expect(coingecko.inputSchema).toMatchObject({
      properties: {
        ids: { type: 'string', pattern: '^[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*$' },
        vs_currencies: { type: 'string', pattern: '^[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*$' },
        include_24hr_change: { type: 'boolean' },
      },
      required: ['ids', 'vs_currencies'],
      additionalProperties: false,
    })
    expect(coingecko.inputSchema.properties).not.toHaveProperty('unknown')
    expect(coingecko.outputSchema).toMatchObject({
      type: 'object',
      minProperties: 1,
      additionalProperties: {
        type: 'object',
        minProperties: 1,
        additionalProperties: { type: 'number' },
      },
    })
    expect(coingecko.outputSchema).not.toHaveProperty('properties')
    expect(coingecko.outputSchema).not.toHaveProperty('required')
  })

  it('accepts representative provider payloads and rejects malformed known fields', async () => {
    const openweather = await normalizedDocument('openweathermap.current-weather')
    expect(outputValid(openweather, {
      coord: { lon: 10.99, lat: 44.34 },
      weather: [{ id: 501, main: 'Rain', description: 'moderate rain', icon: '10d' }],
      base: 'stations',
      main: {
        temp: 298.48,
        feels_like: 298.74,
        temp_min: 297.56,
        temp_max: 300.05,
        pressure: 1015,
        humidity: 64,
        sea_level: 1015,
        grnd_level: 933,
      },
      visibility: 10_000,
      wind: { speed: 0.62, deg: 349, gust: 1.18 },
      rain: { '1h': 3.16 },
      clouds: { all: 100 },
      dt: 1_661_870_592,
      sys: { type: 2, id: 2_075_663, country: 'IT', sunrise: 1_661_834_187, sunset: 1_661_882_248 },
      timezone: 7_200,
      id: 3_163_858,
      name: 'Zocca',
      cod: 200,
    })).toBe(true)
    expect(outputValid(openweather, {
      main: { temp: '298.48', feels_like: 298.74, pressure: 1015, humidity: 64 },
      cod: 200,
    })).toBe(false)

    const serpapi = await normalizedDocument('serpapi.google-search')
    expect(outputValid(serpapi, {
      search_metadata: { id: 'abc', status: 'Success', google_url: 'https://www.google.com/search?q=coffee' },
      search_parameters: { engine: 'google', q: 'coffee' },
      search_information: { total_results: 3_140_000_000 },
      organic_results: [{
        position: 1,
        title: 'Coffee',
        link: 'https://en.wikipedia.org/wiki/Coffee',
        displayed_link: 'https://en.wikipedia.org › wiki › Coffee',
        snippet: 'Coffee is a beverage.',
        snippet_highlighted_words: ['beverage'],
        source: 'Wikipedia',
      }],
    })).toBe(true)
    expect(outputValid(serpapi, {
      organic_results: [{ title: 'Coffee', link: 42 }],
    })).toBe(false)

    const coingecko = await normalizedDocument('coingecko.simple-price')
    expect(inputValid(coingecko, { ids: 'bitcoin', vs_currencies: 'usd' })).toBe(true)
    expect(inputValid(coingecko, { ids: 'ethereum', vs_currencies: 'usd' })).toBe(true)
    expect(inputValid(coingecko, { ids: 'bitcoin,ethereum', vs_currencies: 'usd', include_24hr_change: true })).toBe(true)
    expect(inputValid(coingecko, { ids: 'dogecoin', vs_currencies: 'eur' })).toBe(true)
    expect(inputValid(coingecko, { ids: 'bitcoin', vs_currencies: 'usd', include_24hr_change: false })).toBe(true)
    expect(inputValid(coingecko, { ids: 'bitcoin, ethereum', vs_currencies: 'usd' })).toBe(false)
    expect(inputValid(coingecko, { ids: 'bitcoin', vs_currencies: 'usd', extra: true })).toBe(false)
    expect(inputValid(coingecko, { ids: 'bitcoin' })).toBe(false)
    expect(inputValid(coingecko, { ids: '', vs_currencies: 'usd' })).toBe(false)
    expect(outputValid(coingecko, { bitcoin: { usd: 76_975, usd_24h_change: -1.4 } })).toBe(true)
    expect(outputValid(coingecko, { ethereum: { usd: 3_500 } })).toBe(true)
    expect(outputValid(coingecko, {
      bitcoin: { usd: 76_975 },
      ethereum: { usd: 3_500 },
    })).toBe(true)
    expect(outputValid(coingecko, { dogecoin: { eur: 0.2 } })).toBe(true)
    expect(outputValid(coingecko, { bitcoin: { usd: '76,975' } })).toBe(false)
    expect(outputValid(coingecko, { bitcoin: {} })).toBe(false)
    expect(outputValid(coingecko, { bitcoin: { usd: 76_975 }, ethereum: '3,500' })).toBe(false)
    expect(outputValid(coingecko, {})).toBe(false)
    const coingeckoDemo = await normalizedDocument('coingecko.simple-price-demo')
    expect(outputValid(coingeckoDemo, {
      bitcoin: {
        usd: 76_975,
        usd_market_cap: 1_520_000_000_000,
        usd_24h_vol: 31_200_000_000,
        usd_24h_change: -1.4,
        last_updated_at: 1_722_000_000,
      },
    })).toBe(true)
    expect(outputValid(coingeckoDemo, { prices: { bitcoin: { usd: 76_975 } } })).toBe(false)
    expect(outputValid(coingeckoDemo, { ethereum: { usd: 3_500 } })).toBe(false)
  })

  it('pins the keyed CoinGecko demo query to Bitcoin in USD', async () => {
    const entry = CURATED_PROVIDER_PUBLICATIONS.find(({ publication }) => (
      publication.kind === 'openapi_http' && publication.contract.capabilityId === 'coingecko.simple-price-demo'
    ))
    if (entry === undefined || entry.publication.kind !== 'openapi_http') {
      throw new Error('curated_publication_missing:coingecko.simple-price-demo')
    }
    const normalized = await normalizeCapabilityPublication(entry.publication)
    expect(normalized).toMatchObject({
      kind: 'normalized',
      draft: {
        binding: {
          adapter: {
            config: {
              method: 'GET',
              query: [
                { inputPointer: '/include_market_cap', parameter: 'include_market_cap' },
                { inputPointer: '/include_24hr_vol', parameter: 'include_24hr_vol' },
                { inputPointer: '/include_24hr_change', parameter: 'include_24hr_change' },
                { inputPointer: '/include_last_updated_at', parameter: 'include_last_updated_at' },
              ],
              fixedQuery: [
                { parameter: 'ids', value: 'bitcoin' },
                { parameter: 'vs_currencies', value: 'usd' },
              ],
            },
          },
        },
      },
    })
  })

  it('pins Mockster to cats and publishes an exact-count annotated HTTPS-link result', async () => {
    const cat = CURATED_PROVIDER_PUBLICATIONS.find(({ publication }) => (
      publication.kind === 'openapi_http'
      && publication.contract.capabilityId === 'mockster.cat-images'
    ))
    if (cat === undefined || cat.publication.kind !== 'openapi_http') {
      throw new Error('curated_publication_missing:mockster.cat-images')
    }
    expect(cat.publication.contract).toMatchObject({
      version: 1,
      customerAnnotations: [{
        document: 'output',
        pointer: '/0/url',
        label: 'Cat image link',
        role: 'completion_evidence',
        semanticIdentity: 'https-link',
      }],
    })
    const normalized = await normalizeCapabilityPublication(cat.publication)
    expect(normalized).toMatchObject({
      kind: 'normalized',
      draft: {
        binding: {
          adapter: {
            config: {
              method: 'GET',
              query: [{ inputPointer: '/count', parameter: 'count' }],
              fixedQuery: [{ parameter: 'category', value: 'cats' }],
            },
          },
        },
      },
    })
    const document = await normalizedDocument('mockster.cat-images')
    expect(inputValid(document, { count: 5 })).toBe(true)
    expect(inputValid(document, { count: 11 })).toBe(false)
    expect(outputValid(document, Array.from({ length: 5 }, (_, index) => ({
      name: `cats_${index + 1}.jpg`,
      url: `https://loremflickr.com/640/480/cats?lock=${index + 1}`,
    })))).toBe(true)
    expect(cat.publication.commercial.offering.offeringId).toContain(':v1')
    expect(cat.publication.commercial.bindingId).toContain(':v1')
  })

  it('removes ipify format from model input and pins the JSON wire request', async () => {
    const ipify = await normalizedDocument('ipify.public-ip')
    expect(ipify.inputSchema).toMatchObject({
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    })
    const ipifyEntry = CURATED_PROVIDER_PUBLICATIONS.find(({ publication }) => (
      publication.kind === 'openapi_http' && publication.contract.capabilityId === 'ipify.public-ip'
    ))
    if (ipifyEntry === undefined || ipifyEntry.publication.kind !== 'openapi_http') {
      throw new Error('curated_publication_missing:ipify.public-ip')
    }
    const normalized = await normalizeCapabilityPublication(ipifyEntry.publication)
    expect(normalized).toMatchObject({
      kind: 'normalized',
      draft: {
        binding: {
          adapter: {
            config: {
              method: 'GET',
              fixedQuery: [{ parameter: 'format', value: 'json' }],
            },
          },
        },
      },
    })
    if (normalized.kind === 'normalized') {
      expect(normalized.draft.binding.adapter.config).not.toHaveProperty('query')
    }
    if (normalized.kind === 'normalized') {
      const document = JSON.parse(normalized.draft.documentJson) as {
        description: string
        customerAnnotations: Array<{ pointer: string; label: string }>
      }
      expect(document.description).toContain('AE runtime server egress')
      expect(document.description).not.toContain('caller')
      expect(document.customerAnnotations).toContainEqual(
        expect.objectContaining({ pointer: '/ip', label: 'AE runtime public IP' }),
      )
    }
  })
})
