import { describe, expect, it, vi } from 'vitest'
import type { FormanceContext } from '@/modules/money/formance'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { treasuryBufferAccount } from '@/modules/money/formance-treasury'
import { readFormanceTreasurySnapshot, TREASURY_SNAPSHOT_TRANSACTION_LIMIT } from '@/modules/money/formance-treasury-snapshot'

const DAY = 86_400_000
const snapshotAt = Date.now() - 10_000
const input = { custodyRef: 'custody:snapshot', custodyGeneration: 2, snapshotAt }
const capacityDigest = canonicalDigest({ format: 'ae.formance-account-segment:v1', value: {
  kind: 'treasury_usdc', reference: { subjectRef: input.custodyRef, generation: input.custodyGeneration },
} }).slice(7)
const availableAddress = `treasury:corporate:${capacityDigest}:available`
const committedAddress = availableAddress.replace(/:available$/u, ':committed')
const digest = 'a'.repeat(64)
const otherDigest = 'b'.repeat(64)
type AccountVersion = { address: string; asset: string; units: bigint; at: number; effectiveAt?: number }
type Transaction = {
  id: bigint; reference: string; timestamp: Date; reverted: boolean; template: string
  insertedAt?: Date; revertedAt?: Date
  metadata: Record<string, string>
  postings: { source: string; destination: string; amount: bigint; asset: string }[]
}
function settlement(id: number, at = snapshotAt - 1, amount = 20n): Transaction {
  return {
    id: BigInt(id), reference: `ae-p4:${id.toString(16).padStart(64, '0')}:provider-settled`,
    timestamp: new Date(at), insertedAt: new Date(snapshotAt - 2), reverted: false, template: 'PROVIDER_SETTLED',
    metadata: { call_digest: digest, external_evidence_digest: otherDigest },
    postings: [
      { source: committedAddress, destination: `providers:${digest}:settlement`, asset: 'USDC/6', amount },
      { source: `provider_obligations:${digest}:accrued`, destination: `provider_obligations:${digest}:settled`, asset: 'USDC/6', amount },
    ],
  }
}

/** SDK boundary fixture: empty address segments match exactly one segment, per official Formance query docs. */
function harness(accounts: AccountVersion[] = [], transactions: Transaction[] = []) {
  const cursorResults = new Map<string, Transaction[]>()
  const getBalancesAggregated = vi.fn(async (request: { pit: Date; useInsertionDate: boolean; query: { $match: { address: string } } }) => {
    const selected = new Map<string, AccountVersion>()
    const pattern = request.query.$match.address.split(':')
    for (const account of accounts) {
      const parts = account.address.split(':')
      const accountClock = request.useInsertionDate ? account.at : account.effectiveAt ?? account.at
      if (accountClock > request.pit.getTime() || parts.length !== pattern.length
        || !pattern.every((part, index) => part === '' || parts[index] === part)) continue
      const key = `${account.address}/${account.asset}`
      if ((selected.get(key)?.at ?? -1) <= account.at) selected.set(key, account)
    }
    const data: Record<string, bigint> = {}
    for (const account of selected.values()) data[account.asset] = (data[account.asset] ?? 0n) + account.units
    return { v2AggregateBalancesResponse: { data } }
  })
  const listTransactions = vi.fn(async (request: { cursor?: string; pit?: Date; query?: { $and: unknown[] } }) => {
    const source = (request.query?.$and[0] as { $match: { source: string } } | undefined)?.$match.source
    const lower = (request.query?.$and[1] as { $gte: { timestamp: string } } | undefined)?.$gte.timestamp
    const insertedCutoff = (request.query?.$and[3] as { $lte: { inserted_at: string } } | undefined)?.$lte.inserted_at
    const rows = request.cursor === undefined ? transactions.filter(row => row.timestamp.getTime() < request.pit!.getTime()
      && row.timestamp.getTime() >= new Date(lower!).getTime()
      && (insertedCutoff === undefined || (row.insertedAt?.getTime() ?? Number.POSITIVE_INFINITY) <= new Date(insertedCutoff).getTime())
      && row.postings.some(posting => posting.source === source))
      : cursorResults.get(request.cursor)!
    if (request.cursor !== undefined) cursorResults.delete(request.cursor)
    const data = rows.slice(0, 15)
    const rest = rows.slice(15)
    const next = rest.length === 0 ? undefined : `cursor:${String(data.at(-1)!.id)}`
    if (next !== undefined) cursorResults.set(next, rest)
    return { v2TransactionsCursorResponse: { cursor: { data, hasMore: rest.length > 0, next } } }
  })
  const context = { configuration: { environment: 'production', ledger: 'snapshot-ledger' },
    sdk: { ledger: { v2: { getBalancesAggregated, listTransactions } } } } as unknown as FormanceContext
  return { context, getBalancesAggregated, listTransactions }
}

