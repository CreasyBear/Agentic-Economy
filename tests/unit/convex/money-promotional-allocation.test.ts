/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import { claimPromotionalCredit, restorePromotionalCredit } from '../../../convex/lib/money/promotionalCredit/allocation'

const modules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)
const now = Date.UTC(2026, 8, 30)

function backend() { return convexTest(schema, modules) }

async function grant(t: ReturnType<typeof backend>, grantRef: string, amountUnits: string, expiresAt: number) {
  await t.run(async (ctx) => {
    await ctx.db.insert('moneyPromotionalGrants', {
      grantRef, accountRef: 'account:buyer', environment: 'sandbox',
      amountUnits, availableUnits: amountUnits, expiresAt,
      createdAt: now - 1, updatedAt: now - 1,
      operationKey: `operation:${grantRef}`, actorRef: 'admin:one',
      correlationId: `correlation:${grantRef}`, commandDigest: `digest:${grantRef}`,
      reasonCode: 'onboarding', evidenceRefs: ['evidence:promo'], bookingState: 'booked', transactionRef: `transaction:${grantRef}`, expiryRevision: 0,
    })
  })
}

async function available(t: ReturnType<typeof backend>, grantRef: string) {
  return t.run(async (ctx) => (await ctx.db.query('moneyPromotionalGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', grantRef)).unique())?.availableUnits)
}

describe('promotional allocation', () => {
  it('claims earliest expiry first and leaves the purchased remainder', async () => {
    const t = backend()
    await grant(t, 'later', '5000000', now + 20)
    await grant(t, 'earlier', '3000000', now + 10)
    const result = await t.run((ctx) => claimPromotionalCredit(ctx, {
      accountRef: 'account:buyer', environment: 'sandbox', amountUnits: '10000000', now,
    }))
    expect(result).toEqual({ kind: 'claimed', allocation: {
      version: 'ae.promotional-credit-allocation:v1', purchasedUnits: '2000000',
      grants: [
        { grantRef: 'earlier', amountUnits: '3000000', expiresAt: now + 10 },
        { grantRef: 'later', amountUnits: '5000000', expiresAt: now + 20 },
      ],
    } })
    expect(await available(t, 'earlier')).toBe('0')
    expect(await available(t, 'later')).toBe('0')
  })

  it('excludes expired grants and keeps late returns unavailable', async () => {
    const t = backend()
    await grant(t, 'expired', '5000000', now)
    await grant(t, 'active', '2000000', now + 10)
    const claimed = await t.run((ctx) => claimPromotionalCredit(ctx, {
      accountRef: 'account:buyer', environment: 'sandbox', amountUnits: '1000000', now,
    }))
    expect(claimed.kind).toBe('claimed')
    if (claimed.kind !== 'claimed') throw new Error('claim refused')
    expect(claimed.allocation.grants.map((row) => row.grantRef)).toEqual(['active'])
    expect(await t.run((ctx) => restorePromotionalCredit(ctx, claimed.allocation, 'account:buyer', 'sandbox', now + 11)))
      .toEqual({ kind: 'restored' })
    const active = await t.run((ctx) => ctx.db.query('moneyPromotionalGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', 'active')).unique())
    expect(active?.availableUnits).toBe('2000000')
    expect(active?.nextWorkAt).toBe(now + 11)
    const after = await t.run((ctx) => claimPromotionalCredit(ctx, {
      accountRef: 'account:buyer', environment: 'sandbox', amountUnits: '1000000', now: now + 11,
    }))
    expect(after).toMatchObject({ kind: 'claimed', allocation: { purchasedUnits: '1000000', grants: [] } })
  })

  it('serializes concurrent claims against one grant', async () => {
    const t = backend()
    await grant(t, 'single', '1000000', now + 10)
    const input = { accountRef: 'account:buyer', environment: 'sandbox' as const, amountUnits: '1000000', now }
    const [a, b] = await Promise.all([
      t.run((ctx) => claimPromotionalCredit(ctx, input)),
      t.run((ctx) => claimPromotionalCredit(ctx, input)),
    ])
    expect([a, b].map((result) => result.kind === 'claimed' ? result.allocation.grants.length : -1).sort())
      .toEqual([0, 1])
    expect(await available(t, 'single')).toBe('0')
  })

  it('refuses grant fanout over 100 before any decrement', async () => {
    const t = backend()
    for (let i = 0; i < 101; i += 1) await grant(t, `g${i}`, '1', now + i + 1)
    const result = await t.run((ctx) => claimPromotionalCredit(ctx, {
      accountRef: 'account:buyer', environment: 'sandbox', amountUnits: '101', now,
    }))
    expect(result).toEqual({ kind: 'refused', code: 'promotional_credit_allocation_unavailable' })
    expect(await available(t, 'g0')).toBe('1')
    expect(await available(t, 'g100')).toBe('1')
  })
})
