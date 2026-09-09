import { describe, expect, it } from 'vitest'
import { api } from '../../../convex/_generated/api'
import { convexTestWithMarketComponents } from '../../helpers/convex-fixtures'

describe('marketExternalSnapshots.read', () => {
  it('[REGRESSION] returns first-party counts with snapshot null and no third-party data', async () => {
    const backend = convexTestWithMarketComponents()
    const result = await backend.query(api.marketExternalSnapshots.read, { window: '30d', now: 1_700_000_000_000 })
    expect(result.snapshot).toBeNull()
    expect(result.firstPartyAvailable).toBe(true)
    expect(result.generatedAt).toBeTypeOf('number')
    expect(result.firstParty).toEqual({ tools: 0, providers: 0, invocations: 0, completedInvocations: 0, qualifiedUses: 0, settlements: 0, reconciliationRequired: 0 })
  })

  it('rejects a non-integer or negative now', async () => {
    const backend = convexTestWithMarketComponents()
    await expect(backend.query(api.marketExternalSnapshots.read, { window: '24h', now: -1 })).rejects.toThrow()
    await expect(backend.query(api.marketExternalSnapshots.read, { window: '7d', now: 1.5 })).rejects.toThrow()
  })
})
