import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ list: vi.fn(), search: vi.fn() }))
vi.mock('@coinbase/cdp-sdk', () => ({ listX402DiscoveryResources: sdk.list, searchX402Resources: sdk.search }))
import { readX402Directory } from '@/modules/market/x402-directory.server'

const resources = Array.from({ length: 20 }, (_, index) => ({
  resource: `https://provider.test/resource/${index}`,
  type: index % 2 === 0 ? 'http' : 'mcp',
  x402Version: 2,
  description: `Resource ${index}`,
  accepts: [{ network: 'unfamiliar:network', scheme: 'unfamiliar-scheme', amount: '123', asset: 'asset-id' }],
}))

describe('native x402 directory browsing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows every native item, including unsupported protocols and payment schemes', async () => {
    sdk.list.mockResolvedValue({ items: resources, pagination: { limit: 20, offset: 20, total: 14445 } })
    const page = await readX402Directory({ offset: 20 })
    expect(sdk.list).toHaveBeenCalledExactlyOnceWith({ limit: 20, offset: 20 })
    expect(page).toMatchObject({ kind: 'ok', offset: 20, limit: 20, total: 14445, previousOffset: 0, nextOffset: 40 })
    if (page.kind !== 'ok') throw new Error('expected_directory')
    expect(page.items.map((item) => item.resource)).toEqual(resources.map((item) => item.resource))
    expect(page.items[1]).toMatchObject({ protocol: 'mcp', prices: [{ scheme: 'unfamiliar-scheme', network: 'unfamiliar:network' }] })
    expect(JSON.parse(page.items[1]!.metadataJson)).toEqual(resources[1])
  })

  it('preserves v1 payment requirements without assuming v2 amount fields', async () => {
    sdk.list.mockResolvedValue({ items: [{ ...resources[0], accepts: [{ scheme: 'exact', network: 'base', maxAmountRequired: '500', asset: 'legacy-asset' }] }], pagination: { limit: 20, offset: 0, total: 1 } })
    const page = await readX402Directory({})
    expect(page.kind === 'ok' && page.items[0]?.prices[0]?.amount).toBe('500 atomic units (legacy-asset)')
  })

  it.each(['base', 'eip155:8453'])('formats SDK-recognized assets on %s without an AE asset table', async (network) => {
    sdk.list.mockResolvedValue({ items: [{ ...resources[0], accepts: [{ scheme: 'exact', network, amount: '3000', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }] }], pagination: { limit: 20, offset: 0, total: 1 } })
    const page = await readX402Directory({})
    expect(page.kind === 'ok' && page.items[0]?.prices[0]?.amount).toBe('0.003000 USDC')
  })

  it('uses native semantic search and exposes partial results without paging or filtering', async () => {
    sdk.search.mockResolvedValue({ resources, partialResults: true })
    const page = await readX402Directory({ query: 'weather' })
    expect(sdk.search).toHaveBeenCalledExactlyOnceWith({ query: 'weather', limit: 20 })
    expect(page).toMatchObject({ kind: 'ok', partialResults: true, offset: 0, limit: 20 })
    expect(page).not.toHaveProperty('nextOffset')
    expect(page.kind === 'ok' && page.items.length).toBe(20)
  })

  it('uses the returned native position and stops at the source total', async () => {
    sdk.list.mockResolvedValue({ items: resources.slice(0, 5), pagination: { limit: 20, offset: 40, total: 45 } })
    const page = await readX402Directory({ offset: 41 })
    expect(sdk.list).toHaveBeenCalledExactlyOnceWith({ limit: 20, offset: 41 })
    expect(page).toMatchObject({ offset: 40, previousOffset: 20, total: 45 })
    expect(page).not.toHaveProperty('nextOffset')
  })

  it.each([{ query: 'email victim@example.com' }, { offset: -1 }, { query: 'weather', offset: 20 }])('rejects invalid or sensitive input before disclosure: %j', async (input) => {
    expect(await readX402Directory(input)).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(sdk.list).not.toHaveBeenCalled()
    expect(sdk.search).not.toHaveBeenCalled()
  })

  it('keeps an upstream failure distinct from an empty directory', async () => {
    sdk.list.mockRejectedValueOnce(new Error('upstream'))
    expect(await readX402Directory({})).toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
    sdk.list.mockResolvedValueOnce({ items: [], pagination: { offset: 0, limit: 20, total: 0 } })
    expect(await readX402Directory({})).toEqual({ kind: 'ok', items: [], offset: 0, limit: 20, total: 0, mode: 'browse', appliedFilters: {} })
  })

  it('sends combined filters to SDK search across the full source and preserves filter context', async () => {
    sdk.search.mockResolvedValue({ resources, partialResults: true })
    const page = await readX402Directory({ query: 'weather', network: 'eip155:8453', provider: ' API.Example.COM ', maxUsdPrice: 0.0000001 })
    expect(sdk.search).toHaveBeenCalledExactlyOnceWith({ query: 'weather', network: 'eip155:8453', urlSubstring: '://api.example.com/', maxUsdPrice: '0.0000001', limit: 20 })
    expect(sdk.list).not.toHaveBeenCalled()
    expect(page).toMatchObject({ mode: 'search', partialResults: true, appliedFilters: { network: 'eip155:8453', provider: 'api.example.com', maxUsdPrice: 0.0000001 } })
    // Results remain the source's whole returned page, not a locally ranked or filtered subset.
    expect(page.kind === 'ok' && page.items.length).toBe(20)
    expect(page).not.toHaveProperty('nextOffset')
    expect(page).not.toHaveProperty('total')
  })

  it('uses upstream search for a filter alone, including a zero maximum', async () => {
    sdk.search.mockResolvedValue({ resources: [], partialResults: false })
    await readX402Directory({ maxUsdPrice: 0 })
    expect(sdk.search).toHaveBeenCalledExactlyOnceWith({ maxUsdPrice: '0', limit: 20 })
    expect(sdk.list).not.toHaveBeenCalled()
  })

  it.each([
    { network: 'base&query=private' }, { network: 'x'.repeat(101) },
    { provider: 'user:password@example.com' }, { provider: 'https://example.com' },
    { provider: 'example.com/path' }, { provider: 'example.com?query=private' },
    { provider: 'example.com\\@other.test' }, { provider: 'examp\nle.com' },
    { maxUsdPrice: -1 }, { maxUsdPrice: Infinity }, { maxUsdPrice: Number.NaN },
    { maxUsdPrice: Number.MAX_SAFE_INTEGER + 1 }, { network: 'base', offset: 20 },
  ])('rejects invalid filters before requesting source data: %j', async (input) => {
    expect(await readX402Directory(input)).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(sdk.list).not.toHaveBeenCalled()
    expect(sdk.search).not.toHaveBeenCalled()
  })

  it('projects named inputs, output, network and directory activity only from declared facts', async () => {
    sdk.list.mockResolvedValue({ items: [{
      resource: 'https://api.example.com/weather', type: 'http', description: 'Retrieve up-to-date weather data.',
      accepts: [{ network: 'eip155:8453', scheme: 'exact', amount: '3000', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }],
      lastUpdated: '2026-09-08T06:00:00.000Z', tags: ['weather'],
      quality: { l30DaysTotalCalls: 12, l30DaysUniquePayers: 4 },
      extensions: { bazaar: {
        info: { input: { method: 'GET' }, output: { type: 'json' } },
        schema: { properties: {
          input: { properties: { queryParams: { properties: { city: { type: 'string' }, unit: { type: 'string' } }, required: ['city'] } } },
          output: { properties: { example: { type: 'object', description: 'A forecast with hourly temperatures.' } } },
        } },
      } },
    }], pagination: { offset: 0, limit: 20, total: 1 } })
    const page = await readX402Directory({})
    expect(page.kind === 'ok' && page.items[0]).toMatchObject({
      title: 'Retrieve up-to-date weather data.', provider: 'api.example.com', methodLabel: 'HTTP GET',
      schemaSummary: 'Inputs: city (required), unit', outputSummary: 'A forecast with hourly temperatures.',
      prices: [{ network: 'eip155:8453', networkLabel: 'Base', amount: '0.003000 USDC' }],
      activity: { calls30d: 12, payers30d: 4 },
      provenance: { directory: 'Coinbase Bazaar', metadata: 'provider_declared', updatedAt: '2026-09-08T06:00:00.000Z' },
    })
  })

  it('keeps sparse and malformed metadata visible without invented ratings, methods or suitability', async () => {
    sdk.list.mockResolvedValue({ items: [{
      resource: 'opaque-resource', type: 'mcp', serviceName: { malicious: true }, description: 42,
      accepts: [null, { network: 'base', scheme: 'exact', amount: 'not-money' }],
      quality: { l30DaysTotalCalls: -1, l30DaysUniquePayers: '500 stars' },
      extensions: { bazaar: { info: { input: { method: { injected: true } } } } },
      tags: [1, null, 'real tag'],
    }], pagination: { offset: 0, limit: 20, total: 1 } })
    const page = await readX402Directory({})
    if (page.kind !== 'ok') throw new Error('expected visible listing')
    expect(page.items[0]).toMatchObject({ resource: 'opaque-resource', title: 'Service listing', description: 'The provider has not supplied a description.', tags: ['real tag'], prices: [{ amount: 'Price not supplied' }] })
    expect(page.items[0]).not.toHaveProperty('activity')
    expect(page.items[0]).not.toHaveProperty('method')
    expect(page.items[0]).not.toHaveProperty('rating')
    expect(page.items[0]).not.toHaveProperty('location')
  })

})

