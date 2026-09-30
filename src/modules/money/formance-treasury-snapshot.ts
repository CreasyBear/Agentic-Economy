"use node"

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { formanceSafeUnitsFromSdk, NO_RETRY, type FormanceContext } from './internal/formance-config'
import { capacityAccount } from './internal/formance-transaction-templates'
import { treasuryBufferAccount, type FormanceTreasuryBalanceSubject } from './formance-treasury'

const DAY_MS = 24 * 60 * 60 * 1_000
const PAGE_SIZE = 15
export const TREASURY_SNAPSHOT_TRANSACTION_LIMIT = 10_000
const DIGEST = /^[a-f0-9]{64}$/u
const REFERENCE = /^ae-p4:[a-f0-9]{64}(?::[a-z0-9_-]{1,32})?$/u
const PROVIDER_SETTLEMENT = /^providers:[a-f0-9]{64}:settlement$/u

export type FormanceTreasurySnapshotInput = FormanceTreasuryBalanceSubject & Readonly<{ snapshotAt: number }>
export type FormanceTreasurySnapshotSettlement = Readonly<{
  commandRef: string
  settledAt: number
  amountUnits: string
  callDigest: string | null
  externalEvidenceDigest: string | null
}>
type SnapshotFailure = Readonly<{ kind: 'setup_required' | 'unavailable'; code: string }>
export type FormanceTreasurySnapshotResult =
  | SnapshotFailure
  | Readonly<{
      kind: 'available'
      snapshotAt: number
      source: 'formance_pit_read'
      authoritativeForConsequences: false
      treasury: Readonly<{ availableUnits: string; committedUnits: string; bufferUnits: string }>
      settledUsdc: Readonly<{
        basis: 'gross_provider_payments'
        last24hUnits: string; last7dUnits: string
        oldestSettledAt: number | null; newestSettledAt: number | null
        settlements: readonly FormanceTreasurySnapshotSettlement[]
      }>
      liabilityAud: Readonly<{
        purchasedAvailableUnits: string; purchasedReservedUnits: string; purchasedTotalUnits: string
        promotionalAvailableUnits: string; promotionalReservedUnits: string; promotionalTotalUnits: string
      }>
    }>

type UnitsRead = Readonly<{ kind: 'available'; units: string }> | SnapshotFailure
const unavailable = (code: string): SnapshotFailure => ({ kind: 'unavailable', code })
const invalid = (code: string): SnapshotFailure => ({ kind: 'setup_required', code })
function nativeUnits(value: unknown): string | undefined {
  return typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string'
    ? formanceSafeUnitsFromSdk(value) : undefined
}

/**
 * Requires: a configured ledger, current custody identity and a non-future safe server cutoff.
 * Ensures: treasury cash and AUD liability use insertion-time PIT; complete gross provider payments
 * use effective-time 24h/7d windows with insertion/reversion evidence bounded by that same cutoff.
 * Invariant: exact integer units; protected buffer remains separate; each settlement's cash posting counts once.
 * On violation: explicit setup_required/unavailable; no partial totals, native writes or financial authority.
 * COMPLEXITY: one adapter and result union absorb native query/PIT/pagination rules for the snapshot caller.
 * Added: seven native aggregates and one bounded settlement traversal. Bought: callers cannot mix cutoffs,
 * liability families or obligation postings. Keep: existing live balance helper cannot provide this contract.
 */
