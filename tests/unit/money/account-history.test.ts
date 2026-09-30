import { describe, expect, it, vi } from 'vitest'

import { readFormanceAccountHistory, type FormanceContext } from '@/modules/money/formance'
import { accountHistoryResultSchema } from '@/modules/money/public'

const accountDigest = 'a'.repeat(64)
const callDigest = 'b'.repeat(64)
const cursorKey = 'account-history-test-cursor-key-32-bytes'
const available = `accounts:${accountDigest}:available`
const reserved = `calls:${callDigest}:buyer_reserved`
const adjustment = `adjustments:${'c'.repeat(64)}:buyer`
const now = 10_000
const input = { accountDigest, cursorKey, now }

function posting(source: string, destination: string, amount: bigint, asset = 'AUD/6') {
  return { source, destination, amount, asset }
}
function transaction(id: bigint, template = 'FUNDING_SETTLED', postings = [posting('processor:one', available, 100n)]) {
  return { id, template, postings, timestamp: new Date(1000), insertedAt: new Date(2000),
    metadata: { account_digest: accountDigest, call_digest: callDigest },
    reference: `transaction:${id}`, reverted: false }
}
function page(data: unknown[], next?: string) {
  return { v2TransactionsCursorResponse: { cursor: { data, hasMore: next !== undefined, pageSize: 15,
    ...(next === undefined ? {} : { next }) } } }
}
function boundary(...pages: ReturnType<typeof page>[]) {
  const listTransactions = vi.fn()
  for (const response of pages) listTransactions.mockResolvedValueOnce(response)
  const context = { configuration: { ledger: 'test-ledger' }, sdk: { ledger: { v2: { listTransactions } } } } as unknown as FormanceContext
  return { context, listTransactions }
}

