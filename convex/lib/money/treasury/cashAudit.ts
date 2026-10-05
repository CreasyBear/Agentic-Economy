"use node"

import { Agent } from 'undici'
import { boundaryCauseKind, degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createGuardedLookup, defaultDnsResolver } from '@/modules/network-guard/public'
import { readX402EvmReceipt } from '@/modules/capability-execution/call-runtime'
import { verifyExactEvmX402Settlement, type X402EvmReceipt } from '@/modules/capability-supply/server'
import { TREASURY_DRIFT_TOLERANCE_UNITS, TREASURY_RESERVATION_AGE_LIMIT_MS, TREASURY_FINALIZED_BLOCK_MAX_AGE_MS,
  type TreasuryBatch, type TreasuryChainObservation, type TreasuryIdentity, type TreasuryProgress, type TreasuryTransfer } from '@/modules/money/treasury'
import type { TreasuryCheck, TreasurySnapshot } from '@/modules/money/treasury-report'
import { matchTreasuryBatch, matchTreasuryCallCash, matchTreasuryProviderSettlement,
  treasuryAuditCashAddresses, treasuryAuditCallDigest, type FormanceTreasuryAuditTransaction } from '../formance/gateway'
import type { TreasuryAttemptSource, TreasuryCallSource, TreasurySpendReservationSourcesResult } from './auditSources'
import { TREASURY_CHAIN_RANGE_BLOCKS } from './chainObservation'

type SpendReservation = Extract<TreasurySpendReservationSourcesResult, { kind: 'available' }>['rows'][number]
type CashAuditInput = Readonly<{
  identity: TreasuryIdentity; snapshotAt: number; progress: TreasuryProgress; batches: readonly TreasuryBatch[];
  calls: readonly TreasuryCallSource[]; attempts: readonly TreasuryAttemptSource[]; reservations: readonly SpendReservation[];
  transactions: readonly FormanceTreasuryAuditTransaction[]; ledger: TreasurySnapshot['ledger'];
  chainReadback?: TreasuryChainObservation | Readonly<{ kind: 'unavailable'; code: string }>;
}>
export type TreasuryCashAudit = Pick<TreasurySnapshot, 'chain' | 'inFlight' | 'rawCashDifferenceUnits'
  | 'cashTimingAdjustmentUnits' | 'historyStartedAt' | 'deposits' | 'depositsComplete'> & {
  cash: TreasuryCheck; settlements: TreasuryCheck; reservations: TreasuryCheck
}
type ReceiptReader = (attempt: TreasuryAttemptSource['material'], hash: string) => Promise<X402EvmReceipt | undefined>
const unavailable = (code: string): Extract<TreasuryCheck, { kind: 'unavailable' }> => ({ kind: 'unavailable', code })
function matched(count: number, units: bigint): TreasuryCheck {
  return { kind: 'matched', checkedCount: count, expectedUnits: units.toString(), observedUnits: units.toString(), differenceUnits: '0' }
}
function mismatch(code: string, count: number, expected: bigint, observed: bigint, refs: readonly string[]): TreasuryCheck {
  return { kind: 'mismatch', code, checkedCount: count, expectedUnits: expected.toString(), observedUnits: observed.toString(),
    differenceUnits: (observed - expected).toString(), evidenceRefs: [...new Set(refs)].slice(0, 20) }
}
function attention(code: string, refs: readonly string[], units: bigint | null = null): TreasuryCheck {
  return { kind: 'attention', code, pendingCount: refs.length, pendingUnits: units?.toString() ?? null, evidenceRefs: [...new Set(refs)].slice(0, 20) }
}

