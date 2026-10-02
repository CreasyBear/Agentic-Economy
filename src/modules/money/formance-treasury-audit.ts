"use node"

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { isRecord } from '@/modules/common/is-record'
import { formanceSafeUnitsFromSdk, NO_RETRY, type FormanceContext, type FormanceMoneyCommand } from './internal/formance-config'
import {
  capacityAccount, expectedProviderSettlementCommand,
  prepareFormanceFundingSettlement, prepareFormanceFundingReversal,
  prepareFormanceManagedCallReservation, prepareFormanceManagedCallRelease,
  type FormanceFundingBooking, type FormanceManagedCallBooking,
} from './internal/formance-transaction-templates'
import { prepareFormanceTreasuryBatch, treasuryBufferAccount, type FormanceTreasuryBalanceSubject } from './formance-treasury'
import type { TreasuryBatch, TreasuryIdentity } from './treasury'

const PAGE_SIZE = 15
export const TREASURY_AUDIT_TRANSACTION_LIMIT = 10_000
const PURCHASED_AVAILABLE = /^accounts:[a-f0-9]{64}:available$/u
const PROCESSOR_SETTLEMENT = /^processor:[a-f0-9]{64}:settlement$/u
const FUNDING_TEMPLATES = new Set(['FUNDING_SETTLED', 'FUNDING_REVERSED'])

export type FormanceTreasuryAuditInput = FormanceTreasuryBalanceSubject & Readonly<{ snapshotAt: number }>
export type FormanceTreasuryAuditPosting = Readonly<{
  source: string; destination: string; asset: string; amountUnits: string
}>
export type FormanceTreasuryAuditTransaction = Readonly<{
  id: string
  commandRef: string | null
  template: string | null
  insertedAt: number
  effectiveAt: number
  reverted: boolean
  revertedAt: number | null
  metadata: Readonly<Record<string, string>>
  postings: readonly FormanceTreasuryAuditPosting[]
}>
type AuditFailure = Readonly<{ kind: 'setup_required' | 'unavailable'; code: string }>
export type FormanceTreasuryAuditResult = AuditFailure | Readonly<{
  kind: 'available'
  snapshotAt: number
  complete: true
  transactions: readonly FormanceTreasuryAuditTransaction[]
}>
const unavailable = (code: string): AuditFailure => ({ kind: 'unavailable', code })
const boundedText = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= limit
const clock = (value: unknown): number | undefined => {
  const timestamp = value instanceof Date ? value.getTime() : Number.NaN
  return Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : undefined
}

/**
 * Requires: configured native ledger, current custody identity and a safe server cutoff.
 * Ensures: complete insertion-bounded history of exact treasury cash movements and
 * purchased funding/reversals, including unexplained templates and native reversions.
 * Invariant: no effective-time window hides backdated/future-effective inserted facts;
 * every clock and unit is exact; a later revert never silently erases cutoff evidence.
 * On violation: setup_required/unavailable without partial rows, writes or green checks.
 * COMPLEXITY: Added one bounded whole-ledger traversal and evidence result type.
 * Bought native clocks/cursor/normalization isolation and opposite-direction orphan
 * coverage. Keep: the reference reader omits clocks and a rate window omits history.
 * Cost: all native rows count toward 10k, even unrelated rows; reads stop after 30s with a 5s per-request timeout. Future incremental
 * traversal can use a verified insertion watermark at this boundary; no framework now.
 */