export async function readFormanceTreasurySnapshot(
  context: FormanceContext,
  input: FormanceTreasurySnapshotInput,
): Promise<FormanceTreasurySnapshotResult> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/u.test(input.custodyRef)
    || !Number.isSafeInteger(input.custodyGeneration) || input.custodyGeneration < 1
    || !Number.isSafeInteger(input.snapshotAt) || input.snapshotAt < 0 || input.snapshotAt > Date.now()) {
    return invalid('formance_treasury_snapshot_input_invalid')
  }
  const availableAddress = capacityAccount('treasury_usdc', input.custodyRef, input.custodyGeneration)
  const committedAddress = availableAddress.replace(/:available$/u, ':committed')
  // Formance's empty segment matches ONE segment, not an arbitrary descendant:
  // https://docs.formance.com/modules/ledger/working-with-the-ledger/filtering-queries
  // These families mirror FORMANCE_SCHEMA.chart: reserved money lives under calls, never accounts.
  const results = await Promise.all([
    readAggregate(context, input.snapshotAt, availableAddress, 'USDC/6'),
    readAggregate(context, input.snapshotAt, committedAddress, 'USDC/6'),
    readAggregate(context, input.snapshotAt, treasuryBufferAccount(input), 'USDC/6'),
    readAggregate(context, input.snapshotAt, 'accounts::available', 'AUD/6'),
    readAggregate(context, input.snapshotAt, 'calls::buyer_reserved', 'AUD/6'),
    readAggregate(context, input.snapshotAt, 'accounts::promo::available', 'AUD/6'),
    readAggregate(context, input.snapshotAt, 'calls::buyer_promo_reserved', 'AUD/6'),
  ])
  const [available, committed, buffer, purchasedAvailable, purchasedReserved, promotionalAvailable, promotionalReserved] = results
  if (available === undefined || committed === undefined || buffer === undefined || purchasedAvailable === undefined
    || purchasedReserved === undefined || promotionalAvailable === undefined || promotionalReserved === undefined) {
    return unavailable('formance_treasury_snapshot_response_invalid')
  }
  if (available.kind !== 'available') return available
  if (committed.kind !== 'available') return committed
  if (buffer.kind !== 'available') return buffer
  if (purchasedAvailable.kind !== 'available') return purchasedAvailable
  if (purchasedReserved.kind !== 'available') return purchasedReserved
  if (promotionalAvailable.kind !== 'available') return promotionalAvailable
  if (promotionalReserved.kind !== 'available') return promotionalReserved
  const purchasedTotalUnits = formanceSafeUnitsFromSdk(BigInt(purchasedAvailable.units) + BigInt(purchasedReserved.units))
  const promotionalTotalUnits = formanceSafeUnitsFromSdk(BigInt(promotionalAvailable.units) + BigInt(promotionalReserved.units))
  if (purchasedTotalUnits === undefined || promotionalTotalUnits === undefined) return invalid('formance_unsafe_integer')
  const payments = await readSettledProviderPayments(context, input.snapshotAt, committedAddress)
  if (payments.kind !== 'available') return payments
  return {
    kind: 'available', snapshotAt: input.snapshotAt, source: 'formance_pit_read', authoritativeForConsequences: false,
    treasury: { availableUnits: available.units, committedUnits: committed.units, bufferUnits: buffer.units },
    settledUsdc: payments.value,
    liabilityAud: {
      purchasedAvailableUnits: purchasedAvailable.units, purchasedReservedUnits: purchasedReserved.units, purchasedTotalUnits,
      promotionalAvailableUnits: promotionalAvailable.units, promotionalReservedUnits: promotionalReserved.units, promotionalTotalUnits,
    },
  }
}

async function readAggregate(context: FormanceContext, snapshotAt: number, address: string, asset: string): Promise<UnitsRead> {
  try {
    const response = await context.sdk.ledger.v2.getBalancesAggregated({
      ledger: context.configuration.ledger, pit: new Date(snapshotAt), useInsertionDate: true,
      query: { $match: { address } },
    }, NO_RETRY)
    const data = response.v2AggregateBalancesResponse?.data
    if (data === undefined || data === null || typeof data !== 'object' || Array.isArray(data)) {
      return unavailable('formance_treasury_snapshot_response_invalid')
    }
    // A valid empty aggregate is zero. A missing/malformed response is never zero.
    for (const amount of Object.values(data)) {
      if (nativeUnits(amount) === undefined) return invalid('formance_unsafe_integer')
    }
    const units = nativeUnits(data[asset] ?? 0n)
    return units === undefined ? invalid('formance_unsafe_integer') : { kind: 'available', units }
  } catch (cause) {
    return degradeBackend(cause, unavailable('formance_treasury_snapshot_read_unavailable'), {
      site: 'readFormanceTreasurySnapshot.aggregate', reason: 'source_unavailable',
    })
  }
}

async function readSettledProviderPayments(context: FormanceContext, snapshotAt: number, committedAddress: string): Promise<
  SnapshotFailure | Readonly<{ kind: 'available'; value: Extract<FormanceTreasurySnapshotResult, { kind: 'available' }>['settledUsdc'] }>
