import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ConvexSourceModule from '@/lib/server/convex-source'

const { mutation } = vi.hoisted(() => ({ mutation: vi.fn() }))

vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexSourceModule>()),
  callPublicSourceMutation: mutation,
}))

vi.mock('@/lib/server/source-write-admission', () => ({
  sourceWriteAdmissionFromRequest: vi.fn(async () => ({ kind: 'admitted' })),
  sourceWriteRequestFromAdmission: (admission: unknown) => admission,
}))

import { createMarketDemandService } from '@/modules/market-demand/market-demand.actions'
import { decodeOpaqueCursor, encodeOpaqueCursor } from '@/modules/registry/opaque-cursor'

const principal = {
  principalId: 'prn_00000000000040008000000000000072',
  ownerId: 'acc_00000000000040008000000000000072',
  credentialId: 'credential:market-demand',
  applicationRef: 'agentic-economy',
  environment: 'sandbox' as const,
  scopes: ['market_tools:call'],
  authorityMode: 'read_only' as const,
}

const listPage = {
  kind: 'available' as const,
  requests: {
    page: [],
    isDone: false,
    continueCursor: 'engine-next',
  },
}

describe('market demand list cursors', () => {
  beforeEach(() => {
    mutation.mockReset()
    mutation.mockResolvedValue(listPage)
  })

  it('wraps the engine continue cursor and refuses a raw engine token', async () => {
    const service = createMarketDemandService(
      new Request('https://ae.example/api/v1/market-requests/list', { method: 'POST', body: '{}' }),
      '{}',
    )

    const listed = await service.list({
      input: { limit: 20 },
      principal,
      correlationId: 'correlation:list',
    })
    expect(listed.kind).toBe('available')
    if (listed.kind !== 'available') return
    expect(listed.nextCursor).not.toBe('engine-next')
    expect(decodeOpaqueCursor(listed.nextCursor ?? '', { kind: 'market-demand', scope: 'v1' })).toBe('engine-next')

    const refused = await service.list({
      input: { limit: 20, cursor: 'engine-next' },
      principal,
      correlationId: 'correlation:raw',
    })
    expect(refused).toEqual({ kind: 'error', code: 'invalid_cursor' })
    expect(mutation.mock.calls.some((call) => {
      const args = call[1] as { paginationOpts?: { cursor?: string | null } } | undefined
      return args?.paginationOpts?.cursor === 'engine-next'
    })).toBe(false)
  })

  it('forwards the inner engine cursor from a matching opaque token', async () => {
    const service = createMarketDemandService(
      new Request('https://ae.example/api/v1/market-requests/list', { method: 'POST', body: '{}' }),
      '{}',
    )
    mutation.mockResolvedValue({
      kind: 'available',
      requests: { page: [], isDone: true, continueCursor: '' },
    })

    const listed = await service.list({
      input: {
        limit: 20,
        cursor: encodeOpaqueCursor({ kind: 'market-demand', scope: 'v1', cursor: 'engine-next' }),
      },
      principal,
      correlationId: 'correlation:opaque',
    })
    expect(listed).toMatchObject({ kind: 'available', hasMore: false })
    expect(mutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      paginationOpts: { numItems: 20, cursor: 'engine-next' },
    }))
  })
})