export async function readFormanceTreasuryAudit(
  context: FormanceContext,
  input: FormanceTreasuryAuditInput,
): Promise<FormanceTreasuryAuditResult> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/u.test(input.custodyRef)
    || !Number.isSafeInteger(input.custodyGeneration) || input.custodyGeneration < 1
    || !Number.isSafeInteger(input.snapshotAt) || input.snapshotAt < 0 || input.snapshotAt > Date.now()) {
    return { kind: 'setup_required', code: 'formance_treasury_audit_input_invalid' }
  }
  const available = capacityAccount('treasury_usdc', input.custodyRef, input.custodyGeneration)
  const cashAddresses = new Set([available, available.replace(/:available$/u, ':committed'), treasuryBufferAccount(input)])
  const transactions: FormanceTreasuryAuditTransaction[] = []
  const ids = new Set<string>()
  const references = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | undefined
  let visited = 0
  let previousId = -1n
  const deadline = Date.now() + 30_000
  try {
    do {
      if (Date.now() >= deadline) return unavailable('formance_treasury_audit_read_budget_exceeded')
      // Native cursor retains the first query. SDK forbids other pagination
      // parameters with cursor. No PIT: it filters effective time in ledger 2.4.12.
      // inserted_at is the insertion clock; local validation guards server drift.
      const response = await context.sdk.ledger.v2.listTransactions(cursor === undefined ? {
        ledger: context.configuration.ledger, pageSize: PAGE_SIZE, sort: 'id:asc',
        query: { $lte: { inserted_at: new Date(input.snapshotAt).toISOString() } },
      } : { ledger: context.configuration.ledger, cursor }, { ...NO_RETRY, timeoutMs: 5_000 })
      const page = response.v2TransactionsCursorResponse?.cursor
      if (page === undefined || !Array.isArray(page.data) || page.data.length > PAGE_SIZE || typeof page.hasMore !== 'boolean') {
        return unavailable('formance_treasury_audit_response_invalid')
      }
      visited += page.data.length
      if (visited > TREASURY_AUDIT_TRANSACTION_LIMIT) return unavailable('formance_treasury_audit_history_incomplete')
      for (const native of page.data) {
        const normalized = normalizeTransaction(native, input.snapshotAt)
        if (normalized.kind !== 'valid') return normalized
        const row = normalized.value
        if (ids.has(row.id) || BigInt(row.id) <= previousId
          || (row.commandRef !== null && references.has(row.commandRef))) {
          return unavailable('formance_treasury_audit_transactions_invalid')
        }
        ids.add(row.id)
        previousId = BigInt(row.id)
        if (row.commandRef !== null) references.add(row.commandRef)
        const cash = row.postings.some(posting => cashAddresses.has(posting.source) || cashAddresses.has(posting.destination))
        // Funding compensation/manual orphan rows need not have a template.
        // Match exact chart families, retaining every posting and asset for audit.
        if (cash || isTreasuryFundingAuditTransaction(row)) transactions.push(row)
      }
      if (!page.hasMore) return { kind: 'available', snapshotAt: input.snapshotAt, complete: true, transactions }
      if (visited === TREASURY_AUDIT_TRANSACTION_LIMIT) return unavailable('formance_treasury_audit_history_incomplete')
      if (!boundedText(page.next, 2_000) || cursors.has(page.next) || page.data.length === 0) {
        return unavailable('formance_treasury_audit_cursor_invalid')
      }
      cursors.add(page.next)
      cursor = page.next
    } while (cursor !== undefined)
  } catch (cause) {
    return degradeBackend(cause, unavailable('formance_treasury_audit_read_unavailable'), {
      site: 'readFormanceTreasuryAudit', reason: 'source_unavailable',
    })
  }
  return unavailable('formance_treasury_audit_cursor_invalid')
}