describe('rich provider-declared contracts', () => {
  async function project(extra: Record<string, unknown>) {
    sdk.list.mockResolvedValue({ items: [{ ...resources[0], ...extra }], pagination: { offset: 0, limit: 20, total: 1 } })
    const page = await readX402Directory({})
    if (page.kind !== 'ok' || page.items[0] === undefined) throw new Error('expected visible Tool')
    return page.items[0]
  }
  it('projects service icons, tag/category evidence and complete structured input/output examples', async () => {
    const body = { properties: { prompt: { type: 'string', description: 'Describe the image', maxLength: 1000 }, size: { type: 'string', enum: ['square', 'wide'], default: 'square' } }, required: ['prompt'] }
    const inputSchema = { type: 'object', properties: { body, pathParams: { properties: { model: { type: 'string' } }, required: ['model'] } } }
    const example = { type: 'http', method: 'POST', bodyType: 'json', body: { prompt: 'A red apple', size: 'wide' }, pathParams: { model: 'image-model' } }
    const outputSchema = { type: 'object', properties: { images: { type: 'array', items: { type: 'object', properties: { url: { type: ['string', 'null'] } } } } } }
    const outputExample = { images: [{ url: null }] }
    const result = await project({ serviceName: 'Image generation', iconUrl: 'https://res.cloudinary.com/bazaar/icon.png', skillUrl: 'https://skills.example.com/image/SKILL.md', tags: ['image'], extensions: { bazaar: { category: 'creative', tags: ['image', 'generation'], info: { input: example, output: { type: 'json', example: outputExample } }, schema: { properties: { input: inputSchema, output: { properties: { example: outputSchema } } } } } } })
    expect(result).toMatchObject({ serviceName: 'Image generation', iconUrl: 'https://res.cloudinary.com/bazaar/icon.png', category: 'creative', tags: ['image', 'generation'], provider: 'provider.test' })
    expect(result.input?.fields).toContainEqual(expect.objectContaining({ name: 'prompt', location: 'body', type: 'string', required: true, description: 'Describe the image', constraints: ['maxLength: 1000'], exampleJson: '"A red apple"' }))
    expect(result.input?.fields).toContainEqual(expect.objectContaining({ name: 'size', required: false, defaultJson: '"square"', enumValues: ['"square"', '"wide"'] }))
    expect(result.input?.fields).toContainEqual(expect.objectContaining({ name: 'model', location: 'pathParams', required: true }))
    expect(JSON.parse(result.input!.schemaJson!)).toEqual(inputSchema)
    expect(JSON.parse(result.input!.exampleJson!)).toEqual(example)
    expect(JSON.parse(result.output!.exampleJson!)).toEqual(outputExample)
    expect(result.output?.fields).toContainEqual(expect.objectContaining({ path: 'images[].url', type: 'string | null', exampleJson: 'null' }))
  })
  it('retains example-only facts without fabricating required fields or JSON schemas', async () => {
    const result = await project({ extensions: { bazaar: { info: { input: { method: 'GET', queryParams: { city: 'Perth' } }, output: { type: 'json', example: { temperature: 22 } } } } } })
    expect(result.input?.fields).toEqual([{ name: 'city', path: 'city', location: 'queryParams', source: 'example', exampleJson: '"Perth"' }])
    expect(result.input).not.toHaveProperty('schemaJson')
    expect(result.output?.fields[0]).toMatchObject({ name: 'temperature', source: 'example' })
    expect(result.output?.fields[0]).not.toHaveProperty('required')
  })
  it('omits oversized JSON explicitly, bounds field projection and preserves complete raw source', async () => {
    const example = { payload: 'x'.repeat(17000) }
    const schema = { properties: Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`field${i}`, { type: 'string', description: 'x'.repeat(500) }])) }
    const result = await project({ extensions: { bazaar: { info: { output: { example } }, schema: { properties: { output: { properties: { example: schema } } } } } } })
    expect(result.output).toMatchObject({ schemaOmitted: true, exampleOmitted: true, fieldsTruncated: true })
    expect(result.output?.fields).toHaveLength(64)
    expect(result.output).not.toHaveProperty('schemaJson')
    expect(result.output).not.toHaveProperty('exampleJson')
    expect(JSON.parse(result.metadataJson).extensions.bazaar.info.output.example).toEqual(example)
  })
  it.each(['javascript:alert(1)', 'data:image/svg+xml,hello', 'https://user:password@example.com/logo', 'https://example.com/\nlogo'])('does not project an unsafe declared icon or skill link: %s', async url => {
    const result = await project({ iconUrl: url, skillUrl: url })
    expect(result).not.toHaveProperty('iconUrl')
    expect(result).not.toHaveProperty('skillUrl')
  })
  it('formats exact token decimals without asserting a USD conversion', async () => {
    const result = await project({ accepts: [{ network: 'eip155:8453', scheme: 'exact', amount: '9007199254740991000001', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }] })
    expect(result.prices[0]).toMatchObject({ symbol: 'USDC', decimalAmount: '9007199254740991.000001' })
    expect(result.prices[0]).not.toHaveProperty('usdPrice')
    expect(result.prices[0]).not.toHaveProperty('numericAmount')
  })
  it('uses maintained v1 discovery extraction and preserves output schema when available', async () => {
    const outputSchema = { input: { type: 'http', method: 'GET', query_params: { city: 'Perth' } }, output: { forecast: 'sunny' } }
    const result = await project({ accepts: [{ network: 'base', scheme: 'exact', maxAmountRequired: '500', asset: 'unknown', outputSchema }] })
    expect(result.method).toBe('GET')
    expect(result.input?.fields).toContainEqual(expect.objectContaining({ name: 'city', location: 'queryParams', source: 'example' }))
    expect(JSON.parse(result.output!.exampleJson!)).toEqual({ forecast: 'sunny' })
    expect(result.output).not.toHaveProperty('schemaJson')
    const schema = { type: 'object', properties: { forecast: { type: 'string' } } }
    const schemaResult = await project({ accepts: [{ network: 'base', scheme: 'exact', outputSchema: schema }] })
    expect(JSON.parse(schemaResult.output!.schemaJson!)).toEqual(schema)
  })
})

