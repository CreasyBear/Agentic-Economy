/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../../../convex/schema'
import { api, internal } from '../../../convex/_generated/api'
import { quoteManagedX402BuyerAud, REFERENCE_RATE_MAX_AGE_MS } from '../../../src/modules/money/public'

const modules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

afterEach(() => vi.unstubAllGlobals())

describe('persisted USDC/AUD reference rate', () => {
  it('continues pricing from last good observation when the scheduled source returns 500', async () => {
    const t = convexTest(schema, modules)
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ data: { currency: 'USDC', rates: { AUD: '1.50' } } }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
    vi.stubGlobal('fetch', fetch)
    await t.action(internal.referenceRateRefresh.run, {})
    const before = await t.query(api.referenceRateRefresh.current, {})
    expect(before?.rate).toBe('1.50')
    await t.action(internal.referenceRateRefresh.run, {})
    const persisted = await t.query(api.referenceRateRefresh.current, {})
    expect(persisted).toEqual(before)
    if (persisted === null) throw new Error('Expected the last good reference rate to remain persisted')
    const price = quoteManagedX402BuyerAud({
      environment: 'sandbox', requiredUsdcAtomicUnits: '1000000',
      observedAt: Date.now(), referenceRate: persisted,
    })
    expect(price).toMatchObject({ kind: 'quoted', evidence: { sourceAmount: { units: '1500000' } } })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('refuses new money pricing at the 24-hour boundary without invalidating past evidence', async () => {
    const now = Date.now()
    const observation = { source: 'coinbase' as const, base: 'USDC' as const, quote: 'AUD' as const, rate: '1.5', fetchedAt: now - REFERENCE_RATE_MAX_AGE_MS }
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      await ctx.db.insert('moneyReferenceRates', { pair: 'USDC/AUD', rate: observation.rate, fetchedAt: observation.fetchedAt })
    })
    expect(await t.query(api.referenceRateRefresh.current, {})).toBeNull()
    expect(quoteManagedX402BuyerAud({ environment: 'sandbox', requiredUsdcAtomicUnits: '1000000', observedAt: now, referenceRate: observation }).kind).toBe('refused')
  })
})
