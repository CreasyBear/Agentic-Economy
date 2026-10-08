import { describe, expect, it, vi } from 'vitest'
import { readFormancePeriodSpend, type FormanceContext } from '@/modules/money/formance'

const accountDigest = 'a'.repeat(64)
const legal = `legal_customers:${'b'.repeat(64)}`
const reference = `ae-p4:${'c'.repeat(64)}:settle-buyer`
const input = { accountDigest, periodStartAt: 100, periodEndAt: 2000, now: 3000 }
function sale(id = 1n) {
  return { id, reference, template: 'BUYER_SALE_SETTLED', timestamp: new Date(1000),
    insertedAt: new Date(1100), reverted: false, metadata: { account_digest: accountDigest },
    postings: [{ source: `${legal}:exposure_reserved`, destination: `${legal}:exposure_settled`, asset: 'AUD/6', amount: 7n }] }
}
function fixture(rows: ReturnType<typeof sale>[], next?: string) {
  const listTransactions = vi.fn().mockResolvedValue({ v2TransactionsCursorResponse: {
    cursor: { data: rows, hasMore: next !== undefined, ...(next === undefined ? {} : { next }) },
  } })
  const context = { configuration: { ledger: 'fixture' }, sdk: { ledger: { v2: { listTransactions } } } } as unknown as FormanceContext
  return { context, listTransactions }
}

describe('complete native Account gross-sale snapshot', () => {
  it('returns exact gross exposure with native ID high-water', async () => {
    const { context, listTransactions } = fixture([sale()])
    expect(await readFormancePeriodSpend(context, input)).toMatchObject({ kind: 'available', spendUnits: '7',
      periodStartAt: 100, periodEndAt: 2000, snapshotAt: 3000, highWaterTransactionId: '1', coverage: 'complete',
      sales: [{ reference, units: '7', effectiveAt: 1000 }] })
    expect(listTransactions.mock.calls[0]?.[0]).toMatchObject({ sort: 'id:desc',
      query: { $and: [ { $match: { 'metadata[account_digest]': accountDigest } },
        { $gte: { timestamp: new Date(100).toISOString() } }, { $lt: { timestamp: new Date(2000).toISOString() } },
        ] } })
    expect(listTransactions.mock.calls[0]?.[0]).not.toHaveProperty('pit')
  })

  it('returns proof for a complete empty source', async () => {
    const { context } = fixture([])
    expect(await readFormancePeriodSpend(context, input)).toEqual({ kind: 'empty',
      periodStartAt: 100, periodEndAt: 2000, snapshotAt: 3000, highWaterTransactionId: null, coverage: 'complete', sales: [] })
  })

  it('preserves gross sale after a separate settled-sale refund', async () => {
    const refund = { ...sale(2n), template: 'BUYER_SALE_REFUNDED', reference: `ae-p4:${'d'.repeat(64)}:buyer`,
      postings: [{ source: `${legal}:exposure_settled`, destination: `${legal}:exposure_available`, asset: 'AUD/6', amount: 7n }] }
    const { context } = fixture([refund, sale()])
    expect(await readFormancePeriodSpend(context, input)).toMatchObject({ kind: 'available', spendUnits: '7', sales: [{ reference }] })
  })

  it('excludes proven native reversion rather than netting application refunds', async () => {
    const reverted = { ...sale(), reverted: true, revertedAt: new Date(1200) }
    const { context } = fixture([reverted])
    expect(await readFormancePeriodSpend(context, input)).toMatchObject({ kind: 'empty', coverage: 'complete', sales: [] })
  })

  it.each(['foreign', 'invalid_insert', 'missing_insert', 'invalid_revert', 'missing_ref', 'outside_period', 'duplicate_id', 'duplicate_ref', 'extra_exposure'])('fails closed on %s', async fault => {
    const row: Record<string, unknown> = sale()
    if (fault === 'foreign') row.metadata = { account_digest: 'f'.repeat(64) }
    if (fault === 'invalid_insert') row.insertedAt = new Date(Number.NaN)
    if (fault === 'missing_insert') delete row.insertedAt
    if (fault === 'invalid_revert') { row.reverted = true; row.revertedAt = new Date(Number.NaN) }
    if (fault === 'missing_ref') delete row.reference
    if (fault === 'outside_period') row.timestamp = new Date(2000)
    if (fault === 'extra_exposure') row.postings = [...sale().postings, ...sale().postings]
    const rows = [row as ReturnType<typeof sale>]
    if (fault === 'duplicate_id') rows.push(sale())
    if (fault === 'duplicate_ref') rows.push(sale(0n))
    const { context } = fixture(rows)
    expect(await readFormancePeriodSpend(context, input)).toMatchObject({ kind: expect.stringMatching(/^(unavailable|setup_required)$/u) })
  })

  it('includes an already committed sale whose native clock is ahead of the app clock', async () => {
    const row = { ...sale(), timestamp: new Date(1500), insertedAt: new Date(5000) }
    const { context } = fixture([row])
    expect(await readFormancePeriodSpend(context, { ...input, now: 1200 })).toMatchObject({
      kind: 'available', snapshotAt: 1200, highWaterTransactionId: '1', spendUnits: '7',
      sales: [{ reference, units: '7', effectiveAt: 1500 }],
    })
  })

  it('rejects a newly appended higher ID returned by a continuation', async () => {
    const { context, listTransactions } = fixture([sale(5n)], 'next')
    listTransactions.mockResolvedValueOnce({ v2TransactionsCursorResponse: { cursor: {
      data: [sale(5n)], hasMore: true, next: 'next',
    } } }).mockResolvedValueOnce({ v2TransactionsCursorResponse: { cursor: {
      data: [{ ...sale(6n), reference: `ae-p4:${'e'.repeat(64)}:settle-buyer` }], hasMore: false,
    } } })
    expect(await readFormancePeriodSpend(context, input)).toMatchObject({ kind: 'unavailable', code: 'formance_spend_snapshot_invalid' })
  })

  it('fails closed on an empty continuation page and repeated cursors', async () => {
    const { context } = fixture([], 'repeat')
    expect(await readFormancePeriodSpend(context, input)).toMatchObject({ kind: 'unavailable' })
    const repeated = fixture([sale()], 'repeat')
    expect(await readFormancePeriodSpend(repeated.context, input)).toMatchObject({ kind: 'unavailable' })
  })
})
