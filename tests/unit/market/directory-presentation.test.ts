import { beforeEach, afterEach, expect, it, vi } from 'vitest'
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

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production'))
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
it('shows recognised prices in USD without a fresh AUD estimate and omits unknown prices', () => {
  const unknown = { ...entry, prices: [{ network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', scheme: 'exact', amount: '20000 atomic units (unknown-mint)' }] }
  expect(directoryPrice(unknown)).toBe('')
  expect(directoryNetworkLabel(unknown)).toBe('Solana')
  expect(unknown.prices[0]?.amount).toBe('20000 atomic units (unknown-mint)')
  const priced = { ...entry, prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.02 USDC', decimalAmount: '0.020000', symbol: 'USDC' }] }
  expect(directoryPrice(priced)).toBe('US$0.02')
  expect(directoryPriceContext(priced)).toMatch(/Provider.*0\.02 USDC/)
  expect(directoryPrice(entry)).toBe('')
})

it('labels directory prices as Provider evidence before AE admission', () => {
  expect(directoryPriceContext({ ...entry, prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.02 USDC', decimalAmount: '0.02', symbol: 'USDC' }] })).toMatch(/Provider.*0\.02 USDC/)
  expect(directoryPriceContext({
    ...entry,
    prices: [
      { network: 'eip155:8453', scheme: 'exact', amount: '0.02 USDC', decimalAmount: '0.02', symbol: 'USDC' },
      { network: 'solana:mainnet', scheme: 'exact', amount: '0.02 USDC', decimalAmount: '0.02', symbol: 'USDC' },
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

it('shares one persisted Coinbase observation across priced rows, including upto maxima', async () => {
  const ref = `operation:v1:${'a'.repeat(64)}`
  const rows = [
    { ...entry, resource: 'https://example.com/tiny', prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.001 USDC', decimalAmount: '0.001', symbol: 'USDC' }], choice: { access: 'ae_callable' as const, toolRef: ref, sourceRouteRef: 'coinbase:tiny' } },
    { ...entry, resource: 'https://example.com/larger', prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '1 USDC', decimalAmount: '1', symbol: 'USDC' }], choice: { access: 'external_listing' as const } },
    { ...entry, resource: 'https://example.com/zero', prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0 USDC', decimalAmount: '0', symbol: 'USDC' }], choice: { access: 'external_listing' as const } },
    { ...entry, resource: 'https://example.com/options', prices: [
      { network: 'solana:mainnet', scheme: 'exact', amount: '500 atomic units (unknown-mint)' },
      { network: 'eip155:8453', scheme: 'exact', amount: '0.001 USDC', decimalAmount: '0.001', symbol: 'USDC' },
    ], choice: { access: 'external_listing' as const } },
    { ...entry, resource: 'https://example.com/capped', prices: [{ network: 'eip155:8453', scheme: 'upto', amount: '0.03 USDC', decimalAmount: '0.03', symbol: 'USDC' }], choice: { access: 'external_listing' as const } },
  ]
  const query = vi.fn(async (reference: unknown) => {
    if (getFunctionName(reference as never) === 'referenceRateRefresh:current') {
      return { source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.239', fetchedAt: Date.now() }
    }
    expect(getFunctionName(reference as never)).toBe('x402DirectoryIndex:browse')
    return { kind: 'ok', coverage: { generation: 'g1' }, searchMethod: 'native_index', page: rows.map(entry => ({ entry, choice: entry.choice })), continueCursor: '', isDone: true }
  })
  vi.stubEnv('OPENROUTER_API_KEY', 'blocked')
  const blocked = vi.fn(async () => { throw new Error('coinbase and openrouter blocked') })
  vi.stubGlobal('fetch', blocked)
  setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() } as never)
  const result = await readX402DirectoryCatalogue({})
  expect(result.kind).toBe('ok')
  if (result.kind !== 'ok' || result.page.kind !== 'ok') return
  expect(blocked).not.toHaveBeenCalled()
  expect(query).toHaveBeenCalledTimes(2)
  expect(query.mock.calls.map(([reference]) => getFunctionName(reference as never))).toContain('referenceRateRefresh:current')
  const [tiny, larger, zero, options, capped] = result.page.items.map(toDirectoryToolCardModel)
  expect(tiny).toMatchObject({ priceLabel: 'A$0.01', priceContext: 'Indicative before Quote · Provider lists 0.001 USDC per Call', access: 'ae_callable', toolRef: ref, sourceRouteRef: 'coinbase:tiny' })
  expect(larger).toMatchObject({ priceLabel: 'A$1.24', priceContext: 'Provider-listed estimate · Provider lists 1 USDC per Call', access: 'external_listing' })
  expect(zero).toMatchObject({ priceLabel: 'A$0.00', priceContext: 'Provider-listed estimate · Provider lists 0 USDC per Call' })
  expect(options).toMatchObject({ priceLabel: 'A$0.01', priceContext: 'Provider-listed estimate · Provider lists 0.001 USDC per Call' })
  expect(capped).toMatchObject({ priceLabel: 'up to A$0.04', priceContext: 'Provider-listed estimate · Provider lists up to 0.03 USDC per Call' })
  expect(larger?.toolRef).toBeUndefined()
})

it('shows a concrete USD price when no persisted AUD rate is available', async () => {
  const priced = { ...entry, prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.02 USDC', decimalAmount: '0.02', symbol: 'USDC' }] }
  const query = vi.fn(async (reference: unknown) => getFunctionName(reference as never) === 'referenceRateRefresh:current'
    ? null
    : { kind: 'ok', coverage: { generation: 'g1' }, searchMethod: 'native_index', page: [{ entry: priced }], continueCursor: '', isDone: true })
  setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() } as never)
  const result = await readX402DirectoryCatalogue({})
  expect(result.kind).toBe('ok')
  if (result.kind !== 'ok' || result.page.kind !== 'ok') return
  const [model] = result.page.items.map(toDirectoryToolCardModel)
  expect(query).toHaveBeenCalledTimes(2)
  expect(model).toMatchObject({ priceLabel: 'US$0.02', priceContext: 'Provider lists 0.02 USDC per Call', access: 'external_listing' })
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
      return { filter: vi.fn(() => ({ unique })) }
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


it('keeps indexed catalogue order and joined ToolRefs without calling Jev', async () => {
  const ref = `operation:v1:${'d'.repeat(64)}`
  vi.stubEnv('OPENROUTER_API_KEY', 'local-test-key')
  const blocked = vi.fn(async () => { throw new Error('openrouter blocked') })
  vi.stubGlobal('fetch', blocked)
  vi.spyOn(decisionEngine, 'callJevSystemOne').mockResolvedValue({
    answers: { match_0: { type: 'noul', noul: 0.1 }, match_1: { type: 'noul', noul: 0.9 } },
  } as never)
  setPublicSourceTransportForTests({
    query: vi.fn(async () => ({
      kind: 'ok', coverage: { generation: 'g1', completedAt: Date.now() },
      page: [
        { id: 'exa', source: 'coinbase', resource: entry.resource, title: entry.title, summary: entry.description, provider: entry.provider, network: 'eip155:8453' },
        { id: 'second', source: 'coinbase', resource: 'https://example.com/second', title: entry.title, summary: entry.description, provider: entry.provider, network: 'eip155:8453',
          choice: { access: 'ae_callable', toolRef: ref, sourceRouteRef: 'exact-second' } },
      ],
      continueCursor: '', isDone: true,
    })),
    mutation: vi.fn(), action: vi.fn(),
  } as never)
  const result = await readX402DirectoryCatalogue({ query: 'convert time' })
  expect(result.kind).toBe('ok')
  if (result.kind !== 'ok' || result.page.kind !== 'ok') return
  expect(result.page.items.map(item => item.resource)).toEqual([entry.resource, 'https://example.com/second'])
  expect(blocked).not.toHaveBeenCalled()
  expect(decisionEngine.callJevSystemOne).not.toHaveBeenCalled()
  expect(result.page.items[0]?.choice?.access).toBe('external_listing')
  expect(result.page.items[1]?.choice).toEqual({ access: 'ae_callable', toolRef: ref, sourceRouteRef: 'exact-second' })
})

it('returns priced admitted and external Bazaar search rows from persisted FX', async () => {
  const now = Date.now()
  const toolRef = `operation:v1:${'e'.repeat(64)}`
  const referenceRate = { source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.239', fetchedAt: now }
  const query = vi.fn(async (ref: unknown) => {
    switch (getFunctionName(ref as never)) {
      case 'referenceRateRefresh:current': return referenceRate
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
  expect(result.results[2]).toMatchObject({ toolRef, readiness: 'unverified', next: [{ action: 'registry.tools.describe', args: { toolRef } }] })
  expect(result.results[3]?.toolRef).toBeUndefined()
  expect(result.results[3]?.next).toMatchObject([])
  expect(query.mock.calls.map(([reference]) => getFunctionName(reference as never))).toContain('referenceRateRefresh:current')
})
