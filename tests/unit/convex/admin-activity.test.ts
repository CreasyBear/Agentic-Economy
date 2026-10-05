/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { api, internal } from '../../../convex/_generated/api'
import { convexTestWithMarketComponents, ownerAdmin, nonAdmin, type ConvexFixtureBackend } from '../../helpers/convex-fixtures'

const started = Date.parse('2026-09-20T18:00:00Z')
const filters = { from: started - 1, toExclusive: started + 100, status: 'all' as const, funding: 'all' as const, paginationOpts: { cursor: null, numItems: 25 } }
async function seed(backend: ConvexFixtureBackend) {
  await backend.run(async ctx => {
    for (const [index, ownerId] of ['account:buyer', 'account:promo', 'account:foreign', 'account:refund'].entries()) {
      const callRef = `call:${index}`
      await ctx.db.insert('capabilityCalls', {
        callRef, ownerId, principalId: 'principal:buyer', credentialId: 'credential:buyer', applicationRef: 'app:buyer', toolRef: 'tool:lookup',
        idempotencyKey: callRef, environment: index === 2 ? 'production' : 'sandbox',
        grantRef: 'grant:buyer', grantGeneration: 1, policyDigest: 'digest:policy', grantExpiresAt: started + 1000,
        inputDigest: 'digest:input', requestDigest: 'digest:request', state: 'completed',
        usage: { usageRef: `usage:${index}`, observedAt: started, chargeState: index === 3 ? 'refunded' : 'paid',
          amount: { currency: 'AUD', exponent: 6, units: '1000000' }, priceDigest: 'digest:price' },
        promotionalCreditAllocation: { version: 'ae.promotional-credit-allocation:v1', purchasedUnits: index === 1 ? '0' : '1000000',
          grants: index === 1 ? [{ grantRef: 'grant:promo', amountUnits: '1000000', expiresAt: started + 1000 }] : [] },
        createdAt: started + index, updatedAt: started + 10,
      })
      await ctx.db.insert('accounts', {
        accountRef: ownerId, displayName: index === 0 ? 'Acme Research' : `Account ${index}`, lifecycle: 'active',
        recoveryPolicy: { kind: 'no_transfer', revision: 1 }, creationActorPrincipalRef: 'principal:buyer',
        creationIdempotencyRef: ownerId, initialOwnershipRef: `ownership:${index}`, currentOwnershipRef: `ownership:${index}`,
        revision: 1, createdAt: started, updatedAt: started,
        lastAction: { actorPrincipalRef: 'principal:buyer', activeAccountRef: ownerId, correlationRef: 'correlation:private', idempotencyRef: ownerId },
      })
      await ctx.db.insert('capabilityCallProjections', {
        callRef, accountRef: ownerId, principalRef: 'principal:buyer', credentialRef: 'credential:buyer', applicationRef: 'app:buyer',
        toolRef: 'tool:lookup', providerRef: 'provider:lookup', toolLabel: 'Company lookup', state: 'completed',
        deliveryState: 'delivered', paymentState: 'settled', latencyMs: 12,
        createdAt: started + index, updatedAt: started + 10,
      })
    }
  })
}

