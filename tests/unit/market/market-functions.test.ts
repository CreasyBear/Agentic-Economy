import { afterEach, describe, expect, it, vi } from 'vitest'

const projection = vi.hoisted(() => ({ read: vi.fn() }))

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

import { readMarketRouteServer } from '@/modules/market/market.functions'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'

afterEach(() => projection.read.mockReset())

describe('Market route server boundary', () => {
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
})
