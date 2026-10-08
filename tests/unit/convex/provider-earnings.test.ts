/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'
import { convexModules, publishedBusinessOwner } from '../../helpers/convex-fixtures'

const obligation = (providerRef: string, suffix: string) => ({
  obligationRef: `obligation:${suffix}`, callRef: `call:${suffix}`, toolRef: `tool:${suffix}`,
  providerRef, buyerAccountRef: 'account:buyer', buyerAsset: 'AUD' as const, buyerExponent: 6 as const,
  buyerAmountUnits: '2000000', providerAsset: 'USDC' as const, providerExponent: 6 as const, providerAmountUnits: '1250000',
  settlementMethod: 'managed_x402' as const, state: 'settled' as const, payoutEligibility: 'ineligible_x402' as const,
  evidenceRefs: ['formance:settle'], settlementTransactionRef: `formance:settle:${suffix}`,
  createdAt: 1, updatedAt: 2, settledAt: 2,
})
describe('owner Provider earnings source', () => {
  it('reads only current-owner obligations and exact settlement references', async () => {
    const backend = convexTest(schema, convexModules)
    const own = await publishedBusinessOwner(backend, 'earnings-owner')
    const foreign = await publishedBusinessOwner(backend, 'earnings-foreign')
    await backend.run(async ({ db }) => {
      await db.insert('moneyProviderObligations', obligation(own.businessId, 'own'))
      await db.insert('moneyProviderObligations', obligation(foreign.businessId, 'foreign'))
    })
    const readback = await own.owner.query(api.moneyLedger.readOwnerProviderEarnings, {})
    expect(readback.kind).toBe('available')
    if (readback.kind !== 'available') throw new Error('owner_earnings_unavailable')
    expect(readback.businessId).toBe(own.businessId)
    expect(readback.obligations).toEqual([{
      obligationRef: 'obligation:own', callRef: 'call:own', toolRef: 'tool:own', currency: 'USDC',
      exponent: 6, amountUnits: '1250000', state: 'settled', settlementTransactionRef: 'formance:settle:own',
      createdAt: 1, settledAt: 2,
    }])
    expect(readback.truncated).toBe(false)
    expect(readback.transfers).toEqual([])
    expect(readback.transfersTruncated).toBe(false)
  })

  it('distinguishes no recorded obligations, no Provider profile, and a bounded history', async () => {
    const backend = convexTest(schema, convexModules)
    const own = await publishedBusinessOwner(backend, 'earnings-bounded')
    expect(await own.owner.query(api.moneyLedger.readOwnerProviderEarnings, {})).toEqual({
      kind: 'available', businessId: own.businessId, obligations: [], truncated: false, transfers: [], transfersTruncated: false,
    })
    await backend.run(async ({ db }) => {
      for (let index = 0; index < 101; index += 1) {
        await db.insert('moneyProviderObligations', obligation(own.businessId, String(index)))
      }
    })
    const readback = await own.owner.query(api.moneyLedger.readOwnerProviderEarnings, {})
    expect(readback.kind).toBe('available')
    if (readback.kind !== 'available') throw new Error('owner_earnings_unavailable')
    expect(readback.truncated).toBe(true)
    expect(readback.obligations).toHaveLength(100)
  })

  it('continues exact owner obligations beyond 100 with bounded opaque pages', async () => {
    const backend = convexTest(schema, convexModules)
    const own = await publishedBusinessOwner(backend, 'earnings-paged')
    const foreign = await publishedBusinessOwner(backend, 'earnings-paged-foreign')
    await backend.run(async ({ db }) => {
      for (let index = 0; index < 101; index += 1) await db.insert('moneyProviderObligations', { ...obligation(own.businessId, String(index)), createdAt: index })
      await db.insert('moneyProviderObligations', { ...obligation(foreign.businessId, 'foreign'), createdAt: 999 })
    })
    const first = await own.owner.query(api.moneyLedger.readOwnerProviderEarningsPage, { paginationOpts: { numItems: 50, cursor: null } })
    if (first.kind !== 'available') throw new Error('owner_earnings_unavailable')
    expect(first.obligations).toHaveLength(50)
    expect(first.obligations[0]).toMatchObject({ obligationRef: 'obligation:100', amountUnits: '1250000', currency: 'USDC', exponent: 6 })
    expect(first.isDone).toBe(false)
    const second = await own.owner.query(api.moneyLedger.readOwnerProviderEarningsPage, { paginationOpts: { numItems: 50, cursor: first.continueCursor } })
    if (second.kind !== 'available') throw new Error('owner_earnings_unavailable')
    const last = await own.owner.query(api.moneyLedger.readOwnerProviderEarningsPage, { paginationOpts: { numItems: 50, cursor: second.continueCursor } })
    expect(last).toMatchObject({ kind: 'available', isDone: true, obligations: [{ obligationRef: 'obligation:0' }] })
    const others = await foreign.owner.query(api.moneyLedger.readOwnerProviderEarningsPage, { paginationOpts: { numItems: 50, cursor: null } })
    expect(others).toMatchObject({ kind: 'available', isDone: true, obligations: [{ obligationRef: 'obligation:foreign' }] })
    await expect(backend.query(api.moneyLedger.readOwnerProviderEarningsPage, { paginationOpts: { numItems: 50, cursor: null } })).resolves.toEqual({ kind: 'error', code: 'unauthenticated' })
    await expect(own.owner.query(api.moneyLedger.readOwnerProviderEarningsPage, { paginationOpts: { numItems: 51, cursor: null } })).rejects.toThrow('provider_earnings_page_size_invalid')
  })
})