describe('booked Account history', () => {
  it('shows one exact signed effect per transaction and keeps document adjustments separate', async () => {
    const { context } = boundary(page([
      transaction(7n, 'FUNDING_SETTLED', [posting('world', 'processor:one', 112n),
        posting('processor:one', available, 100n), posting('processor:one', 'platform:revenue:sales', 10n),
        posting('processor:one', 'platform:tax:gst', 2n)]),
      transaction(6n, 'CALL_RESERVED_AUD', [posting(available, reserved, 60n)]),
      transaction(5n, 'BUYER_SALE_SETTLED', [posting(reserved, 'platform:revenue:sales', 50n),
        posting(reserved, 'platform:tax:gst', 10n), posting('agents:one:reserved', 'agents:one:spent', 60n)]),
      transaction(4n, 'CALL_RELEASED_AUD', [posting(reserved, available, 20n)]),
      transaction(3n, 'FUNDING_REVERSED', [posting(available, 'processor:one', 100n)]),
      transaction(2n, 'BUYER_ADJUSTED', [posting(adjustment, 'platform:revenue:sales', 5n)]),
      transaction(1n, 'PROVIDER_REVERSED', [posting('provider:one', 'treasury:one', 1n, 'USDC/6')]),
    ]))
    const result = accountHistoryResultSchema.parse(await readFormanceAccountHistory(context, input))
    expect(result).toMatchObject({ kind: 'available', coverage: 'complete', isDone: true, continueCursor: '',
      ordering: 'recorded_transaction_sequence_desc', sourceLinkCoverage: 'unavailable' })
    if (result.kind !== 'available') throw new Error(result.code)
    expect(result.entries.map((entry) => [entry.transactionId, entry.kind, entry.accountEffect.units, entry.documentEffectUnits]))
      .toEqual([['7', 'funding', '100', '0'], ['5', 'call_spend', '-60', '0'],
        ['3', 'funding_reversal', '-100', '0'], ['2', 'document_adjustment', '0', '-5']])
    expect(result.entries[1]).toMatchObject({
      transactionRef: 'transaction:5', sourceDigest: callDigest, sourceRef: null,
    })
  })

  it('distinguishes promotional issuance, use and expiry while omitting internal holds and zero purchased sales', async () => {
    const grant = `accounts:${accountDigest}:promo:${'d'.repeat(64)}:available`
    const held = `calls:${callDigest}:buyer_promo_reserved`
    const { context } = boundary(page([
      transaction(6n, 'PROMO_GRANTED', [posting('world', grant, 100n)]),
      transaction(5n, 'CALL_PROMO_RESERVED', [posting(grant, held, 60n)]),
      transaction(4n, 'CALL_PROMO_SETTLED', [posting(held, 'platform:expense:marketing', 60n)]),
      transaction(3n, 'CALL_PROMO_RELEASED', [posting(held, grant, 10n)]),
      transaction(2n, 'PROMO_EXPIRED', [posting(grant, 'world', 50n)]),
      transaction(1n, 'BUYER_SALE_SETTLED', [posting('agents:one:reserved', 'agents:one:spent', 60n)]),
    ]))
    const result = accountHistoryResultSchema.parse(await readFormanceAccountHistory(context, input))
    expect(result).toMatchObject({ kind: 'available', coverage: 'complete' })
    if (result.kind !== 'available') throw new Error(result.code)
    expect(result.entries.map(entry => [entry.kind, entry.accountEffect.units])).toEqual([
      ['promotional_grant', '100'], ['promotional_use', '-60'], ['promotional_expiry', '-50'],
    ])
  })

  it('uses the official cursor once per identity, including equal and backdated timestamps', async () => {
    const { context, listTransactions } = boundary(
      page([transaction(4n), { ...transaction(3n), timestamp: new Date(500) }], 'official:next'),
      page([transaction(2n), transaction(1n)]),
    )
    const first = await readFormanceAccountHistory(context, input)
    if (first.kind !== 'available') throw new Error(first.code)
    expect(first).toMatchObject({ isDone: false, entries: [{ transactionId: '4' }, { transactionId: '3', occurredAt: 500 }] })
    expect(first.continueCursor).not.toContain('official:next')
    const second = await readFormanceAccountHistory(context, { ...input, now: 20_000, cursor: first.continueCursor })
    expect(second).toMatchObject({ kind: 'available', snapshotAt: now, isDone: true,
      entries: [{ transactionId: '2' }, { transactionId: '1' }] })
    expect(listTransactions.mock.calls[0]?.[0]).toEqual({ ledger: 'test-ledger', pageSize: 15,
      pit: new Date(now), sort: 'id:desc', query: { $and: [
        { $match: { 'metadata[account_digest]': accountDigest } }, { $lte: { inserted_at: new Date(now).toISOString() } },
      ] } })
    expect(listTransactions.mock.calls[1]?.[0]).toEqual({ ledger: 'test-ledger', cursor: 'official:next' })
  })

  it('rejects cursor tampering, raw cursors, another Account, ledger, or rotated signing key before reading', async () => {
    const { context, listTransactions } = boundary(page([transaction(2n)], 'official:next'))
    const first = await readFormanceAccountHistory(context, input)
    if (first.kind !== 'available') throw new Error(first.code)
    for (const args of [
      { ...input, cursor: 'official:next' },
      { ...input, cursor: `x${first.continueCursor}` },
      { ...input, cursor: first.continueCursor, accountDigest: 'd'.repeat(64) },
      { ...input, cursor: first.continueCursor, cursorKey: 'rotated-account-history-key-32-bytes' },
    ]) await expect(readFormanceAccountHistory(context, args)).resolves.toEqual({ kind: 'refused', code: 'account_history_cursor_invalid' })
    await expect(readFormanceAccountHistory({ ...context, configuration: { ...context.configuration, ledger: 'other-ledger' } },
      { ...input, cursor: first.continueCursor })).resolves.toMatchObject({ kind: 'refused' })
    expect(listTransactions).toHaveBeenCalledTimes(1)
  })

  it('preserves native reverted originals and unmapped reversals without claiming complete netting', async () => {
    const { context } = boundary(page([
      transaction(3n, 'unrecognized', [posting(available, 'processor:one', 100n)]),
      { ...transaction(2n), reverted: true, revertedAt: new Date(9000) },
    ], 'official:next'), page([transaction(1n)]))
    const first = await readFormanceAccountHistory(context, input)
    expect(first).toMatchObject({ kind: 'available', coverage: 'partial', entries: [
      { kind: 'unmapped', accountEffect: { units: '-100' } },
      { kind: 'funding', accountEffect: { units: '100' }, reverted: true, revertedAt: 9000 },
    ] })
    if (first.kind !== 'available') throw new Error(first.code)
    await expect(readFormanceAccountHistory(context, { ...input, cursor: first.continueCursor }))
      .resolves.toMatchObject({ kind: 'available', coverage: 'partial', isDone: true })
  })

  it('retains reverted internal reservations even though their total Account effect is zero', async () => {
    const { context } = boundary(page([
      { ...transaction(1n, 'CALL_RESERVED_AUD', [posting(available, reserved, 50n)]),
        reverted: true, revertedAt: new Date(9000) },
    ]))
    await expect(readFormanceAccountHistory(context, input)).resolves.toMatchObject({ kind: 'available', coverage: 'partial',
      entries: [{ transactionId: '1', kind: 'unmapped', reverted: true, accountEffect: { units: '0' } }] })
  })

  it('selects source identity by transaction type and marks absent references as partial', async () => {
    const commandDigest = 'e'.repeat(64)
    const funding = { ...transaction(3n), metadata: { account_digest: accountDigest, call_digest: callDigest, command_digest: commandDigest } }
    const call = { ...transaction(2n, 'BUYER_SALE_SETTLED', [posting(reserved, 'platform:revenue:sales', 10n)]), metadata: funding.metadata }
    const row = transaction(1n)
    const { reference: _reference, ...withoutReference } = row
    const { context } = boundary(page([funding, call, withoutReference]))
    await expect(readFormanceAccountHistory(context, input)).resolves.toMatchObject({ kind: 'available', coverage: 'partial', entries: [
      { sourceDigest: commandDigest }, { sourceDigest: callDigest }, { transactionRef: null, sourceDigest: null },
    ] })
  })

  it.each([
    ['wrong Account metadata', { ...transaction(1n), metadata: { account_digest: 'd'.repeat(64) } }],
    ['foreign Account postings', transaction(1n, 'FUNDING_SETTLED', [posting('processor:one', `accounts:${'d'.repeat(64)}:available`, 1n)])],
    ['unattributed Call', transaction(1n, 'BUYER_SALE_SETTLED', [posting(`calls:${'d'.repeat(64)}:buyer_reserved`, 'platform:revenue:sales', 1n)])],
    ['unsafe money', transaction(1n, 'FUNDING_SETTLED', [posting('processor:one', available, 9007199254740992n)])],
    ['unsafe SDK transaction identity', transaction(9007199254740992n)],
    ['invalid timestamp', { ...transaction(1n), timestamp: new Date('invalid') }],
  ])('refuses invalid source attribution: %s', async (_label, row) => {
    const { context } = boundary(page([row]))
    await expect(readFormanceAccountHistory(context, input)).resolves.toEqual({ kind: 'unavailable', code: 'formance_history_attribution_invalid' })
  })

  it.each([
    ['duplicate identity', [transaction(2n), transaction(2n)], 'formance_history_order_invalid'],
    ['replayed previous page identity', [transaction(3n)], 'formance_history_order_invalid'],
    ['ascending identity', [transaction(1n), transaction(2n)], 'formance_history_order_invalid'],
    ['late backdated insertion', [{ ...transaction(1n), insertedAt: new Date(now + 1) }], 'formance_history_snapshot_invalid'],
    ['future effective timestamp', [{ ...transaction(1n), timestamp: new Date(now + 1) }], 'formance_history_snapshot_invalid'],
  ])('does not report a complete history for %s', async (_label, rows, code) => {
    const { context } = boundary(page([transaction(3n)], 'official:next'), page(rows))
    const first = await readFormanceAccountHistory(context, input)
    if (first.kind !== 'available') throw new Error(first.code)
    await expect(readFormanceAccountHistory(context, { ...input, cursor: first.continueCursor })).resolves.toEqual({ kind: 'unavailable', code })
  })

  it('keeps mismatched mapped templates and absent recorded times visible with partial coverage', async () => {
    const row = transaction(1n)
    const { insertedAt: _insertedAt, ...withoutRecordedTime } = row
    const { context } = boundary(page([
      transaction(3n, 'FUNDING_SETTLED', [posting(available, 'processor:one', 100n)]),
      transaction(2n, 'unknown_template', []), withoutRecordedTime,
    ]))
    await expect(readFormanceAccountHistory(context, input)).resolves.toMatchObject({ kind: 'available', coverage: 'partial', entries: [
      { kind: 'unmapped', accountEffect: { units: '-100' } }, { kind: 'unmapped' }, { recordedAt: null },
    ] })
  })

  it('returns unavailable on provider failure and on non-advancing pagination, never empty-complete', async () => {
    const { context, listTransactions } = boundary()
    listTransactions.mockRejectedValueOnce(new Error('provider offline'))
    await expect(readFormanceAccountHistory(context, input)).resolves.toEqual({ kind: 'unavailable', code: 'formance_read_unavailable' })
    listTransactions.mockResolvedValueOnce(page([], 'official:next'))
    await expect(readFormanceAccountHistory(context, input)).resolves.toEqual({ kind: 'unavailable', code: 'formance_history_response_invalid' })
  })
})