> {
  const windowStart = Math.max(0, snapshotAt - 7 * DAY_MS)
  const dayStart = Math.max(0, snapshotAt - DAY_MS)
  const cursors = new Set<string>()
  const transactionIds = new Set<string>()
  const references = new Set<string>()
  const settlements: FormanceTreasurySnapshotSettlement[] = []
  let cursor: string | undefined
  let visited = 0
  let last24h = 0n
  let last7d = 0n
  try {
    do {
      const response = await context.sdk.ledger.v2.listTransactions(cursor === undefined ? {
        ledger: context.configuration.ledger, pit: new Date(snapshotAt), pageSize: PAGE_SIZE, sort: 'id:asc',
        query: { $and: [
          { $match: { source: committedAddress } },
          { $gte: { timestamp: new Date(windowStart).toISOString() } },
          { $lt: { timestamp: new Date(snapshotAt).toISOString() } },
          // Ledger 2.4.12 transaction PIT bounds effective time, not later backdated inserts.
          { $lte: { inserted_at: new Date(snapshotAt).toISOString() } },
        ] },
      } : { ledger: context.configuration.ledger, cursor }, NO_RETRY)
      const page = response.v2TransactionsCursorResponse?.cursor
      if (page === undefined || !Array.isArray(page.data) || page.data.length > PAGE_SIZE || typeof page.hasMore !== 'boolean') {
        return unavailable('formance_treasury_snapshot_response_invalid')
      }
      visited += page.data.length
      if (visited > TREASURY_SNAPSHOT_TRANSACTION_LIMIT) return unavailable('formance_treasury_snapshot_window_incomplete')
      for (const transaction of page.data) {
        if (typeof transaction.id !== 'bigint' || transaction.id < 0n || transactionIds.has(String(transaction.id))) {
          return unavailable('formance_treasury_snapshot_transactions_invalid')
        }
        transactionIds.add(String(transaction.id))
        const timestamp = transaction.timestamp instanceof Date ? transaction.timestamp.getTime() : Number.NaN
        if (!Number.isSafeInteger(timestamp) || timestamp < windowStart || timestamp >= snapshotAt
          || typeof transaction.reverted !== 'boolean' || !Array.isArray(transaction.postings)) {
          return unavailable('formance_treasury_snapshot_transactions_invalid')
        }
        const insertedAt = transaction.insertedAt instanceof Date ? transaction.insertedAt.getTime() : Number.NaN
        const revertedAt = transaction.revertedAt === undefined ? undefined
          : transaction.revertedAt instanceof Date ? transaction.revertedAt.getTime() : Number.NaN
        // A later revert can mutate a row returned at an earlier effective PIT. Never silently drop it.
        if (!Number.isSafeInteger(insertedAt) || insertedAt < 0 || insertedAt > snapshotAt
          || (revertedAt !== undefined && (!Number.isSafeInteger(revertedAt) || revertedAt < insertedAt || revertedAt > snapshotAt))
          || (transaction.reverted && revertedAt === undefined)) {
          return unavailable('formance_treasury_snapshot_cutoff_invalid')
        }
        if (transaction.reverted || transaction.metadata?.['com.formance.spec/state/reverts'] !== undefined
          || transaction.template !== 'PROVIDER_SETTLED') continue
        if (transaction.reference === undefined || !REFERENCE.test(transaction.reference) || references.has(transaction.reference)) {
          return unavailable('formance_treasury_snapshot_transactions_invalid')
        }
        let amount = 0n
        let cashPostings = 0
        for (const posting of transaction.postings) {
          const units = nativeUnits(posting.amount)
          if (units === undefined) return invalid('formance_unsafe_integer')
          if (posting.source !== committedAddress || posting.asset !== 'USDC/6') continue
          if (!PROVIDER_SETTLEMENT.test(posting.destination) || units === '0') return unavailable('formance_treasury_snapshot_transactions_invalid')
          amount += BigInt(units)
          cashPostings += 1
        }
        if (cashPostings !== 1) return unavailable('formance_treasury_snapshot_transactions_invalid')
        const amountUnits = formanceSafeUnitsFromSdk(amount)
        const callDigest = transaction.metadata?.call_digest ?? null
        const externalEvidenceDigest = transaction.metadata?.external_evidence_digest ?? null
        if (amountUnits === undefined || (callDigest !== null && !DIGEST.test(callDigest))
          || (externalEvidenceDigest !== null && !DIGEST.test(externalEvidenceDigest))) {
          return unavailable('formance_treasury_snapshot_transactions_invalid')
        }
        references.add(transaction.reference)
        last7d += amount
        if (timestamp >= dayStart) last24h += amount
        if (formanceSafeUnitsFromSdk(last7d) === undefined) return invalid('formance_unsafe_integer')
        settlements.push({ commandRef: transaction.reference, settledAt: timestamp, amountUnits, callDigest, externalEvidenceDigest })
      }
      if (!page.hasMore) break
      if (typeof page.next !== 'string' || page.next.length === 0 || page.next.length > 2_000
        || cursors.has(page.next) || page.data.length === 0) return unavailable('formance_treasury_snapshot_cursor_invalid')
      cursors.add(page.next)
      cursor = page.next
    } while (cursor !== undefined)
  } catch (cause) {
    return degradeBackend(cause, unavailable('formance_treasury_snapshot_read_unavailable'), {
      site: 'readFormanceTreasurySnapshot.providerPayments', reason: 'source_unavailable',
    })
  }
  return { kind: 'available', value: {
    // PROVIDER_REVERSED is not negative burn: returned funds belong in native cash balances.
    basis: 'gross_provider_payments',
    last24hUnits: last24h.toString(), last7dUnits: last7d.toString(), settlements,
    oldestSettledAt: settlements.reduce<number | null>((oldest, row) => oldest === null ? row.settledAt : Math.min(oldest, row.settledAt), null),
    newestSettledAt: settlements.reduce<number | null>((newest, row) => newest === null ? row.settledAt : Math.max(newest, row.settledAt), null),
  } }
}
