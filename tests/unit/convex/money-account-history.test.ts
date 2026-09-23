import { makeFunctionReference } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { convexTestWithMarketComponents, ownerAdmin, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { formanceAccountMetadataDigest } from '@/modules/money/formance-workflows'
import type { AccountHistoryResult } from '@/modules/money/public'

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
})