/**
 * Requires complete cutoff-bounded source/native pages for one custody identity.
 * Ensures exact native command attribution and one independently verified transfer
 * per payment. Cash includes protected buffer; reservations and signing liability
 * are distinct. Ledger-before-finality adds payment back to expected chain cash;
 * finalized-payment-before-ledger subtracts it, without erasing the pending task.
 * Invariant: no net-zero orphan pair, duplicate transfer or released buyer balance
 * proves a Provider payment; every configured RPC must agree and at least twelve
 * confirmations remain required. Payment histories are read sequentially so one
 * audit does not multiply each receipt's RPC requests into a provider burst.
 * On violation: mismatch for contradictory evidence, attention for a known pending
 * transition, unavailable for incomplete or immature evidence. RPC outages are
 * recoverable at the next scheduled audit; no money changes and no signing occurs.
 * Complexity: one bounded history join owns cross-source meaning. It reuses native
 * command builders, guarded RPCs and exact payment verification; no second journal.
 */
export async function auditTreasuryCash(input: CashAuditInput, readReceipt?: ReceiptReader): Promise<TreasuryCashAudit> {
  const flight = treasuryInFlight(input.calls, input.snapshotAt)
  const empty: TreasuryCashAudit = { chain: unavailable('treasury_chain_history_unavailable'), inFlight: flight,
    rawCashDifferenceUnits: null, cashTimingAdjustmentUnits: null, historyStartedAt: null,
    deposits: [], depositsComplete: false, cash: unavailable('treasury_chain_history_unavailable'),
    settlements: unavailable('treasury_chain_history_unavailable'), reservations: unavailable('treasury_native_history_unavailable') }
  const history = validateHistory(input)
  if (history.kind !== 'available') return { ...empty, cash: history, settlements: history }
  const observation = verifiedChainReadback(input, history.latest)
  const addresses = treasuryAuditCashAddresses(input.identity)
  const cashAddresses = new Set(Object.values(addresses))
  const cashRows = input.transactions.filter(row => row.postings.some(posting => cashAddresses.has(posting.source) || cashAddresses.has(posting.destination)))
  const matchedRefs = new Set(history.nativeRefs)
  const mismatches: string[] = []
  const pending: string[] = []
  let expectedCommitted = 0n
  const callsByDigest = new Map<string, TreasuryCallSource>()
  for (const source of input.calls) {
    if (source.native.kind !== 'available' || source.joinIssues.length > 0) { mismatches.push(source.call.callRef); continue }
    const digest = treasuryAuditCallDigest(source.native.booking)
    if (digest === undefined || callsByDigest.has(digest)) { mismatches.push(source.call.callRef); continue }
    callsByDigest.set(digest, source)
    const booking = source.native.booking
    const rows = cashRows.filter(row => row.metadata.call_digest === digest)
    const reserve = rows.filter(row => matchTreasuryCallCash(row, booking, 'reserve'))
    const release = rows.filter(row => matchTreasuryCallCash(row, booking, 'release'))
    const paid = rows.filter(row => row.template === 'PROVIDER_SETTLED')
    for (const row of [...reserve, ...release]) if (row.commandRef !== null) matchedRefs.add(row.commandRef)
    const amount = BigInt(source.native.booking.providerAmountUnits)
    const state = source.call.financialState
    const completed = state === 'settled' || state === 'released'
    const attached = source.call.reservationRefs.length > 0
    if (reserve.length > 1 || release.length > 1 || paid.length > 1 || (release.length > 0 && paid.length > 0)
      || (attached && (reserve.length !== 1 || !source.call.reservationRefs.includes(reserve[0]?.commandRef ?? '')))) mismatches.push(source.call.callRef)
    if (!attached && reserve.length > 0) pending.push(source.call.callRef)
    if (completed) {
      const closing = source.obligation?.state === 'settled' ? paid : release
      const refs = source.obligation?.state === 'settled' ? source.call.settlementRefs : source.call.releaseRefs
      if (reserve.length !== 1 || closing.length !== 1 || !refs.includes(closing[0]?.commandRef ?? '')) mismatches.push(source.call.callRef)
    } else if (release.length > 0 || paid.length > 0) pending.push(source.call.callRef)
    else if (attached || reserve.length > 0) expectedCommitted += amount
    // An in-progress reserve can have no native effect yet; it is a known task.
    if (!attached && reserve.length === 0 && !completed) pending.push(source.call.callRef)
  }
  const dispatcher = readReceipt === undefined ? new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } }) : undefined
  const reader: ReceiptReader = readReceipt ?? (async (attempt, hash) => {
    if (dispatcher === undefined || attempt.paymentPayer === undefined || attempt.paymentNonce === undefined) return undefined
    const receipt = await readX402EvmReceipt(attempt.network, attempt.asset, hash, dispatcher, input.identity.environment,
      attempt.paymentPayer, attempt.paymentNonce)
    return receipt !== undefined && receipt.confirmations >= 12n ? receipt : undefined
  })
  let settlement: Awaited<ReturnType<typeof auditPayments>>
  try { settlement = await auditPayments(input, history.transfers, history.openingBlock, reader, callsByDigest) }
  finally { await dispatcher?.close() }
  for (const ref of settlement.nativeRefs) matchedRefs.add(ref)
  const unexplained = cashRows.filter(row => row.commandRef === null || !matchedRefs.has(row.commandRef))
  const observedCommitted = input.ledger.kind === 'available' ? BigInt(input.ledger.committedUnits) : 0n
  let reservations: TreasuryCheck = input.ledger.kind !== 'available' ? input.ledger
    : mismatches.length > 0 ? mismatch('treasury_reservation_evidence_conflict', input.calls.length, expectedCommitted, observedCommitted, mismatches)
      : pending.length > 0 ? attention('treasury_reservation_transition_pending', pending)
        : expectedCommitted !== observedCommitted ? mismatch('treasury_reservation_balance_difference', input.calls.length,
          expectedCommitted, observedCommitted, input.calls.map(row => row.call.callRef))
          : flight.kind === 'available' && flight.overdueCount > 0
            ? attention('treasury_reservation_overdue', input.calls.filter(row => row.call.financialState !== 'settled' && row.call.financialState !== 'released' && input.snapshotAt - row.call.createdAt >= TREASURY_RESERVATION_AGE_LIMIT_MS).map(row => row.call.callRef), BigInt(flight.overdueUnits))
            : matched(input.calls.length, expectedCommitted)
  const signing = signingReservationConsistency(input)
  if (signing !== undefined && reservations.kind !== 'mismatch') reservations = signing
  let cash: TreasuryCheck
  let raw: string | null = null
  const total = input.ledger.kind === 'available' ? BigInt(input.ledger.availableUnits) + BigInt(input.ledger.committedUnits) + BigInt(input.ledger.bufferUnits) : null
  if (total === null) cash = unavailable('treasury_native_balance_unavailable')
  else {
    const chain = BigInt(history.latest.observation.checkpoint.balanceUnits)
    raw = (chain - total).toString()
    const expected = total + settlement.timingAdjustment
    const difference = chain - expected
    cash = unexplained.length > 0 ? mismatch('treasury_cash_movement_unattributed', cashRows.length, expected, chain,
      unexplained.map(row => row.commandRef ?? `native-transaction:${row.id}`))
      : settlement.check.kind === 'unavailable' || settlement.check.kind === 'mismatch' ? unavailable('treasury_payment_attribution_required')
        : !history.latest.observation.caughtUp ? attention('treasury_chain_catching_up', [history.latest.batchRef])
          : observation.kind === 'unavailable' ? observation
            : input.snapshotAt - observation.observedAt >= 20 * 60_000
            || input.snapshotAt - observation.blockTimestamp >= TREASURY_FINALIZED_BLOCK_MAX_AGE_MS ? unavailable('treasury_chain_observation_stale')
            : absolute(difference) > BigInt(TREASURY_DRIFT_TOLERANCE_UNITS)
              ? mismatch('treasury_cash_difference', cashRows.length, expected, chain, [history.latest.batchRef])
              : { kind: 'matched', checkedCount: cashRows.length, expectedUnits: expected.toString(), observedUnits: chain.toString(), differenceUnits: difference.toString() }
  }
  return { chain: observation.kind === 'unavailable' ? observation : { kind: 'available', observedAt: observation.observedAt,
    blockTimestamp: observation.blockTimestamp, blockNumber: observation.checkpoint.blockNumber,
    blockHash: observation.checkpoint.blockHash, totalUnits: observation.checkpoint.balanceUnits,
    caughtUp: observation.caughtUp },
    inFlight: flight, rawCashDifferenceUnits: raw, cashTimingAdjustmentUnits: settlement.timingAdjustment.toString(),
    historyStartedAt: input.batches[0]?.observation.blockTimestamp ?? null, deposits: history.deposits.slice(-20).reverse(),
    depositsComplete: history.deposits.length <= 20, cash, settlements: settlement.check, reservations }
}

