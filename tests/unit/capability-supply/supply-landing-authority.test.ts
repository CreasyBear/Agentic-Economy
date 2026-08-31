import { describe, expect, it, vi } from 'vitest'

const market = vi.hoisted(() => ({ read: vi.fn() }))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  }),
}))
vi.mock('@/modules/actions', () => ({
  listMcpActions: () => [
    { id: 'registry.operations.search', readOnly: true, credentialAdmission: undefined },
    { id: 'registry.services_list', readOnly: true, credentialAdmission: undefined },
    { id: 'credentialed-read', readOnly: true, credentialAdmission: { kind: 'credential' } },
  ],
  describeActionForAgent: (action: { id: string }) => ({
    id: action.id,
    name: 'Public read',
    summary: 'Reads public registry data.',
    boundaries: ['no account mutation'],
  }),
}))
vi.mock('@/modules/market/server', () => ({
  readMarketRouteProjection: market.read,
}))

import { loadSupplyLandingReadbackServer } from '@/lib/server/supply-landing.functions'

describe('Supply landing public exemption', () => {
  it('loadSupplyLandingReadbackServer returns only credential-free Operation tools and canonical listings', async () => {
    market.read.mockResolvedValue({ window: '30d', catalog: { kind: 'no_candidates', matchedCount: 0 } })

    const result = await (loadSupplyLandingReadbackServer as unknown as () => Promise<unknown>)()

    expect(loadSupplyLandingReadbackServer).toBeDefined()
    expect(result).toEqual({
      kind: 'available',
      tools: [{
        id: 'registry.operations.search',
        name: 'Public read',
        summary: 'Reads public registry data.',
        boundaries: ['no account mutation'],
      }],
      listings: [],
      evidence: 'source',
    })
    expect(JSON.stringify(result)).not.toMatch(/credentialed-read|registry\.services_list|secret|ownerId|accountRef/u)
    expect(market.read).toHaveBeenCalledWith('30d')
  })
})
