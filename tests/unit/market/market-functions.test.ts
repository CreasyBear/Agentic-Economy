import { afterEach, describe, expect, it, vi } from 'vitest'

const projection = vi.hoisted(() => ({ read: vi.fn(), catalogue: vi.fn(), canonical: vi.fn(), discovery: vi.fn(), chat: vi.fn() }))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  createServerFn: () => {
    const handler = (fn: (input: { data: unknown }) => Promise<unknown>) =>
      async (input: { data?: unknown } = {}) => await fn({ data: input.data })
    return {
      handler,
      validator: (validate: (value: unknown) => unknown) => ({
        handler: (fn: (input: { data: unknown }) => Promise<unknown>) =>
          async (input: { data?: unknown } = {}) => await fn({ data: validate(input.data) }),
      }),
    }
  },
}))

vi.mock('@/modules/market/server', () => ({ readMarketRouteProjection: projection.read }))
vi.mock('@/modules/market/market-route-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/market/market-route-data')>()),
  loadMarketRouteData: projection.catalogue,
}))
vi.mock('@/lib/server/canonical-url.functions', () => ({ readCanonicalBaseUrlServer: projection.canonical }))
vi.mock('@/modules/decision-engine/public', () => ({ jevDiscoveryRecipient: projection.discovery }))
vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/convex-source')>()),
  callPublicSourceQuery: projection.chat,
}))

import { loadMarketPageRouteData, readMarketRouteServer } from '@/modules/market/market.functions'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'

afterEach(() => {
  vi.unstubAllEnvs()
  for (const mock of Object.values(projection)) mock.mockReset()
})

describe('Market route server boundary', () => {
  it.each([{}, { view: 'discover' as const }, { view: 'providers' as const }, { providerCursor: 'next-host' }])('does not wait for unused chat configuration on %j', async deps => {
    vi.stubEnv('CONVEX_URL', 'http://127.0.0.1:3210')
    projection.catalogue.mockResolvedValue({ page: { kind: 'ok', items: [] } })
    projection.chat.mockImplementation(() => new Promise(() => {}))
    const result = await loadMarketPageRouteData(deps)
    expect(result.page.kind).toBe('ok')
    expect(result.chatRecipient).toBeNull()
    expect(projection.chat).not.toHaveBeenCalled()
  })
  it('accepts a 200-character query and preserves existing route filters', async () => {
    const query = 'x'.repeat(SEARCH_QUERY_MAX_LENGTH)
    projection.read.mockResolvedValue({ kind: 'ok' })

    await readMarketRouteServer({ data: {
      window: '30d', query, availability: 'routeable', cursor: 'signed:cursor',
    } })

    expect(projection.read).toHaveBeenCalledWith('30d', {
      query, availability: 'routeable', cursor: 'signed:cursor',
    })
  })

  it('rejects an over-limit query before reading the Market projection', async () => {
    await expect(readMarketRouteServer({ data: {
      window: '30d', query: 'x'.repeat(SEARCH_QUERY_MAX_LENGTH + 1), availability: 'routeable', cursor: 'signed:cursor',
    } })).rejects.toThrow()

    expect(projection.read).not.toHaveBeenCalled()
  })

  it('keeps catalogue and comparison available when canonical and recipient reads reject', async () => {
    projection.catalogue.mockResolvedValue({ page: { kind: 'ok', items: [{ resource: 'tool:1' }] }, compareEntries: [{ resource: 'tool:1' }] })
    projection.canonical.mockRejectedValue(new Error('canonical origin unavailable'))
    projection.discovery.mockImplementation(() => { throw new Error('ranking recipient unavailable') })
    projection.chat.mockRejectedValue(new Error('chat recipient unavailable'))
    const previousUrl = process.env.CONVEX_URL
    process.env.CONVEX_URL = 'http://127.0.0.1:3210'
    try {
      const result = await loadMarketPageRouteData({ view: 'tools' })
      expect(result).toMatchObject({ page: { kind: 'ok', items: [{ resource: 'tool:1' }] }, compareEntries: [{ resource: 'tool:1' }], chatRecipient: null, jevRecipient: null })
      expect(result.canonicalBaseUrl).toBeUndefined()
    } finally {
      if (previousUrl === undefined) delete process.env.CONVEX_URL
      else process.env.CONVEX_URL = previousUrl
    }
  })
})