/**
 * Requires the guarded reader's unanimous, canonical, complete finalized range.
 * Ensures fresh chain evidence can extend booked history only with zero transfers
 * and the same balance. Same-height evidence must preserve hash and block time;
 * advancing evidence must have a new hash and later block time within the reader's
 * range bound. Booked records retain their original checkpoint and clocks.
 * On violation: unavailable; even a net-zero unbooked transfer needs attribution.
 * This reuses the existing RPC proof; no booking, cache or new journal is needed.
 */
function verifiedChainReadback(input: CashAuditInput, latest: TreasuryBatch): TreasuryChainObservation | Extract<TreasuryCheck, { kind: 'unavailable' }> {
  const proof = input.chainReadback
  if (proof === undefined) return latest.observation
  if (proof.kind === 'unavailable') return proof
  const retained = latest.observation
  const retainedBlock = BigInt(retained.checkpoint.blockNumber)
  const proofBlock = /^(?:0|[1-9]\d{0,77})$/u.test(proof.checkpoint.blockNumber) ? BigInt(proof.checkpoint.blockNumber) : -1n
  const sameBlock = proofBlock === retainedBlock
  if (proof.environment !== input.identity.environment || proof.network !== input.identity.network
    || proof.asset !== input.identity.asset || proof.address !== input.identity.address
    || proof.checkpoint.balanceUnits !== retained.checkpoint.balanceUnits
    || proofBlock < retainedBlock || proofBlock > retainedBlock + TREASURY_CHAIN_RANGE_BLOCKS
    || !/^0x[0-9a-f]{64}$/u.test(proof.checkpoint.blockHash)
    || (sameBlock ? proof.checkpoint.blockHash !== retained.checkpoint.blockHash || proof.blockTimestamp !== retained.blockTimestamp
      : proof.checkpoint.blockHash === retained.checkpoint.blockHash || proof.blockTimestamp <= retained.blockTimestamp)
    || proof.fromBlock !== (retainedBlock + 1n).toString()
    || proof.transfers.length !== 0 || !proof.caughtUp || !retained.caughtUp) {
    return unavailable('treasury_chain_readback_conflict')
  }
  if (!Number.isSafeInteger(proof.observedAt) || proof.observedAt < latest.observation.observedAt
    || proof.observedAt > input.snapshotAt || input.snapshotAt - proof.observedAt >= 20 * 60_000
    || !Number.isSafeInteger(proof.blockTimestamp) || proof.blockTimestamp < 0
    || proof.blockTimestamp > input.snapshotAt
    || input.snapshotAt - proof.blockTimestamp >= TREASURY_FINALIZED_BLOCK_MAX_AGE_MS) {
    return unavailable('treasury_chain_observation_stale')
  }
  return proof
}

