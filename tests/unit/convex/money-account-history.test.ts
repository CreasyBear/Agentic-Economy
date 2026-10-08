import { makeFunctionReference } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { convexTestWithMarketComponents, ownerAdmin, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { formanceAccountMetadataDigest } from '@/modules/money/formance-workflows'
import { digestReference, type AccountHistoryResult } from '@/modules/money/public'
import { api } from '../../../convex/_generated/api'

const ledger = vi.hoisted(() => ({ listTransactions: vi.fn() }))
vi.mock('@/modules/money/formance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/money/formance')>()),
  readFormanceConfiguration: () => ({ kind: 'configured', configuration: { ledger: 'test-ledger' } }),
  createFormanceContext: () => ({ configuration: { ledger: 'test-ledger' }, sdk: { ledger: { v2: ledger } } }),
}))

const readHistory = makeFunctionReference<'action', { cursor?: string }, AccountHistoryResult>('moneyOwnerSpend:readOwnerHistory')

afterEach(() => {
  vi.unstubAllEnvs()
  ledger.listTransactions.mockReset()
})

describe('authenticated Account history', () => {
  it('keeps internal monthly sale proof out of the existing owner spending response', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'monthly-report-contract')
    const accountDigest = formanceAccountMetadataDigest(fixture.canonicalAccountRef)
    const period = { periodStartAt: Date.now() - 10_000, periodEndAt: Date.now() }
    const legal = `legal_customers:${'a'.repeat(64)}`
    ledger.listTransactions.mockResolvedValueOnce({ v2TransactionsCursorResponse: { cursor: {
      data: [{ id: 1n, reference: `ae-p4:${'b'.repeat(64)}:settle-buyer`, template: 'BUYER_SALE_SETTLED', reverted: false,
        timestamp: new Date(period.periodStartAt + 1), insertedAt: new Date(period.periodStartAt + 2), metadata: { account_digest: accountDigest },
        postings: [{ source: `${legal}:exposure_reserved`, destination: `${legal}:exposure_settled`, asset: 'AUD/6', amount: 7n }] }],
      hasMore: false,
    } } })
    const result = await fixture.owner.action(api.moneyOwnerSpend.readOwnerSpend, period)
    expect(result).toMatchObject({ kind: 'available', spendUnits: '7', transactionCountUnits: '1' })
    expect(result).not.toHaveProperty('sales')
    expect(result).not.toHaveProperty('highWaterTransactionId')
    ledger.listTransactions.mockResolvedValueOnce({ v2TransactionsCursorResponse: { cursor: { data: [], hasMore: false } } })
    expect(await fixture.owner.action(api.moneyOwnerSpend.readOwnerSpend, period)).toEqual({ kind: 'empty' })
  })

  it('resolves the Account from owner identity on every page and rejects another owner cursor before the ledger', async () => {
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'account-history-test-cursor-key-32-bytes')
    const backend = convexTestWithMarketComponents()
    const first = await publishedBusinessOwner(backend, 'history-first')
    const second = await publishedBusinessOwner(backend, 'history-second')
    const digest = formanceAccountMetadataDigest(first.canonicalAccountRef)
    ledger.listTransactions.mockResolvedValueOnce({ v2TransactionsCursorResponse: { cursor: {
      data: [{ id: 2n, reference: 'history:first', template: 'FUNDING_SETTLED', reverted: false,
        timestamp: new Date(1000), insertedAt: new Date(2000), metadata: { account_digest: digest },
        postings: [{ source: 'processor:one', destination: `accounts:${digest}:available`, asset: 'AUD/6', amount: 10n }] }],
      hasMore: true, next: 'official:next', pageSize: 15,
    } } })
    const result = await first.owner.action(readHistory, {})
    expect(result).toMatchObject({ kind: 'available', entries: [{ accountEffect: { units: '10' } }] })
    expect(ledger.listTransactions.mock.calls[0]?.[0].query.$and[0])
      .toEqual({ $match: { 'metadata[account_digest]': digest } })
    if (result.kind !== 'available') throw new Error(result.code)
    await expect(second.owner.action(readHistory, { cursor: result.continueCursor }))
      .resolves.toEqual({ kind: 'refused', code: 'account_history_cursor_invalid' })
    await expect(backend.action(readHistory, { cursor: result.continueCursor }))
      .resolves.toEqual({ kind: 'refused', code: 'billing_identity_missing' })
    expect(ledger.listTransactions).toHaveBeenCalledTimes(1)

    ledger.listTransactions.mockResolvedValueOnce({ v2TransactionsCursorResponse: { cursor: { data: [], hasMore: false, pageSize: 15 } } })
    await expect(first.owner.action(readHistory, { cursor: result.continueCursor })).resolves.toMatchObject({ kind: 'available', isDone: true })
    expect(ledger.listTransactions.mock.calls[1]?.[0]).toEqual({ ledger: 'test-ledger', cursor: 'official:next' })

    ledger.listTransactions.mockResolvedValueOnce({ v2TransactionsCursorResponse: { cursor: { data: [], hasMore: false, pageSize: 15 } } })
    await expect(second.owner.action(readHistory, {})).resolves.toMatchObject({ kind: 'available', isDone: true })
    expect(ledger.listTransactions.mock.calls[2]?.[0].query.$and[0])
      .toEqual({ $match: { 'metadata[account_digest]': formanceAccountMetadataDigest(second.canonicalAccountRef) } })
  })

  it('does not derive owner money access from administrator membership or a workload identity', async () => {
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'account-history-test-cursor-key-32-bytes')
    const backend = convexTestWithMarketComponents()
    const administrator = await ownerAdmin(backend, 'user_history-admin-only')
    const workload = await publishedBusinessOwner(backend, 'history-workload')
    await backend.run(async (ctx) => {
      const principal = await ctx.db.query('principals').withIndex('by_principalRef', (q) =>
        q.eq('principalRef', workload.canonicalPrincipalRef)).unique()
      if (principal === null) throw new Error('history_workload_fixture_missing')
      await ctx.db.patch(principal._id, { kind: 'workload' })
      for (const ownership of await ctx.db.query('accountOwnerships').collect()) {
        if (ownership.accountRef !== workload.canonicalAccountRef) {
          await ctx.db.delete(ownership._id)
        }
      }
    })
    for (const caller of [administrator, workload.owner, backend]) {
      await expect(caller.action(readHistory, {}))
        .resolves.toEqual({ kind: 'refused', code: 'billing_identity_missing' })
    }
    expect(ledger.listTransactions).not.toHaveBeenCalled()
  })

  it('does not accept a client-selected Account or mask missing cursor configuration as empty history', async () => {
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', '')
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'history-missing-key')
    const forged = makeFunctionReference<'action', { accountRef: string }, AccountHistoryResult>('moneyOwnerSpend:readOwnerHistory')
    await expect(fixture.owner.action(forged, { accountRef: 'account:other' })).rejects.toThrow()
    await expect(fixture.owner.action(readHistory, {}))
      .resolves.toEqual({ kind: 'setup_required', code: 'formance_history_configuration_invalid' })
    expect(ledger.listTransactions).not.toHaveBeenCalled()
  })

  it('links only the settled buyer sale with the same Account, transaction ref and canonical Call digest', async () => {
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'account-history-test-cursor-key-32-bytes')
    const backend = convexTestWithMarketComponents()
    const first = await publishedBusinessOwner(backend, 'history-sale-first')
    const second = await publishedBusinessOwner(backend, 'history-sale-second')
    const callRef = `operation-invocation:v1:${'b'.repeat(64)}`
    const buyerRef = 'formance:history-buyer-sale'
    const callDigest = digestReference('call', callRef)
    await backend.run(async (ctx) => {
      await ctx.db.insert('capabilityCalls', {
        callRef, principalId: first.canonicalPrincipalRef, ownerId: first.canonicalAccountRef,
        credentialId: 'credential:history-sale', applicationRef: 'application:history-sale',
        toolRef: 'operation:history-sale', idempotencyKey: 'idempotency:history-sale',
        environment: 'sandbox', grantRef: 'grant:history-sale', grantGeneration: 1,
        policyDigest: 'sha256:history-sale', grantExpiresAt: 5000,
        inputDigest: 'sha256:history-input', requestDigest: 'sha256:history-request',
        formanceFinancialState: 'possibly_submitted', formanceReservationRefs: ['reserve:one'],
        state: 'completed', createdAt: 1000, updatedAt: 1000,
      })
    })
    const finalize = makeFunctionReference<'mutation',
      { callRef: string; transactionRefs: string[]; now: number },
      { kind: 'accepted'; state: string; replayed: boolean } | { kind: 'refused'; code: string }>(
      'moneyManagedCallLifecycle:finalizeSettlement')
    await expect(backend.mutation(finalize, { callRef, transactionRefs: [buyerRef, 'formance:history-provider'], now: 1100 }))
      .resolves.toMatchObject({ kind: 'accepted', state: 'settled' })
    // A pre-attribution settled Call has both proven settlement refs but no scalar index.
    await backend.run(async (ctx) => {
      const legacy = await ctx.db.query('capabilityCalls').withIndex('by_callRef', (q) => q.eq('callRef', callRef)).unique()
      if (legacy === null) throw new Error('history_sale_call_missing')
      await ctx.db.patch(legacy._id, { buyerSaleTransactionRef: undefined })
    })
    await expect(backend.mutation(finalize, { callRef, transactionRefs: [buyerRef, 'formance:history-provider'], now: 1200 }))
      .resolves.toMatchObject({ kind: 'accepted', replayed: true })
    const replayed = await backend.run(async (ctx) => ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (q) => q.eq('callRef', callRef)).unique())
    expect(replayed?.buyerSaleTransactionRef).toBe(buyerRef)
    await backend.run(async (ctx) => {
      if (replayed === null) throw new Error('history_sale_call_missing')
      await ctx.db.patch(replayed._id, { buyerSaleTransactionRef: 'formance:wrong-scalar' })
    })
    await expect(backend.mutation(finalize, { callRef, transactionRefs: [buyerRef, 'formance:history-provider'], now: 1250 }))
      .resolves.toEqual({ kind: 'refused', code: 'managed_call_settlement_conflict' })
    await backend.run(async (ctx) => {
      if (replayed === null) throw new Error('history_sale_call_missing')
      await ctx.db.patch(replayed._id, { buyerSaleTransactionRef: buyerRef })
    })
    await expect(backend.mutation(finalize, { callRef, transactionRefs: ['formance:different-buyer', 'formance:history-provider'], now: 1300 }))
      .resolves.toEqual({ kind: 'refused', code: 'managed_call_settlement_conflict' })
    const booked = await backend.run(async (ctx) => ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (q) => q.eq('callRef', callRef)).unique())
    expect(booked?.buyerSaleTransactionRef).toBe(buyerRef)
    const row = (id: bigint, reference: string, digest: string, account: string) => ({
      id, reference, template: 'BUYER_SALE_SETTLED', reverted: false,
      timestamp: new Date(1000), insertedAt: new Date(2000),
      metadata: { account_digest: formanceAccountMetadataDigest(account), call_digest: digest },
      postings: [{ source: `calls:${digest}:buyer_reserved`, destination: 'platform:revenue:sales', asset: 'AUD/6', amount: 10n }],
    })
    ledger.listTransactions.mockResolvedValueOnce({ v2TransactionsCursorResponse: { cursor: {
      data: [
        row(5n, buyerRef, callDigest, first.canonicalAccountRef),
        row(4n, buyerRef, 'b'.repeat(64), first.canonicalAccountRef),
        row(3n, 'formance:wrong-ref', callDigest, first.canonicalAccountRef),
        row(2n, 'formance:history-provider', callDigest, first.canonicalAccountRef),
      ], hasMore: false, pageSize: 15,
    } } })
    const result = await first.owner.action(readHistory, {})
    expect(result.kind).toBe('available')
    if (result.kind !== 'available') throw new Error(result.code)
    expect(result.entries.map((entry) => entry.sourceRef)).toEqual([callRef, null, null, null])
    expect(result.sourceLinkCoverage).toBe('partial')
    ledger.listTransactions.mockResolvedValueOnce({ v2TransactionsCursorResponse: { cursor: {
      data: [row(1n, buyerRef, callDigest, first.canonicalAccountRef)], hasMore: false, pageSize: 15,
    } } })
    await expect(first.owner.action(readHistory, {})).resolves.toMatchObject({
      kind: 'available', entries: [{ sourceRef: callRef }], sourceLinkCoverage: 'complete',
    })
    ledger.listTransactions.mockResolvedValueOnce({ v2TransactionsCursorResponse: { cursor: {
      data: [row(1n, buyerRef, callDigest, second.canonicalAccountRef)], hasMore: false, pageSize: 15,
    } } })
    const other = await second.owner.action(readHistory, {})
    expect(other).toMatchObject({ kind: 'available', entries: [{ sourceRef: null }] })
    const malformedCallRef = 'invocation:unrouteable-history-sale'
    await backend.run(async (ctx) => {
      const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', (q) => q.eq('callRef', callRef)).unique()
      if (call === null) throw new Error('history_sale_call_missing')
      await ctx.db.patch(call._id, { callRef: malformedCallRef })
    })
    ledger.listTransactions.mockResolvedValueOnce({ v2TransactionsCursorResponse: { cursor: {
      data: [row(1n, buyerRef, digestReference('call', malformedCallRef), first.canonicalAccountRef)],
      hasMore: false, pageSize: 15,
    } } })
    await expect(first.owner.action(readHistory, {})).resolves.toMatchObject({
      kind: 'available', entries: [{ sourceRef: null }], sourceLinkCoverage: 'unavailable',
    })
  })
})
