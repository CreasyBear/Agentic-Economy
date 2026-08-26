import { describe, expect, it, vi } from 'vitest'

const registry = vi.hoisted(() => ({ run: vi.fn() }))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  }),
}))
vi.mock('@/modules/actions', () => ({
  listMcpActions: () => [
    { id: 'public-read', readOnly: true, credentialAdmission: undefined },
    { id: 'credentialed-read', readOnly: true, credentialAdmission: { kind: 'credential' } },
  ],
  describeActionForAgent: (action: { id: string }) => ({
    id: action.id,
    name: 'Public read',
    summary: 'Reads public registry data.',
    boundaries: ['no account mutation'],
  }),
}))
vi.mock('@/modules/registry/registry.actions', () => ({
  registryServicesListAction: {
    schema: { parse: (value: unknown) => value },
    run: registry.run,
  },
}))

import { loadSupplyLandingReadbackServer } from '@/lib/server/supply-landing.functions'

describe('Phase 2 supply landing public exemption', () => {
  it('loadSupplyLandingReadbackServer returns only credential-free public tools and registry projections', async () => {
    registry.run.mockResolvedValue({ items: [], cursor: null, hasMore: false })

    const result = await (loadSupplyLandingReadbackServer as unknown as () => Promise<unknown>)()

    expect(loadSupplyLandingReadbackServer).toBeDefined()
    expect(result).toEqual({
      kind: 'available',
      tools: [{
        id: 'public-read',
        name: 'Public read',
        summary: 'Reads public registry data.',
        boundaries: ['no account mutation'],
      }],
      services: { items: [], cursor: null, hasMore: false },
      evidence: 'source',
    })
    expect(JSON.stringify(result)).not.toMatch(/credentialed-read|secret|ownerId|accountRef/u)
    expect(registry.run).toHaveBeenCalledWith({
      data: { limit: 10 },
      context: { caller: 'ui' },
    })
  })
})