function absolute(value: bigint) { return value < 0n ? -value : value }

export function treasuryInFlight(calls: readonly TreasuryCallSource[], snapshotAt: number): TreasurySnapshot['inFlight'] {
  if (calls.some(row => row.native.kind !== 'available' || row.joinIssues.length > 0)) return unavailable('treasury_call_evidence_incomplete')
  const open = calls.filter(row => row.call.financialState !== 'settled' && row.call.financialState !== 'released')
  const queue = open.filter(row => row.call.state === 'reconciliation_required' || row.call.financialState === 'outcome_unknown')
    .sort((a, b) => a.call.createdAt - b.call.createdAt)
  const amount = (row: TreasuryCallSource) => row.native.kind === 'available' ? BigInt(row.native.booking.providerAmountUnits) : 0n
  const overdue = open.filter(row => snapshotAt - row.call.createdAt >= TREASURY_RESERVATION_AGE_LIMIT_MS)
  return { kind: 'available', observedAt: snapshotAt, count: queue.length,
    amountUnits: queue.reduce((sum, row) => sum + amount(row), 0n).toString(), oldestAt: queue[0]?.call.createdAt ?? null,
    overdueCount: overdue.length, overdueUnits: overdue.reduce((sum, row) => sum + amount(row), 0n).toString(),
    calls: queue.slice(0, 20).map(row => ({ callRef: row.call.callRef, amountUnits: amount(row).toString(), createdAt: row.call.createdAt, state: row.call.state })),
    listedCallsComplete: queue.length <= 20 }
}

