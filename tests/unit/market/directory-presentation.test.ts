import { afterEach, expect, it, vi } from 'vitest'
import { x402DirectoryFunctionalTitle } from '@/modules/market/x402-directory-title'
import { directoryNetworkLabel, directoryPrice, directoryPriceContext, directoryTitle } from '@/components/ae/market/directory-presentation'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { getFunctionName } from 'convex/server'
import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { readX402DirectoryCatalogue } from '@/modules/market/x402-directory-index.server'
import * as decisionEngine from '@/modules/decision-engine/public'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import { currentDirectoryChoice } from '../../../convex/lib/market/directoryIndex/choices'
import { toolRecord } from '../../../convex/lib/capabilitySupply/tool/projection'
import { registryToolsSearchAction } from '@/modules/registry/tools.actions'
import { toolCatalogSearchInputSchema } from '@/modules/registry/tool-choice-contracts'

vi.mock('../../../convex/lib/capabilitySupply/tool/projection', () => ({ toolRecord: vi.fn() }))

afterEach(() => {
  setPublicSourceTransportForTests(undefined)
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
const entry: X402DirectoryEntry = { resource: 'https://example.com/exa', provider: 'example.com', title: 'StableEnrich', serviceName: 'StableEnrich', description: 'Search with Exa; returns matching documents.', protocol: 'http', prices: [], metadataJson: '{}' }
it('repairs stale umbrella titles from the declared job while preserving explicit operation titles', () => {
  expect(directoryTitle(entry)).toBe('Search with Exa')
  expect(directoryTitle({ ...entry, title: 'Find companies' })).toBe('Find companies')
  expect(directoryTitle({ ...entry, description: 'The provider has not supplied a description.' })).toBe('StableEnrich')
  expect(directoryTitle({ ...entry, description: 'Search '.repeat(80) }).length).toBeLessThanOrEqual(100)
  expect(entry.title).toBe('StableEnrich')
  expect(entry.description).toBe('Search with Exa; returns matching documents.')
})
it('keeps exact known denominations and defers unknown atomic amounts to payment details', () => {
  const unknown = { ...entry, prices: [{ network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', scheme: 'exact', amount: '20000 atomic units (unknown-mint)' }] }
  expect(directoryPrice(unknown)).toBe('See payment details')
  expect(directoryNetworkLabel(unknown)).toBe('Solana')
  expect(unknown.prices[0]?.amount).toBe('20000 atomic units (unknown-mint)')
  const priced = { ...entry, prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.02 USDC', decimalAmount: '0.020000', symbol: 'USDC' }] }
  expect(directoryPrice(priced)).toMatch(/AUD.*unavailable/i)
  expect(directoryPrice(priced)).not.toContain('USDC')
  expect(directoryPriceContext(priced)).toMatch(/Provider.*0\.02 USDC/)
  expect(directoryPrice(entry)).toBe('Price on request')
})

it('labels directory prices as Provider evidence before AE admission', () => {
  expect(directoryPriceContext({ ...entry, prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.02 USDC' }] })).toMatch(/Provider.*0\.02 USDC/)
  expect(directoryPriceContext({
    ...entry,
    prices: [
      { network: 'eip155:8453', scheme: 'exact', amount: '0.02 USDC' },
      { network: 'solana:mainnet', scheme: 'exact', amount: '0.02 USDC' },
    ],
  })).toMatch(/2 Provider payment options.*0\.02 USDC/)
})

it('skips empty declared titles before selecting a useful source description', () => {
  expect(x402DirectoryFunctionalTitle({ explicitTitle: ' \u0000 ', description: 'Search companies; returns business records.', serviceName: 'Umbrella', fallback: 'Service' })).toBe('Search companies')
})

it('uses spaced ASCII dashes as description clauses while preserving hyphenated words', () => {
  expect(x402DirectoryFunctionalTitle({ description: 'Exa Search - Neural search across the web', fallback: 'Service' })).toBe('Exa Search')
  expect(x402DirectoryFunctionalTitle({ description: 'Higher-fidelity text-to-image over x402 - OpenAI images wire format', fallback: 'Service' })).toBe('Higher-fidelity text-to-image over x402')
})
it('truncates long labels at complete words without clipping an amount or token', () => {
  const beginning = `${'Published source '.repeat(5)}price `
  const title = x402DirectoryFunctionalTitle({ description: `${beginning}$0.000000000000000001 per response`, fallback: 'Service' })
  expect(title).toBe(`${beginning.trimEnd()}…`)
  expect(title).not.toContain('$0.')
  expect(title.length).toBeLessThanOrEqual(100)
})

it('skips a price-only description prefix without changing explicit titles or price-bearing prose', () => {
  const description = '$0.001/page. Extract every embedded image from a PDF as PNGs. 1¢ x402 min; remainder auto-credits — relaystation.ai/penny'
  expect(x402DirectoryFunctionalTitle({ description, serviceName: 'Relaystation Images', fallback: 'Service' })).toBe('Extract every embedded image from a PDF as PNGs.')
  expect(x402DirectoryFunctionalTitle({ description: '$0.001/page.', serviceName: 'Relaystation Images', fallback: 'Service' })).toBe('Relaystation Images')
  expect(x402DirectoryFunctionalTitle({ description: '$0.001/page.', fallback: 'Service' })).toBe('Service')
  expect(x402DirectoryFunctionalTitle({ explicitTitle: '$0.001/page.', description, fallback: 'Service' })).toBe('$0.001/page.')
  expect(x402DirectoryFunctionalTitle({ description: 'Extract images for $0.001/page.', fallback: 'Service' })).toBe('Extract images for $0.001/page.')
})

it('shares one fresh Coinbase observation across priced rows, retaining exact source and admitted identity', async () => {
  const ref = `operation:v1:${'a'.repeat(64)}`
  const rows = [
    { ...entry, resource: 'https://example.com/tiny', prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.001 USDC', decimalAmount: '0.001000', symbol: 'USDC' }], choice: { access: 'ae_callable' as const, toolRef: ref, sourceRouteRef: 'coinbase:tiny' } },
    { ...entry, resource: 'https://example.com/larger', prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '1 USDC', decimalAmount: '1.000000', symbol: 'USDC' }], choice: { access: 'external_listing' as const } },
    { ...entry, resource: 'https://example.com/zero', prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0 USDC', decimalAmount: '0.000000', symbol: 'USDC' }], choice: { access: 'external_listing' as const } },
    { ...entry, resource: 'https://example.com/options', prices: [
      { network: 'solana:mainnet', scheme: 'exact', amount: '500 atomic units (unknown-mint)' },
      { network: 'eip155:8453', scheme: 'exact', amount: '0.001 USDC', decimalAmount: '0.001000', symbol: 'USDC' },
    ], choice: { access: 'external_listing' as const } },
  ]
  const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { currency: 'USDC', rates: { AUD: '1.239' } } }), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  const query = vi.fn(async (reference: unknown) => {
    expect(getFunctionName(reference as never)).toBe('x402DirectoryIndex:browse')
    return { kind: 'ok', coverage: { generation: 'g1' }, searchMethod: 'native_index', page: rows.map(entry => ({ entry, choice: entry.choice })), continueCursor: '', isDone: true }
  })
  setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() } as never)
  const result = await readX402DirectoryCatalogue({})
  expect(result.kind).toBe('ok')
  if (result.kind !== 'ok' || result.page.kind !== 'ok') return
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(query).toHaveBeenCalledTimes(1)
  const [tiny, larger, zero, options] = result.page.items.map(toDirectoryToolCardModel)
  expect(tiny).toMatchObject({ priceLabel: 'A$0.01', priceContext: 'Indicative before Quote · Provider lists 0.001 USDC per Call', access: 'ae_callable', toolRef: ref, sourceRouteRef: 'coinbase:tiny' })
  expect(larger).toMatchObject({ priceLabel: 'A$1.24', priceContext: 'Provider-listed estimate · Provider lists 1 USDC per Call', access: 'external_listing' })
  expect(zero).toMatchObject({ priceLabel: 'A$0.00', priceContext: 'Provider-listed estimate · Provider lists 0 USDC per Call' })
  expect(options).toMatchObject({ priceLabel: 'A$0.01', priceContext: 'Provider-listed estimate · 2 Provider payment options · source 0.001 USDC' })
  expect(larger?.toolRef).toBeUndefined()
})

it('keeps AUD unavailable on Coinbase failure without replacing exact source USDC', async () => {
  const fetch = vi.fn(async () => new Response('unavailable', { status: 503 }))
  vi.stubGlobal('fetch', fetch)
  const priced = { ...entry, prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.02 USDC', decimalAmount: '0.020000', symbol: 'USDC' }] }
  setPublicSourceTransportForTests({
    query: vi.fn(async () => ({ kind: 'ok', coverage: { generation: 'g1' }, searchMethod: 'native_index', page: [{ entry: priced }], continueCursor: '', isDone: true })),
    mutation: vi.fn(), action: vi.fn(),
  } as never)
  const result = await readX402DirectoryCatalogue({})
  expect(result.kind).toBe('ok')
  if (result.kind !== 'ok' || result.page.kind !== 'ok') return
  const [model] = result.page.items.map(toDirectoryToolCardModel)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(model).toMatchObject({ priceLabel: 'AUD estimate temporarily unavailable', priceContext: 'Provider lists 0.02 USDC per Call', access: 'external_listing' })
})

it('does not turn publication identity into callability after readiness expires or the publication withdraws', async () => {
  const now = Date.now()
  const toolRef = `operation:v1:${'b'.repeat(64)}`
  let publication: { toolRef: string } | null = { toolRef }
  const unique = vi.fn(async () => publication)
  const eq = vi.fn(() => ({ eq }))
  const ctx = { db: { query: vi.fn((table: string) => {
    expect(table).toBe('capabilityPublications')
    return { withIndex: vi.fn((_index: string, select: (query: { eq: typeof eq }) => unknown) => {
      select({ eq })
      return { unique }
    }) }
  }) } } as never
  vi.mocked(toolRecord).mockResolvedValue({ routeable: true, integrated: true, readiness: { validUntil: now + 60_000 } } as never)
  expect(await currentDirectoryChoice(ctx, 'exact-source', now)).toEqual({ access: 'ae_callable', toolRef, sourceRouteRef: 'exact-source' })
  vi.mocked(toolRecord).mockResolvedValue({ routeable: true, integrated: true, readiness: { validUntil: now - 1 } } as never)
  expect(await currentDirectoryChoice(ctx, 'exact-source', now)).toMatchObject({ access: 'setup_required', toolRef })
  publication = null
  expect(await currentDirectoryChoice(ctx, 'exact-source', now)).toEqual({ access: 'external_listing', sourceRouteRef: 'exact-source' })
  expect(toolRecord).toHaveBeenCalledTimes(2)
  expect(eq).toHaveBeenCalledWith('sourceRouteRef', 'exact-source')
  expect(eq).toHaveBeenCalledWith('disposition', 'current')
})


it('reorders bounded catalogue candidates without losing their exact joined ToolRefs', async () => {
  const ref = `operation:v1:${'d'.repeat(64)}`
  vi.stubEnv('TYPESAFE_API_KEY', 'local-test-key')
  vi.spyOn(decisionEngine, 'callJevSystemOne').mockResolvedValue({
    answers: { match_0: { type: 'noul', noul: 0.1 }, match_1: { type: 'noul', noul: 0.9 } },
  } as never)
  setPublicSourceTransportForTests({
    query: vi.fn(async () => ({
      kind: 'ok', coverage: { generation: 'g1' }, searchMethod: 'native_full_text',
      page: [{ entry }, { entry: { ...entry, resource: 'https://example.com/second' },
        choice: { access: 'ae_callable', toolRef: ref, sourceRouteRef: 'exact-second' } }],
      continueCursor: '', isDone: true,
    })),
    mutation: vi.fn(), action: vi.fn(),
  } as never)
  const result = await readX402DirectoryCatalogue({ query: 'convert time' })
  expect(result.kind).toBe('ok')
  if (result.kind !== 'ok' || result.page.kind !== 'ok') return
  expect(result.page.items.map(item => item.resource)).toEqual(['https://example.com/second', entry.resource])
  expect(result.page.items[0]?.choice).toEqual({ access: 'ae_callable', toolRef: ref, sourceRouteRef: 'exact-second' })
  expect(result.page.items[1]?.choice?.access).toBe('external_listing')
})

it('returns priced admitted and external Bazaar search rows with one FX request', async () => {
  const now = Date.now()
  const toolRef = `operation:v1:${'e'.repeat(64)}`
  const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { currency: 'USDC', rates: { AUD: '1.239' } } }), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  const query = vi.fn(async (ref: unknown) => {
    switch (getFunctionName(ref as never)) {
      case 'capabilitySupplyProjection:latestReconcileBusinessSupplyProjectionsCompletion': return now
      case 'x402DirectoryIndex:status': return { kind: 'ready', refreshState: 'complete', coverage: { generation: 'g1', completedAt: now } }
      case 'x402DirectoryIndex:searchCompact': return {
        kind: 'ok', coverage: { generation: 'g1', completedAt: now }, isDone: true, continueCursor: '',
        page: [
          { id: 'bazaar-admitted', source: 'coinbase', title: 'Time converter', summary: 'Convert time', provider: 'Example',
            actionClass: 'transform', objectClass: 'location', completedAt: now, minimumUsdPrice: '0.001000',
            sourceRouteRef: 'exact-admitted', choice: { access: 'ae_callable', toolRef, sourceRouteRef: 'exact-admitted' } },
          { id: 'bazaar-external', source: 'coinbase', title: 'Time zone', summary: 'Lookup timezone', provider: 'Example',
            actionClass: 'retrieve', objectClass: 'location', completedAt: now, minimumUsdPrice: '1.000000',
            choice: { access: 'external_listing' } },
          { id: 'bazaar-setup', source: 'coinbase', title: 'Time setup', summary: 'Needs connection', provider: 'Example',
            actionClass: 'retrieve', objectClass: 'location', completedAt: now,
            choice: { access: 'setup_required', toolRef, sourceRouteRef: 'exact-setup' } },
          { id: 'bazaar-old-join', source: 'coinbase', title: 'Legacy time', summary: 'Old publication join', provider: 'Example',
            actionClass: 'retrieve', objectClass: 'location', completedAt: now, toolRef },
        ],
      }
      default: throw new Error(`Unexpected query ${getFunctionName(ref as never)}`)
    }
  })
  setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() } as never)
  const result = await registryToolsSearchAction.run({
    data: toolCatalogSearchInputSchema.parse({ query: 'time', source: 'coinbase', limit: 8 }),
    context: { caller: 'ui' },
  })
  expect(result.results.map(row => [row.access, row.price])).toEqual([
    ['ae_callable', { kind: 'indicative', label: 'A$0.01' }],
    ['external_listing', { kind: 'indicative', label: 'A$1.24' }],
    ['setup_required', { kind: 'unavailable' }],
    ['external_listing', { kind: 'unavailable' }],
  ])
  expect(result.results[0]).toMatchObject({ toolRef, sourceRouteRef: 'exact-admitted', sourcePrice: '0.001000 USDC' })
  expect(result.results[1]?.toolRef).toBeUndefined()
  expect(result.results[2]).toMatchObject({ toolRef, readiness: 'unverified', next: [{ action: 'describe', args: { toolRef } }] })
  expect(result.results[3]?.toolRef).toBeUndefined()
  expect(result.results[3]?.next).toMatchObject([{ action: 'describe-external' }])
  expect(fetch).toHaveBeenCalledTimes(1)
})