describe('founder purchase and Account reads', () => {
  it('isolates environment, filters funding and hydrates only redacted context', async () => {
    const backend = convexTestWithMarketComponents()
    await seed(backend)
    const admin = await ownerAdmin(backend, 'user_founder-activity')
    const page = await admin.query(api.adminConsoleActivity.listPurchases, filters)
    expect(page.page.map(row => row.callRef)).toEqual(['call:3', 'call:1', 'call:0'])
    expect(page.page.at(-1)).toMatchObject({ accountName: 'Acme Research', toolName: 'Company lookup', funding: { kind: 'settled', purchasedUnits: '1000000' } })
    const serialized = JSON.stringify(page)
    expect(serialized).not.toContain('credential:buyer')
    expect(serialized).not.toContain('digest:input')
    const paid = await admin.query(api.adminConsoleActivity.listPurchases, { ...filters, funding: 'customer' })
    expect(paid.page.map(row => row.callRef)).toEqual(['call:0'])
    const refunded = await admin.query(api.adminConsoleActivity.listPurchases, { ...filters, status: 'refunded', funding: 'customer' })
    expect(refunded.page.map(row => row.callRef)).toEqual(['call:3'])
    const account = await admin.query(api.adminConsoleActivity.listPurchases, { ...filters, account: 'account:promo' })
    expect(account.page.map(row => row.callRef)).toEqual(['call:1'])
  })

  it('retains a continuation after a filtered empty page and finds the later match', async () => {
    const backend = convexTestWithMarketComponents()
    await seed(backend)
    const admin = await ownerAdmin(backend, 'user_founder-pagination')
    const first = await admin.query(api.adminConsoleActivity.listPurchases, { ...filters, funding: 'customer', paginationOpts: { cursor: null, numItems: 1 } })
    expect(first.page).toEqual([])
    expect(first.isDone).toBe(false)
    const rest = await admin.query(api.adminConsoleActivity.listPurchases, { ...filters, funding: 'customer', paginationOpts: { cursor: first.continueCursor, numItems: 25 } })
    expect(rest.page.map(row => row.callRef)).toEqual(['call:0'])
  })

  it('refuses anonymous, non-admin and revoked membership without exposing rows', async () => {
    const backend = convexTestWithMarketComponents()
    await seed(backend)
    const outsider = await nonAdmin(backend, 'user_founder-outsider')
    for (const client of [backend, outsider]) {
      expect((await client.query(api.adminConsoleActivity.listPurchases, filters)).page).toEqual([])
      expect((await client.query(api.adminConsoleActivity.listAccounts, { paginationOpts: filters.paginationOpts })).page).toEqual([])
    }
    const admin = await ownerAdmin(backend, 'user_founder-revoked')
    expect((await admin.query(api.adminConsoleActivity.listPurchases, filters)).page.length).toBe(3)
    await backend.run(async ctx => {
      const membership = await ctx.db.query('adminMemberships').withIndex('by_tokenIdentifier_and_state', q => q.eq('tokenIdentifier', 'token_founder-revoked').eq('state', 'active')).unique()
      await ctx.db.patch(membership!._id, { state: 'revoked' })
    })
    expect((await admin.query(api.adminConsoleActivity.listPurchases, filters)).page).toEqual([])
    expect((await admin.query(api.adminConsoleActivity.listAccounts, { paginationOpts: filters.paginationOpts })).page).toEqual([])
  })

  it('finds Accounts by name and excludes security and ownership material', async () => {
    const backend = convexTestWithMarketComponents()
    await seed(backend)
    const admin = await ownerAdmin(backend, 'user_founder-search')
    const result = await admin.query(api.adminConsoleActivity.listAccounts, { search: 'Acme', paginationOpts: filters.paginationOpts })
    expect(result.page.map(row => row.displayName)).toEqual(['Acme Research'])
    expect(Object.keys(result.page[0]!).sort()).toEqual(['accountRef', 'createdAt', 'displayName', 'lifecycle', 'updatedAt'])
    await expect(admin.query(api.adminConsoleActivity.listPurchases, { ...filters, toExclusive: started - 1 })).rejects.toThrow('admin_activity_filter_invalid')
  })

  it('selects original purchase days for late changes and rebuilds refunds without double counting', async () => {
    const backend = convexTestWithMarketComponents()
    await seed(backend)
    await backend.action(internal.adminConsoleMetrics.snapshotMarketplaceMetricsDay, { day: '2026-09-21' })
    await backend.run(async ctx => {
      const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', 'call:0')).unique()
      await ctx.db.patch(call!._id, { usage: { ...call!.usage!, chargeState: 'refunded' }, updatedAt: started + 5000 })
    })
    const changed = await backend.query(internal.adminConsoleMetrics.changedMetricDays, { from: started + 4000, toExclusive: started + 6000, paginationOpts: filters.paginationOpts })
    expect(changed.page).toEqual(['2026-09-21'])
    await backend.action(internal.adminConsoleMetrics.snapshotMarketplaceMetricsDay, { day: changed.page[0]! })
    await backend.action(internal.adminConsoleMetrics.snapshotMarketplaceMetricsDay, { day: changed.page[0]! })
    const day = await backend.run(async ctx => await ctx.db.query('marketplaceMetricDays').first())
    expect(day?.funding).toMatchObject({ purchasedUnits: '0', refundedPurchasedUnits: '2000000', buyingAccounts: 0 })
    const missing = await backend.query(internal.adminConsoleMetrics.missingMetricDays, { lastDay: '2026-09-21' })
    expect(missing).toHaveLength(89)
    expect(missing).not.toContain('2026-09-21')
  })
})