function validateHistory(input: CashAuditInput): Extract<TreasuryCheck, { kind: 'unavailable' }> | {
  kind: 'available'; latest: TreasuryBatch; openingBlock: bigint; transfers: TreasuryTransfer[];
  nativeRefs: string[]; deposits: TreasurySnapshot['deposits']
} {
  if (input.progress.kind !== 'ready' || input.batches.length === 0) return unavailable('treasury_chain_history_unavailable')
  let previous: TreasuryBatch | undefined
  const transfers: TreasuryTransfer[] = []
  const nativeRefs: string[] = []
  const deposits: TreasurySnapshot['deposits'] = []
  const transferIds = new Set<string>()
  for (const batch of input.batches) {
    if (batch.state.kind !== 'booked' || batch.state.completedAt > input.snapshotAt
      || batch.custodyRef !== input.identity.custodyRef || batch.custodyGeneration !== input.identity.custodyGeneration
      || (previous === undefined ? batch.previousCheckpoint !== null : canonicalDigest(batch.previousCheckpoint) !== canonicalDigest(previous.observation.checkpoint))) {
      return unavailable('treasury_chain_history_incomplete')
    }
    const refs = matchTreasuryBatch(input.transactions, input.identity, batch)
    if (refs === undefined) return unavailable('treasury_deposit_evidence_conflict')
    nativeRefs.push(...refs)
    const credits = refs.map(ref => input.transactions.find(row => row.commandRef === ref))
      .filter((row): row is FormanceTreasuryAuditTransaction => row?.template === 'TREASURY_CAPACITY_SYNCED')
    for (const credit of credits) {
      const posting = credit.postings[0]
      if (credit.commandRef === null || posting === undefined) return unavailable('treasury_deposit_evidence_conflict')
      const transfer = batch.observation.transfers.find(row => row.evidenceDigest.slice(7) === credit.metadata.external_evidence_digest)
      deposits.push({ transactionRef: credit.commandRef, amountUnits: posting.amountUnits,
        bookedAt: credit.insertedAt, chainTransactionHash: transfer?.transactionHash ?? null })
    }
    for (const transfer of batch.observation.transfers) {
      const key = `${transfer.transactionHash.toLowerCase()}:${transfer.logIndex}`
      if (transferIds.has(key)) return unavailable('treasury_chain_transfer_duplicate')
      transferIds.add(key); transfers.push(transfer)
    }
    previous = batch
  }
  if (previous === undefined || canonicalDigest(previous.observation.checkpoint) !== canonicalDigest(input.progress.checkpoint)) {
    return unavailable('treasury_chain_checkpoint_changed')
  }
  return { kind: 'available', latest: previous, openingBlock: BigInt(input.batches[0]!.observation.checkpoint.blockNumber), transfers, nativeRefs, deposits }
}

