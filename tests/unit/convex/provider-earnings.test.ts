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
const transfer = (businessId: string, owningAccountRef: string) => ({
  payoutRef: 'payout:one', businessId, owningAccountRef,
  authorityPrincipalRef: 'principal:owner', authorityGrantRef: 'grant:one',
  authorityGrantGeneration: 1, authorityResourceRefs: ['business:one'],
  currency: 'AUD', exponent: 6, grossAccrualUnits: '2500000', rakeUnits: '500000',
  providerNetUnits: '2000000', minimumPayoutUnits: '1000000', cadence: 'daily' as const,
  state: 'paid' as const, periodStart: '2026-09-01', periodEnd: '2026-09-27',
  stripeTransferId: 'tr_one', transferStatus: 'succeeded' as const,
  transferEvidenceDigest: 'sha256:transfer-one', transferObservedAt: 2,
  idempotencyKey: 'payout:one', createdAt: 1, updatedAt: 2,
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

  it('shows a recorded Stripe transfer separately from USDC obligations, without claiming bank payout', async () => {
    const backend = convexTest(schema, convexModules)
    const own = await publishedBusinessOwner(backend, 'earnings-transfer')
    await backend.run(async ({ db }) => {
      await db.insert('moneyPayouts', transfer(own.businessId, own.canonicalAccountRef))
    })
    const readback = await own.owner.query(api.moneyLedger.readOwnerProviderEarnings, {})
    expect(readback.kind).toBe('available')
    if (readback.kind !== 'available') throw new Error('owner_earnings_unavailable')
    expect(readback.obligations).toEqual([])
    expect(readback.transfers).toEqual([{
      payoutRef: 'payout:one', currency: 'AUD', exponent: 6, amountUnits: '2000000',
      state: 'paid', stripeTransferId: 'tr_one', transferStatus: 'succeeded',
      transferEvidenceDigest: 'sha256:transfer-one', transferObservedAt: 2, createdAt: 1,
    }])
  })
  it('refuses transfer records with a conflicting owner rather than disclosing them', async () => {
    const backend = convexTest(schema, convexModules)
    const own = await publishedBusinessOwner(backend, 'earnings-transfer-conflict')
    await backend.run(async ({ db }) => {
      await db.insert('moneyPayouts', transfer(own.businessId, 'account:foreign'))
    })
    expect(await own.owner.query(api.moneyLedger.readOwnerProviderEarnings, {})).toEqual({
      kind: 'conflict', code: 'payout_owner_mismatch',
    })
  })
  it('keeps the most recently updated payout across currencies in bounded history', async () => {
    const backend = convexTest(schema, convexModules)
    const own = await publishedBusinessOwner(backend, 'earnings-mixed-currencies')
    await backend.run(async ({ db }) => {
      for (let index = 0; index < 101; index += 1) {
        await db.insert('moneyPayouts', {
          ...transfer(own.businessId, own.canonicalAccountRef),
          payoutRef: `payout:usd:${index}`, currency: 'USD', updatedAt: index + 1,
        })
      }
      await db.insert('moneyPayouts', {
        ...transfer(own.businessId, own.canonicalAccountRef),
        payoutRef: 'payout:aud:latest', currency: 'AUD', updatedAt: 102,
      })
    })
    const readback = await own.owner.query(api.moneyLedger.readOwnerProviderEarnings, {})
    expect(readback.kind).toBe('available')
    if (readback.kind !== 'available') throw new Error('owner_earnings_unavailable')
    expect(readback.transfersTruncated).toBe(true)
    expect(readback.transfers).toHaveLength(100)
    expect(readback.transfers[0]?.payoutRef).toBe('payout:aud:latest')
  })
})
