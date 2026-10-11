import { describe, expect, it, vi } from 'vitest'

import { reconcileInChunks } from './lib/capabilitySupply/facilitatorDiscovery/readyItems'
import { refreshMarketFlow } from './marketFlowRefresh'

describe('market flow refresh failure', () => {
  it('records fail state instead of throwing when reconcile fails', async () => {
    const runQuery = vi.fn().mockRejectedValue(new Error('workload_revoked'))
    const runMutation = vi.fn().mockResolvedValue(null)
    const result = await refreshMarketFlow({ runQuery, runMutation } as never, {})
    expect(result).toBeNull()
    expect(runMutation.mock.calls[0]?.[1]).toEqual({ message: expect.any(String) })
  })
})

describe('reconcileInChunks', () => {
  it('applies 250 rows in 3 calls of at most 100', async () => {
    const sizes: number[] = []
    await reconcileInChunks(Array.from({ length: 250 }, (_, i) => i), async chunk => { sizes.push(chunk.length) })
    expect(sizes).toEqual([100, 100, 50])
  })
})