async function auditPayments(input: CashAuditInput, transfers: readonly TreasuryTransfer[], openingBlock: bigint,
  readReceipt: ReceiptReader, callsByDigest: ReadonlyMap<string, TreasuryCallSource>): Promise<{
    check: TreasuryCheck; timingAdjustment: bigint; nativeRefs: string[]
  }> {
  const mismatches: string[] = []; const pending: string[] = []; const missing: string[] = []
  const usedHashes = new Set<string>(); const nativeRefs: string[] = []; const candidateHashes = new Set<string>()
  const outgoing = transfers.filter(row => row.payer === input.identity.address && row.recipient !== input.identity.address && BigInt(row.amountUnits) > 0n)
  const native = input.transactions.filter(row => row.template === 'PROVIDER_SETTLED')
  const candidateAttempts = input.attempts.filter(row => row.material.settlementStatus === 'settled'
    || transactionHashes(row).length > 0 || input.reservations.some(reservation => reservation.state === 'settled'
      && reservation.attemptRef === row.material.attemptRef && reservation.effectGeneration === row.material.effectGeneration))
  for (const source of candidateAttempts) for (const hash of transactionHashes(source)) candidateHashes.add(hash)
  let timingAdjustment = 0n; let verifiedUnits = 0n; let nativeUnits = 0n
  for (const transaction of native) {
    const call = callsByDigest.get(transaction.metadata.call_digest ?? '')
    if (call?.native.kind !== 'available') { mismatches.push(transaction.commandRef ?? `native-transaction:${transaction.id}`); continue }
    nativeUnits += BigInt(call.native.booking.providerAmountUnits)
    if (!candidateAttempts.some(attempt => attempt.material.dispatchRef === call.call.callRef)) mismatches.push(call.call.callRef)
  }
  // Leave time for processor checks/publication within the Node action deadline.
  // Above the alpha readback bound, retain native attribution but never claim a full audit.
  const receiptDeadline = Date.now() + 120_000
  let receiptBudgetExceeded = candidateAttempts.length > 250
  let receiptReads = 0
  // Each payment already fans out to both RPC providers. Keep historical reads
  // sequential and inspect current confirmations rather than polling for a block.
  for (const source of candidateAttempts) {
    receiptBudgetExceeded ||= Date.now() >= receiptDeadline || receiptReads >= 250
    const hashes = transactionHashes(source)
    const hash = hashes[0]
    let receipt: X402EvmReceipt | undefined
    if (!receiptBudgetExceeded && source.joinIssues.length === 0 && source.native.kind === 'available'
      && hash !== undefined && hashes.length === 1 && source.material.paymentNonce !== undefined && source.material.paymentPayer !== undefined) {
      // One read outage need not close payments until the next scheduled audit.
      // Retry only missing evidence, sequentially, within the same total budget.
      // A returned receipt still undergoes all attribution/finality checks below.
      for (let read = 0; read < 2; read += 1) {
        if (Date.now() >= receiptDeadline || receiptReads >= 250) {
          receiptBudgetExceeded = true
          break
        }
        try { receiptReads += 1; receipt = await readReceipt(source.material, hash) }
        catch (cause) { receipt = degradeBackend(boundaryCauseKind(cause), undefined,
          { site: 'treasuryPaymentReceipt', reason: 'source_unavailable' }) }
        if (receipt !== undefined || read === 1) break
        if (receiptReads >= 250 || Date.now() + 250 >= receiptDeadline) {
          receiptBudgetExceeded = true
          break
        }
        await new Promise<void>(resolve => setTimeout(resolve, 250))
      }
    }
    const attempt = source.material
    if (source.joinIssues.length > 0 || source.native.kind !== 'available' || transactionHashes(source).length > 1) {
      mismatches.push(attempt.dispatchRef); continue
    }
    const booking = source.native.booking
    const evidence = [attempt.paymentResponseDigest, attempt.reconciliationEvidenceDigest, source.call?.evidenceHash]
      .filter((value): value is string => value !== undefined)
    if (hash !== undefined) evidence.push(canonicalDigest({ format: 'ae.managed-x402-settlement:v1', callRef: attempt.dispatchRef, settlementRef: hash }))
    const matchedRows = native.filter(row => matchTreasuryProviderSettlement(row, booking, evidence))
    const nativeRow = matchedRows[0]
    if (matchedRows.length > 1 || (nativeRow?.commandRef !== undefined && nativeRow.commandRef !== null && nativeRefs.includes(nativeRow.commandRef))) {
      mismatches.push(attempt.dispatchRef); continue
    }
    if (nativeRow?.commandRef !== undefined && nativeRow.commandRef !== null) nativeRefs.push(nativeRow.commandRef)
    if (hash === undefined || receipt === undefined) { missing.push(attempt.dispatchRef); continue }
    if (usedHashes.has(hash) || !verifyExactEvmX402Settlement({ aeEnvironment: input.identity.environment,
      requirement: { scheme: attempt.scheme, network: attempt.network, asset: attempt.asset, amount: attempt.amountUnits, payTo: attempt.payTo },
      response: { success: true, transaction: hash, network: attempt.network, amount: attempt.amountUnits, ...(attempt.paymentPayer === undefined ? {} : { payer: attempt.paymentPayer }) },
      payer: attempt.paymentPayer, paymentNonce: attempt.paymentNonce ?? '', receipt })) {
      mismatches.push(attempt.dispatchRef); continue
    }
    usedHashes.add(hash)
    if (receipt.blockNumber <= openingBlock) { missing.push(attempt.dispatchRef); continue }
    const isFinalized = input.progress.kind === 'ready' && receipt.blockNumber <= BigInt(input.progress.checkpoint.blockNumber)
    const retained = outgoing.filter(transfer => transfer.transactionHash.toLowerCase() === hash)
    if (isFinalized && (retained.length !== 1 || retained[0]?.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase()
      || retained[0]?.blockNumber !== receipt.blockNumber.toString() || retained[0]?.recipient !== attempt.payTo.toLowerCase()
      || retained[0]?.amountUnits !== attempt.amountUnits)) { mismatches.push(attempt.dispatchRef); continue }
    const amount = BigInt(attempt.amountUnits)
    verifiedUnits += amount
    if (nativeRow === undefined) {
      pending.push(attempt.dispatchRef)
      if (isFinalized) timingAdjustment -= amount
    } else {
      if (nativeRow.commandRef === null) { mismatches.push(attempt.dispatchRef); continue }
      if (!isFinalized) timingAdjustment += amount
      if (source.obligation?.state !== 'settled' || source.obligation.settlementTransactionRef !== nativeRow.commandRef
        || !source.call?.settlementRefs.includes(nativeRow.commandRef)) pending.push(attempt.dispatchRef)
    }
  }
  const unattributed = outgoing.filter(transfer => !candidateHashes.has(transfer.transactionHash.toLowerCase()))
  mismatches.push(...unattributed.map(transfer => `chain:${input.identity.network}:${transfer.transactionHash}`))
  // A native settlement is attributed only by its complete command, not its template or total.
  mismatches.push(...native.filter(row => row.commandRef === null || !nativeRefs.includes(row.commandRef))
    .map(row => row.commandRef ?? `native-transaction:${row.id}`))
  const check = mismatches.length > 0 ? mismatch('treasury_settlement_evidence_conflict', candidateAttempts.length, verifiedUnits, nativeUnits, mismatches)
    : receiptBudgetExceeded ? unavailable('treasury_payment_readback_incomplete')
      : missing.length > 0 ? unavailable('treasury_payment_receipt_unavailable')
      : pending.length > 0 ? attention('treasury_settlement_booking_pending', pending)
        : matched(candidateAttempts.length, verifiedUnits)
  return { check, timingAdjustment, nativeRefs }
}

