import { describe, expect, it, vi } from 'vitest'

import { isRecord } from '@/modules/common/is-record'

const market = vi.hoisted(() => ({ read: vi.fn() }))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  }),
}))
vi.mock('@/modules/market/server', () => ({
  readMarketRouteProjection: market.read,
}))

import { listMcpActions } from '@/modules/actions'
import { loadSupplyLandingReadbackServer } from '@/lib/server/supply-landing.functions'

describe('Supply landing public exemption', () => {
  it('loadSupplyLandingReadbackServer presents the current public Tool inventory', async () => {
    market.read.mockResolvedValue({ window: '30d', catalog: { kind: 'no_candidates', matchedCount: 0 } })

    const result = await (loadSupplyLandingReadbackServer as unknown as () => Promise<unknown>)()
    const registeredToolIds = listMcpActions()
      .filter((action) => (
        action.readOnly
        && action.credentialAdmission === undefined
        && action.id.startsWith('registry.tools.')
      ))
      .map(({ id }) => id)

    expect(loadSupplyLandingReadbackServer).toBeDefined()
    expect(result).toMatchObject({ kind: 'available', listings: [], evidence: 'source' })
    if (!isAvailableSupplyLandingReadback(result)) {
      throw new Error('supply_landing_readback_unavailable')
    }
    expect(result.tools.map(({ id }) => id)).toEqual(registeredToolIds)
    expect(registeredToolIds).toEqual([
      'registry.tools.list',
      'registry.tools.search',
      'registry.tools.describe',
      'registry.tools.compare',
    ])
    expect(JSON.stringify(result)).not.toMatch(/registry\.operations\.|registry\.services_|secret|ownerId|accountRef/u)
    expect(market.read).toHaveBeenCalledWith('30d')
  })
})

function isAvailableSupplyLandingReadback(
  value: unknown,
): value is Readonly<{ kind: 'available'; tools: readonly { id: string }[] }> {
  if (!isRecord(value) || value.kind !== 'available' || !Array.isArray(value.tools)) return false
  return value.tools.every((tool) => isRecord(tool) && typeof tool.id === 'string')
}