function normalizeTransaction(native: unknown, cutoff: number):
  AuditFailure | Readonly<{ kind: 'valid'; value: FormanceTreasuryAuditTransaction }> {
  if (!isRecord(native) || typeof native.id !== 'bigint' || native.id < 0n || native.id > BigInt(Number.MAX_SAFE_INTEGER)
    || typeof native.reverted !== 'boolean' || !Array.isArray(native.postings) || native.postings.length > 1_000
    || !isRecord(native.metadata) || Object.keys(native.metadata).length > 64
    || (native.reference !== undefined && !boundedText(native.reference, 2_000))
    || (native.template !== undefined && !boundedText(native.template, 500))) {
    return unavailable('formance_treasury_audit_transactions_invalid')
  }
  const insertedAt = clock(native.insertedAt)
  const effectiveAt = clock(native.timestamp)
  const revertedAt = native.revertedAt === undefined ? null : clock(native.revertedAt)
  if (insertedAt === undefined || insertedAt > cutoff || effectiveAt === undefined || revertedAt === undefined
    || (native.reverted && revertedAt === null) || (!native.reverted && revertedAt !== null)
    || (revertedAt !== null && (revertedAt < insertedAt || revertedAt > cutoff))) {
    return unavailable('formance_treasury_audit_cutoff_invalid')
  }
  const metadata: Record<string, string> = {}
  for (const [key, value] of Object.entries(native.metadata)) {
    if (!boundedText(key, 500) || typeof value !== 'string' || value.length > 2_000) {
      return unavailable('formance_treasury_audit_transactions_invalid')
    }
    Object.defineProperty(metadata, key, { value, enumerable: true })
  }
  const postings: FormanceTreasuryAuditPosting[] = []
  for (const posting of native.postings) {
    if (!isRecord(posting) || !boundedText(posting.source, 500) || !boundedText(posting.destination, 500)
      || !boundedText(posting.asset, 100)) return unavailable('formance_treasury_audit_transactions_invalid')
    const units = typeof posting.amount === 'bigint' || typeof posting.amount === 'number' || typeof posting.amount === 'string'
      ? formanceSafeUnitsFromSdk(posting.amount) : undefined
    if (units === undefined) return unavailable('formance_treasury_audit_unsafe_integer')
    postings.push({ source: posting.source, destination: posting.destination, asset: posting.asset, amountUnits: units })
  }
  return { kind: 'valid', value: {
    id: String(native.id), commandRef: native.reference as string | undefined ?? null,
    template: native.template as string | undefined ?? null,
    insertedAt, effectiveAt, reverted: native.reverted, revertedAt, metadata, postings,
  } }
}

/**
 * Requires: original immutable booking and canonical digests from independently
 * accepted durable payment evidence. Ensures exact native Provider cash AND
 * obligation postings, canonical identity/metadata and an allowed evidence digest.
 * Invariant: Call delivery/financial state does not change the Provider command;
 * the paid lost-response remedy is eligible for the same proof as normal delivery.
 * On violation: false, including missing evidence, native reversion or malformed input.
 */
export function matchTreasuryProviderSettlement(
  transaction: FormanceTreasuryAuditTransaction,
  booking: FormanceManagedCallBooking,
  evidenceDigests: readonly string[],
): boolean {
  try {
    const digest = transaction.metadata?.external_evidence_digest
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/u.test(digest) || !Array.isArray(evidenceDigests)) return false
    const evidence = `sha256:${digest}`
    if (!evidenceDigests.some(value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value) && value === evidence)) return false
    const expected = expectedProviderSettlementCommand({
      booking, originalSettlementRef: transaction.commandRef ?? '', correctionEvidenceDigest: evidence,
    })
    if (expected === undefined) return false
    return matchesCommand(transaction, expected, [
      expectedPosting(expected, 'treasury_committed', 'provider_settlement', 'amount'),
      expectedPosting(expected, 'obligation_accrued', 'obligation_settled', 'amount'),
    ])
  } catch {
    return false
  }
}

/**
 * Requires: original funding/refund booking bound to verified processor evidence.
 * Ensures exact principal, service fee, GST AND world/processor total postings,
 * canonical reference/template and every required command metadata value.
 * Invariant: neither remaining customer AUD nor a native-only digest proves funding.
 * On violation: false. Current maintained funding builders require positive sends;
 * zero/invalid bookings are refused, never made to match by dropping native postings.
 */