describe('functional Tool labels and network facts', () => {
  it('keeps umbrella service identity separate from explicit jobs and concise description titles', async () => {
    sdk.list.mockResolvedValue({ items: [
      { ...resources[0], serviceName: 'StableEnrich', title: 'Exa search', description: 'Search the web. Returns sources and snippets.' },
      { ...resources[0], serviceName: 'StableEnrich', description: 'Retrieve company records; includes declared business fields.' },
      { ...resources[0], serviceName: 'StableEnrich', description: 'Find references '.repeat(40) },
    ], pagination: { offset: 0, limit: 20 } })
    const page = await readX402Directory({})
    if (page.kind !== 'ok') throw new Error('expected_tools')
    expect(page.items[0]).toMatchObject({ title: 'Exa search', serviceName: 'StableEnrich', description: 'Search the web. Returns sources and snippets.' })
    expect(page.items[1]).toMatchObject({ title: 'Retrieve company records', serviceName: 'StableEnrich' })
    expect(page.items[2]!.title.length).toBeLessThanOrEqual(100)
    expect(page.items[2]!.title.endsWith('…')).toBe(true)
  })
  it('labels known Solana networks without guessing an unknown token denomination', async () => {
    sdk.list.mockResolvedValue({ items: [{ ...resources[0], accepts: [{ network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', asset: 'unknown-mint', amount: '20000', scheme: 'exact' }] }], pagination: { offset: 0, limit: 20 } })
    const page = await readX402Directory({})
    if (page.kind !== 'ok') throw new Error('expected_tools')
    expect(page.items[0]?.prices[0]).toMatchObject({ networkLabel: 'Solana', amount: '20000 atomic units (unknown-mint)' })
    expect(page.items[0]?.prices[0]?.symbol).toBeUndefined()
    expect(page.items[0]?.prices[0]?.decimalAmount).toBeUndefined()
  })
})