function transactionHashes(source: TreasuryAttemptSource): string[] {
  const prefix = `chain:${source.material.network}:`
  const hashes = [...source.material.evidenceRefs, source.material.reconciliationEvidenceRef ?? '']
    .filter(ref => ref.startsWith(prefix)).map(ref => ref.slice(prefix.length).toLowerCase())
  if (source.call?.externalSettlementRef !== undefined && source.call.attemptRef === source.material.attemptRef) hashes.push(source.call.externalSettlementRef.toLowerCase())
  return [...new Set(hashes.filter(hash => /^0x[0-9a-f]{64}$/u.test(hash)))]
}


/** A live signature cannot outlive its reserved cash; terminal payment and unused proof cannot both be true. */
function signingReservationConsistency(input: CashAuditInput): TreasuryCheck | undefined {
  const conflicts: string[] = []; const pending: string[] = []
  const seen = new Set<string>()
  for (const reservation of input.reservations) {
    if (reservation.custodyBudgetRef !== input.identity.custodyRef || reservation.custodyGeneration !== input.identity.custodyGeneration) {
      if (reservation.state === 'liability') pending.push(reservation.reservationRef)
      continue
    }
    const attempt = input.attempts.find(row => row.material.attemptRef === reservation.attemptRef && row.material.effectGeneration === reservation.effectGeneration)
    const call = input.calls.find(row => row.call.callRef === reservation.dispatchRef)
    const material = attempt?.material
    if (seen.has(reservation.reservationRef) || material === undefined || call === undefined
      || reservation.dispatchRef !== material.dispatchRef || reservation.custodyRef !== material.custodyRef
      || reservation.reservationRef !== material.spendReservationRef || reservation.authorizationDigest !== material.authorizationDigest
      || reservation.paymentIdentityDigest !== material.paymentIdentityDigest
      || reservation.paymentUnsignedMaterialDigest !== material.paymentUnsignedMaterialDigest
      || reservation.paymentSigningIdempotencyKey !== material.paymentSigningIdempotencyKey
      || reservation.normalizedPayTo !== material.payTo.toLowerCase() || reservation.amountUnits !== material.amountUnits
      || reservation.network !== material.network || reservation.asset !== material.asset.toLowerCase()) {
      conflicts.push(reservation.reservationRef); continue
    }
    seen.add(reservation.reservationRef)
    const paid = call.obligation?.state === 'settled'
    const terminal = call.call.financialState === 'settled' || call.call.financialState === 'released'
    if (reservation.state === 'liability' && terminal) conflicts.push(reservation.reservationRef)
    if (reservation.state === 'settled') {
      if (material.settlementStatus !== 'settled' || (terminal && !paid)) conflicts.push(reservation.reservationRef)
      else if (!terminal) pending.push(reservation.reservationRef)
    }
    if (reservation.state === 'unused') {
      const paidElsewhere = input.reservations.some(other => other.dispatchRef === reservation.dispatchRef && other.state === 'settled'
        && (other.attemptRef !== reservation.attemptRef || other.effectGeneration !== reservation.effectGeneration))
      if (material.settlementStatus === 'settled' || (paid && !paidElsewhere)) conflicts.push(reservation.reservationRef)
      else if (!terminal && material.attemptRef === call.call.attemptRef) pending.push(reservation.reservationRef)
    }
  }
  for (const attempt of input.attempts) {
    if ((attempt.material.paymentSigningClaimedAt !== undefined || attempt.material.paymentSignatureDigest !== undefined
      || attempt.material.submissionStartedAt !== undefined)
      && !input.reservations.some(row => row.attemptRef === attempt.material.attemptRef && row.effectGeneration === attempt.material.effectGeneration)) conflicts.push(attempt.material.dispatchRef)
  }
  if (conflicts.length > 0) return mismatch('treasury_signing_liability_conflict', input.reservations.length, 0n, 0n, conflicts)
  return pending.length > 0 ? attention('treasury_signing_resolution_pending', pending) : undefined
}