export function matchTreasuryFunding(
  transaction: FormanceTreasuryAuditTransaction,
  booking: FormanceFundingBooking,
  kind: 'settlement' | 'reversal',
): boolean {
  try {
    if (kind !== 'settlement' && kind !== 'reversal') return false
    const prepared = kind === 'settlement'
      ? prepareFormanceFundingSettlement(booking) : prepareFormanceFundingReversal(booking)
    if (prepared.kind !== 'prepared') return false
    const expected = prepared.command
    return matchesCommand(transaction, expected, kind === 'settlement' ? [
      expectedPosting(expected, 'world', 'processor', 'total_amount'),
      expectedPosting(expected, 'processor', 'account', 'principal_amount'),
      expectedPosting(expected, 'processor', 'revenue', 'service_fee_amount'),
      expectedPosting(expected, 'processor', 'tax', 'tax_amount'),
    ] : [
      expectedPosting(expected, 'account', 'processor', 'principal_amount'),
      expectedPosting(expected, 'revenue', 'processor', 'service_fee_amount'),
      expectedPosting(expected, 'tax', 'processor', 'tax_amount'),
      expectedPosting(expected, 'processor', 'world', 'total_amount'),
    ])
  } catch {
    return false
  }
}

function expectedPosting(command: FormanceMoneyCommand, sourceKey: string, destinationKey: string, amountKey: string):
  FormanceTreasuryAuditPosting | undefined {
  const source = sourceKey === 'world' ? 'world' : command.variables[sourceKey]
  const destination = destinationKey === 'world' ? 'world' : command.variables[destinationKey]
  const amount = command.variables[amountKey]?.match(/^(AUD\/6|USDC\/6) ((?:0|[1-9]\d*))$/u)
  if (source === undefined || destination === undefined || amount?.[1] === undefined || amount[2] === undefined
    || formanceSafeUnitsFromSdk(amount[2]) === undefined) return undefined
  return { source, destination, asset: amount[1], amountUnits: amount[2] }
}

function matchesCommand(
  transaction: FormanceTreasuryAuditTransaction,
  command: FormanceMoneyCommand,
  expected: readonly (FormanceTreasuryAuditPosting | undefined)[],
): boolean {
  if (!isRecord(transaction) || transaction.reverted !== false || transaction.revertedAt !== null
    || typeof transaction.id !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(transaction.id) || formanceSafeUnitsFromSdk(transaction.id) === undefined
    || !Number.isSafeInteger(transaction.insertedAt) || transaction.insertedAt < 0
    || !Number.isSafeInteger(transaction.effectiveAt) || transaction.effectiveAt < 0
    || transaction.commandRef !== command.commandRef || transaction.template !== command.template
    || !isRecord(transaction.metadata) || transaction.metadata['com.formance.spec/state/reverts'] !== undefined
    || !Object.values(transaction.metadata).every(value => typeof value === 'string' && value.length <= 2_000)
    || !Object.entries(command.metadata).every(([key, value]) => Object.hasOwn(transaction.metadata, key) && transaction.metadata[key] === value)
    || !Array.isArray(transaction.postings) || transaction.postings.length !== expected.length
    || expected.some(value => value === undefined)) return false
  const remaining = [...expected]
  for (const posting of transaction.postings) {
    if (!isRecord(posting) || typeof posting.source !== 'string' || typeof posting.destination !== 'string'
      || typeof posting.asset !== 'string' || typeof posting.amountUnits !== 'string'
      || formanceSafeUnitsFromSdk(posting.amountUnits) === undefined) return false
    const index = remaining.findIndex(value => value !== undefined && value.source === posting.source
      && value.destination === posting.destination && value.asset === posting.asset && value.amountUnits === posting.amountUnits)
    if (index === -1) return false
    remaining.splice(index, 1)
  }
  return remaining.length === 0
}

/** The audit and metric readers use the exact same canonical treasury accounts. */
export function treasuryAuditCashAddresses(subject: FormanceTreasuryBalanceSubject) {
  const available = capacityAccount('treasury_usdc', subject.custodyRef, subject.custodyGeneration)
  return { available, committed: available.replace(/:available$/u, ':committed'), buffer: treasuryBufferAccount(subject) }
}