describe('native treasury snapshot', () => {
  it('separates cash/buffer and purchased/promotional liability at the same PIT, excluding other account families', async () => {
    const version = (address: string, asset: string, units: bigint, at = snapshotAt - 1): AccountVersion => ({ address, asset, units, at })
    const fixture = harness([
      version(availableAddress, 'USDC/6', 100n), version(availableAddress, 'USDC/6', 999n, snapshotAt + 1),
      version(committedAddress, 'USDC/6', 20n), version(treasuryBufferAccount(input), 'USDC/6', 7n),
      version(`accounts:${digest}:available`, 'AUD/6', 60n), version(`calls:${digest}:buyer_reserved`, 'AUD/6', 10n),
      version(`accounts:${digest}:promo:${otherDigest}:available`, 'AUD/6', 5n), version(`calls:${digest}:buyer_promo_reserved`, 'AUD/6', 2n),
      version(`accounts:${digest}:promo:${otherDigest}:expired`, 'AUD/6', 900n),
      version(`agents:${digest}:budget_available`, 'AUD/6', 900n), version(`legal_customers:${digest}:exposure_available`, 'AUD/6', 900n),
      version(`accounts:${digest}:available:invalid-child`, 'AUD/6', 900n), version(`calls:${digest}:buyer_reserved:invalid-child`, 'AUD/6', 900n),
    ])
    expect(await readFormanceTreasurySnapshot(fixture.context, input)).toMatchObject({
      kind: 'available', snapshotAt, source: 'formance_pit_read', authoritativeForConsequences: false,
      treasury: { availableUnits: '100', committedUnits: '20', bufferUnits: '7' },
      liabilityAud: { purchasedAvailableUnits: '60', purchasedReservedUnits: '10', purchasedTotalUnits: '70',
        promotionalAvailableUnits: '5', promotionalReservedUnits: '2', promotionalTotalUnits: '7' },
    })
    expect(fixture.getBalancesAggregated).toHaveBeenCalledTimes(7)
    expect(fixture.getBalancesAggregated.mock.calls.every(([request]) => request.pit.getTime() === snapshotAt)).toBe(true)
    expect(fixture.getBalancesAggregated.mock.calls.every(([request]) => request.useInsertionDate === true)).toBe(true)
    expect(fixture.getBalancesAggregated.mock.calls.map(([request]) => request.query.$match.address)).toEqual([
      availableAddress, committedAddress, treasuryBufferAccount(input),
      'accounts::available', 'calls::buyer_reserved', 'accounts::promo::available', 'calls::buyer_promo_reserved',
    ])
  })

  it('counts only the cash settlement posting across pages, preserving exact cutoff boundaries and audit references', async () => {
    const current = settlement(1, snapshotAt - DAY, 20n)
    const old = settlement(2, snapshotAt - 7 * DAY, 30n)
    const reversed = { ...settlement(3), reverted: true, revertedAt: new Date(snapshotAt - 1) }
    const compensation = { ...settlement(4), metadata: { 'com.formance.spec/state/reverts': '3' } }
    const otherGeneration = { ...settlement(5), postings: [{ ...settlement(5).postings[0]!, source: 'treasury:corporate:another:committed' }] }
    const unrelated = { ...settlement(6), template: 'CALL_RELEASED_USDC' }
    const fixture = harness([], [current, old, reversed, compensation, otherGeneration, unrelated,
      settlement(7, snapshotAt - 7 * DAY - 1), settlement(8, snapshotAt),
      ...Array.from({ length: 16 }, (_, index) => settlement(index + 20, snapshotAt - 1, 1n)),
    ])
    const result = await readFormanceTreasurySnapshot(fixture.context, input)
    expect(result).toMatchObject({ kind: 'available', settledUsdc: {
      basis: 'gross_provider_payments',
      last24hUnits: '36', last7dUnits: '66', oldestSettledAt: old.timestamp.getTime(), newestSettledAt: snapshotAt - 1,
    } })
    if (result.kind !== 'available') throw new Error('snapshot_unavailable')
    expect(result.settledUsdc.settlements).toHaveLength(18)
    expect(result.settledUsdc.settlements[0]).toEqual({ commandRef: current.reference, settledAt: current.timestamp.getTime(),
      amountUnits: '20', callDigest: digest, externalEvidenceDigest: otherDigest })
    expect(fixture.listTransactions).toHaveBeenCalledTimes(2)
    expect(fixture.listTransactions.mock.calls[0]?.[0]).toMatchObject({ pit: new Date(snapshotAt), query: { $and: [
      { $match: { source: committedAddress } }, { $gte: { timestamp: new Date(snapshotAt - 7 * DAY).toISOString() } },
      { $lt: { timestamp: new Date(snapshotAt).toISOString() } },
      { $lte: { inserted_at: new Date(snapshotAt).toISOString() } },
    ] } })
    expect(fixture.listTransactions.mock.calls[1]?.[0]).toEqual({ ledger: 'snapshot-ledger', cursor: expect.any(String) })
  })

  it('reports genuine empty native balances and burn as zero with absent audit times', async () => {
    const fixture = harness()
    expect(await readFormanceTreasurySnapshot(fixture.context, input)).toMatchObject({ kind: 'available',
      treasury: { availableUnits: '0', committedUnits: '0', bufferUnits: '0' },
      settledUsdc: { basis: 'gross_provider_payments', last24hUnits: '0', last7dUnits: '0', settlements: [], oldestSettledAt: null, newestSettledAt: null },
    })
  })

  it('excludes backdated funding inserted after the cutoff from every liability family and treasury cash', async () => {
    const accounts: AccountVersion[] = [availableAddress, committedAddress, treasuryBufferAccount(input),
      `accounts:${digest}:available`, `calls:${digest}:buyer_reserved`,
      `accounts:${digest}:promo:${otherDigest}:available`, `calls:${digest}:buyer_promo_reserved`,
    ].flatMap(address => [
      { address, asset: address.startsWith('treasury:') ? 'USDC/6' : 'AUD/6', units: 5n, at: snapshotAt - 1 },
      { address, asset: address.startsWith('treasury:') ? 'USDC/6' : 'AUD/6', units: 900n,
        at: snapshotAt + 1, effectiveAt: snapshotAt - DAY },
    ])
    const fixture = harness(accounts)
    expect(await readFormanceTreasurySnapshot(fixture.context, input)).toMatchObject({ kind: 'available',
      treasury: { availableUnits: '5', committedUnits: '5', bufferUnits: '5' },
      liabilityAud: { purchasedAvailableUnits: '5', purchasedReservedUnits: '5', purchasedTotalUnits: '10',
        promotionalAvailableUnits: '5', promotionalReservedUnits: '5', promotionalTotalUnits: '10' },
    })
  })

  it('filters a backdated provider payment inserted after the cutoff without changing gross totals', async () => {
    const late = { ...settlement(2, snapshotAt - DAY, 900n), insertedAt: new Date(snapshotAt + 1) }
    const fixture = harness([], [settlement(1, snapshotAt - 1, 5n), late])
    expect(await readFormanceTreasurySnapshot(fixture.context, input)).toMatchObject({ kind: 'available', settledUsdc: {
      basis: 'gross_provider_payments', last24hUnits: '5', last7dUnits: '5',
      settlements: [{ commandRef: settlement(1).reference, amountUnits: '5' }],
    } })
  })

  it.each(['later_insert', 'missing_insert', 'invalid_insert', 'later_revert', 'missing_revert', 'invalid_revert'] as const)(
    'refuses %s time evidence before counting or skipping a settlement', async fault => {
      const row = settlement(1)
      if (fault === 'later_insert') row.insertedAt = new Date(snapshotAt + 1)
      if (fault === 'missing_insert') delete row.insertedAt
      if (fault === 'invalid_insert') row.insertedAt = new Date(Number.NaN)
      if (fault === 'later_revert') { row.reverted = true; row.revertedAt = new Date(snapshotAt + 1) }
      if (fault === 'missing_revert') row.reverted = true
      if (fault === 'invalid_revert') { row.reverted = true; row.revertedAt = new Date(Number.NaN) }
      const fixture = harness()
      // Inject directly to establish the local guard even if a server query ignores its insertion filter.
      fixture.listTransactions.mockResolvedValueOnce({ v2TransactionsCursorResponse: { cursor: { data: [row], hasMore: false, next: undefined } } })
      const result = await readFormanceTreasurySnapshot(fixture.context, input)
      expect(result).toEqual({ kind: 'unavailable', code: 'formance_treasury_snapshot_cutoff_invalid' })
      expect(result).not.toHaveProperty('settledUsdc')
    },
  )

  it('keeps provider returns separate from the gross provider payment rate', async () => {
    const returned = { ...settlement(2, snapshotAt - 1, 3n), template: 'PROVIDER_REVERSED' }
    const fixture = harness([], [settlement(1, snapshotAt - 1, 5n), returned])
    expect(await readFormanceTreasurySnapshot(fixture.context, input)).toMatchObject({ kind: 'available',
      settledUsdc: { basis: 'gross_provider_payments', last24hUnits: '5', last7dUnits: '5' },
    })
  })

  it.each([{ snapshotAt: -1 }, { snapshotAt: Date.now() + DAY }, { snapshotAt: 1.5 },
    { custodyRef: '' }, { custodyGeneration: 0 }])('refuses invalid input before native reads: %j', async change => {
    const fixture = harness()
    expect(await readFormanceTreasurySnapshot(fixture.context, { ...input, ...change })).toMatchObject({ kind: 'setup_required' })
    expect(fixture.getBalancesAggregated).not.toHaveBeenCalled()
    expect(fixture.listTransactions).not.toHaveBeenCalled()
  })

  it.each([9007199254740992n, -1n, '01', false, null])('refuses malformed or unsafe native units %s', async units => {
    const fixture = harness()
    fixture.getBalancesAggregated.mockResolvedValueOnce({ v2AggregateBalancesResponse: { data: { 'USDC/6': units } } } as never)
    expect(await readFormanceTreasurySnapshot(fixture.context, input)).toMatchObject({ kind: 'setup_required', code: 'formance_unsafe_integer' })
  })

  it('refuses overflow when independently safe liability components are combined', async () => {
    const fixture = harness([{ address: `accounts:${digest}:available`, asset: 'AUD/6', units: 9007199254740991n, at: 1 },
      { address: `calls:${digest}:buyer_reserved`, asset: 'AUD/6', units: 1n, at: 1 }])
    expect(await readFormanceTreasurySnapshot(fixture.context, input)).toMatchObject({ kind: 'setup_required', code: 'formance_unsafe_integer' })
  })

  it('refuses malformed aggregate payloads instead of returning invented zero', async () => {
    const fixture = harness()
    fixture.getBalancesAggregated.mockResolvedValueOnce({} as never)
    expect(await readFormanceTreasurySnapshot(fixture.context, input)).toMatchObject({ kind: 'unavailable' })
  })

  it.each(['missing', 'repeated', 'empty_page'] as const)('refuses %s cursor without exposing partial totals', async fault => {
    const fixture = harness()
    let sequence = 0
    fixture.listTransactions.mockImplementation(async () => ({ v2TransactionsCursorResponse: { cursor: {
      data: fault === 'empty_page' ? [] : [settlement(++sequence)], hasMore: true,
      next: fault === 'missing' ? undefined : 'same-cursor',
    } } }))
    const result = await readFormanceTreasurySnapshot(fixture.context, input)
    expect(result).toMatchObject({ kind: 'unavailable' })
    expect(result).not.toHaveProperty('settledUsdc')
  })

  it('refuses a complete-looking but duplicate transaction page', async () => {
    const fixture = harness([], [settlement(1), settlement(1)])
    expect(await readFormanceTreasurySnapshot(fixture.context, input)).toMatchObject({ kind: 'unavailable', code: 'formance_treasury_snapshot_transactions_invalid' })
  })

  it('refuses a window beyond the bounded native traversal', async () => {
    const fixture = harness([], Array.from({ length: TREASURY_SNAPSHOT_TRANSACTION_LIMIT + 1 }, (_, index) => settlement(index + 1)))
    expect(await readFormanceTreasurySnapshot(fixture.context, input)).toEqual({ kind: 'unavailable', code: 'formance_treasury_snapshot_window_incomplete' })
  })

  it.each(['unsafe_units', 'missing_cash', 'duplicate_cash', 'wrong_payee', 'missing_reference', 'invalid_time'] as const)('refuses invalid settlement evidence %s', async fault => {
    const row = settlement(1)
    if (fault === 'unsafe_units') row.postings[0]!.amount = 9007199254740992n
    if (fault === 'missing_cash') row.postings = row.postings.slice(1)
    if (fault === 'duplicate_cash') row.postings.push(row.postings[0]!)
    if (fault === 'wrong_payee') row.postings[0]!.destination = 'world'
    if (fault === 'missing_reference') row.reference = ''
    if (fault === 'invalid_time') row.timestamp = new Date(Number.NaN)
    const fixture = harness()
    fixture.listTransactions.mockResolvedValueOnce({ v2TransactionsCursorResponse: { cursor: { data: [row], hasMore: false, next: undefined } } })
    expect(await readFormanceTreasurySnapshot(fixture.context, input)).toMatchObject({ kind: fault === 'unsafe_units' ? 'setup_required' : 'unavailable' })
  })

  it('surfaces native availability failures without publishing partially successful metrics', async () => {
    const fixture = harness()
    fixture.listTransactions.mockRejectedValueOnce(new Error('native ledger unavailable'))
    expect(await readFormanceTreasurySnapshot(fixture.context, input)).toEqual({ kind: 'unavailable', code: 'formance_treasury_snapshot_read_unavailable' })
  })
})