/** Reconstruct the existing booking; a stored reference alone cannot explain cash. */
export function matchTreasuryCallCash(transaction: FormanceTreasuryAuditTransaction,
  booking: FormanceManagedCallBooking, kind: 'reserve' | 'release'): boolean {
  try {
    const externalEvidenceDigest = `sha256:${transaction.metadata.external_evidence_digest ?? ''}`
    const prepared = kind === 'reserve' ? prepareFormanceManagedCallReservation(booking)
      : prepareFormanceManagedCallRelease({ booking, submissionProvenAbsent: true, externalEvidenceDigest })
    if (prepared.kind !== 'prepared') return false
    const command = prepared.bulk.commands.find(row => row.template === (kind === 'reserve' ? 'CALL_RESERVED_USDC' : 'CALL_RELEASED_USDC'))
    if (command === undefined) return false
    return matchesCommand(transaction, command, kind === 'reserve'
      ? [expectedPosting(command, 'source', 'destination', 'amount')]
      : [expectedPosting(command, 'treasury_committed', 'treasury_available', 'amount'),
          expectedPosting(command, 'obligation_accrued', 'expense', 'amount')])
  } catch { return false }
}

/** Returns the complete exact native reference set, or refuses the entire batch. */
export function matchTreasuryBatch(transactions: readonly FormanceTreasuryAuditTransaction[],
  identity: TreasuryIdentity, batch: TreasuryBatch): readonly string[] | undefined {
  try {
    const prepared = prepareFormanceTreasuryBatch(identity, batch)
    if (prepared.kind !== 'prepared' || batch.state.kind !== 'booked'
      || prepared.commands.length !== batch.state.transactionRefs.length) return undefined
    const refs: string[] = []
    for (const command of prepared.commands) {
      if (!batch.state.transactionRefs.includes(command.commandRef)) return undefined
      const candidates = transactions.filter(row => row.commandRef === command.commandRef)
      const transaction = candidates[0]
      const credit = command.template === 'TREASURY_CAPACITY_SYNCED'
      if (candidates.length !== 1 || transaction === undefined || !matchesCommand(transaction, command,
        [expectedPosting(command, credit ? 'world' : 'source', credit ? 'capacity' : 'destination', 'amount')])) return undefined
      refs.push(command.commandRef)
    }
    return refs
  } catch { return undefined }
}

/** Funding history includes unattributed credits and compensation, regardless of template. */
export function isTreasuryFundingAuditTransaction(row: FormanceTreasuryAuditTransaction): boolean {
  return (row.template !== null && FUNDING_TEMPLATES.has(row.template)) || row.postings.some(posting =>
    ((PROCESSOR_SETTLEMENT.test(posting.source) || posting.source === 'world') && PURCHASED_AVAILABLE.test(posting.destination))
    || (PURCHASED_AVAILABLE.test(posting.source) && (PROCESSOR_SETTLEMENT.test(posting.destination) || posting.destination === 'world')))
}

/** Native purchased principal movement, not current customer liability or gross card consideration. */
export function treasuryFundingPrincipalDelta(row: FormanceTreasuryAuditTransaction): string | undefined {
  try {
    let units = 0n
    for (const posting of row.postings) {
      if (posting.asset !== 'AUD/6') continue
      if (formanceSafeUnitsFromSdk(posting.amountUnits) === undefined) return undefined
      if (PURCHASED_AVAILABLE.test(posting.destination)) units += BigInt(posting.amountUnits)
      if (PURCHASED_AVAILABLE.test(posting.source)) units -= BigInt(posting.amountUnits)
    }
    return units >= -BigInt(Number.MAX_SAFE_INTEGER) && units <= BigInt(Number.MAX_SAFE_INTEGER) ? units.toString() : undefined
  } catch { return undefined }
}

export function treasuryAuditCallDigest(booking: FormanceManagedCallBooking): string | undefined {
  const prepared = prepareFormanceManagedCallReservation(booking)
  return prepared.kind === 'prepared' ? prepared.bulk.commands[0]?.metadata.call_digest : undefined
}
