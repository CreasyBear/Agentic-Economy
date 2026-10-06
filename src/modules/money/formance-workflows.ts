"use node"

import {
  executeFormanceMoneyBulk,
  executeFormanceMoneyCommand,
  readFormanceAccount,
  readFormanceSignedAccount,
  readFormanceTransactionByReference,
  type FormanceContext,
  type FormanceMoneyResult,
  type FormanceMoneyCommand,
  type FormanceReferenceReadResult,
} from './formance'
import { completed, completedMany, refused, unavailable, unknown, type FormanceSettlementReadResult, type FormanceReservationReadResult, type FormanceReleaseReadResult } from './formance-result'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  prepareFormanceSettledSaleRefund,
  formanceCommandPostingsMatch,
  type FormanceSettledSaleRefund,
} from './internal/formance-settled-sale-refund'
import {
  prepareFormancePromotionalCreditGrant,
  prepareFormancePromotionalCreditExpiry,
  type FormancePromotionalCreditBooking,
} from './internal/formance-promotional-credit'
import {
  balanceAccount,
  balanceAsset,
  boundedReference,
  capacityAccount,
  expectedProviderSettlementCommand,
  formanceSpendingPeriodAccount,
  positiveGeneration,
  prepareFormanceBuyerAdjustment,
  prepareFormanceCapacitySync,
  prepareFormanceFundingReversal,
  prepareFormanceFundingSettlement,
  prepareFormanceManagedCallRelease,
  prepareFormanceManagedCallReservation,
  prepareFormanceManagedCallSettlement,
  prepareFormancePaidCallRemedy,
  prepareFormanceProviderReversal,
  prepareFormanceSpendingPeriodAdjustment,
  spendingPeriodIdentity,
  type FormanceBalanceKind,
  type FormanceBuyerAdjustment,
  type FormanceCapacitySync,
  type FormanceFundingBooking,
  type FormanceManagedCallBooking,
  type FormanceManagedCallFinalization,
  type FormanceManagedCallRelease,
  type FormanceProviderReversal,
  type FormanceSpendingPeriodAdjustment,
  type FormanceSpendingPeriodKind,
  type PreparedCommand,
  type PreparedManagedCallBulk,
} from './internal/formance-transaction-templates'

import {
  planHoldAccountAddress,
  planPromotionalHoldAccountAddress,
  validPlanRemainder,
  preparePlanHold,
  preparePlanNodeAllocation,
  preparePlanNodeRelease,
  preparePlanNodeSettlement,
  preparePlanRemainderRelease,
  type PlanHoldBooking,
  type PlanNodeAllocation,
  type PlanNodeRelease,
  type PlanNodeSettlement,
  type PlanRelease,
} from './internal/formance-plan-templates'

export * from './internal/formance-plan-templates'
export * from './internal/formance-transaction-templates'
export * from './internal/formance-promotional-credit'
export { prepareFormanceSettledSaleRefund }
export type { FormanceSettledSaleRefund }
export type { FormanceSettlementReadResult, FormanceReservationReadResult, FormanceReleaseReadResult } from './formance-result'

export type FormanceDisplayBalanceResult =
  | Readonly<{
      kind: 'available'
      balanceKind: FormanceBalanceKind
      subjectRef: string
      generation?: number
      currency: 'AUD' | 'USDC'
      exponent: 6
      units: string
      observedAt: number
      source: 'formance_live_read'
      authoritativeForConsequences: false
    }>
  | Readonly<{ kind: 'setup_required'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>

export type FormanceLegalCustomerRebindResult =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{
      kind: 'refused'
      code: 'legal_customer_capacity_reserved' | 'legal_customer_calls_pending'
    }>
  | Readonly<{ kind: 'setup_required'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>

export async function bookFormanceFundingSettlement(
  context: FormanceContext,
  input: FormanceFundingBooking,
): Promise<FormanceMoneyResult> {
  return executePrepared(context, prepareFormanceFundingSettlement(input))
}

export async function bookFormanceFundingReversal(
  context: FormanceContext,
  input: FormanceFundingBooking,
): Promise<FormanceMoneyResult> {
  return executePrepared(context, prepareFormanceFundingReversal(input))
}

export async function grantFormancePromotionalCredit(
  context: FormanceContext,
  input: FormancePromotionalCreditBooking,
): Promise<FormanceMoneyResult> {
  return executePromotionalCredit(context, prepareFormancePromotionalCreditGrant(input))
}

export async function expireFormancePromotionalCredit(
  context: FormanceContext,
  input: FormancePromotionalCreditBooking,
): Promise<FormanceMoneyResult> {
  return executePromotionalCredit(context, prepareFormancePromotionalCreditExpiry(input))
}

/** Requires the original valid grant or frozen expiry command. Ensures completion
 * only after exact reference/template/all metadata/world postings are confirmed.
 * Invariant: retain the maintained writer's schema/idempotency/revision behavior;
 * no existing conflict can create another posting. This is history, not current
 * global spendability or reconstruction of lost administrative approval.
 * On violation: preflight conflict refuses before writes; unavailable preflight
 * retains the existing no-write result. Failed confirmation after a possible
 * write is uncertain at the original reference, never submission-proven-absent.
 */
async function executePromotionalCredit(
  context: FormanceContext,
  prepared: PreparedCommand,
): Promise<FormanceMoneyResult> {
  if (prepared.kind === 'refused') return prepared
  const command: FormanceMoneyCommand = prepared.command
  const matches = (actual: Extract<FormanceReferenceReadResult, { kind: 'found' }>): boolean =>
    actual.reference === command.commandRef && actual.template === command.template
    && Object.entries(command.metadata).every(([key, value]) => actual.metadata[key] === value)
    && formanceCommandPostingsMatch(command, actual.postings)
  const existing = await readFormanceTransactionByReference(context, command.commandRef)
  if (existing.kind === 'setup_required') return refused(existing.code)
  if (existing.kind === 'unavailable') return unavailable(existing.code)
  if (existing.kind === 'found' && !matches(existing)) return refused('formance_promotional_credit_evidence_invalid')
  // Retain the original schema gate and native writer even for proven replay.
  const posted = await executeFormanceMoneyCommand(context, command)
  if (posted.kind !== 'completed') return posted
  const actual = await readFormanceTransactionByReference(context, command.commandRef)
  if (actual.kind === 'setup_required') return refused(actual.code)
  if (actual.kind !== 'found') return unknown(command.commandRef)
  if (!matches(actual)) return refused('formance_promotional_credit_evidence_invalid')
  return posted
}

export async function reserveFormanceManagedCall(
  context: FormanceContext,
  input: FormanceManagedCallBooking,
): Promise<FormanceMoneyResult> {
  return executePreparedBulk(context, prepareFormanceManagedCallReservation(input))
}

/**
 * Places the authorized Plan's exact aggregate capacity Hold in one atomic bulk.
 * A native timeout or incomplete reference set remains outcome_unknown.
 */
export async function reservePlanHold(
  context: FormanceContext,
  input: PlanHoldBooking,
): Promise<FormanceMoneyResult> {
  return executePreparedBulk(context, preparePlanHold(input))
}

/** Allocates a Node from the existing Plan Hold without debiting capacity again. */
export async function allocatePlanNode(
  context: FormanceContext,
  input: PlanNodeAllocation,
): Promise<FormanceMoneyResult> {
  return executePreparedBulk(context, preparePlanNodeAllocation(input))
}

/** Settles a Node's accepted buyer reservation; it does not reserve capacity again. */
export async function settlePlanNode(
  context: FormanceContext,
  input: PlanNodeSettlement,
): Promise<FormanceMoneyResult> {
  return executePreparedBulk(context, preparePlanNodeSettlement(input))
}

/** Releases a Node's unused reservation to available capacity. */
export async function releasePlanNode(
  context: FormanceContext,
  input: PlanNodeRelease,
): Promise<FormanceMoneyResult> {
  return executePreparedBulk(context, preparePlanNodeRelease(input))
}

/** Read-only native remainder used to freeze the terminal release command. */
export async function readPlanHoldRemainder(context: FormanceContext, input: PlanHoldBooking): Promise<
  | Readonly<{ kind: 'available'; holdBalanceUnits: string; remainingCreditAllocation?: NonNullable<PlanHoldBooking['promotionalCreditAllocation']> }>
  | Readonly<{ kind: 'unavailable' | 'refused'; code: string }>
> {
  const hold = preparePlanHold(input)
  if (hold.kind === 'refused') return hold
  const proof = await readPlanCommands(context, hold.bulk.commands)
  if (proof.kind !== 'confirmed') return proof.kind === 'absent'
    ? { kind: 'refused', code: 'formance_plan_hold_evidence_missing' } : proof
  const addresses = [planHoldAccountAddress(input), ...(input.promotionalCreditAllocation?.grants ?? [])
    .map(grant => planPromotionalHoldAccountAddress(input, grant.grantRef))]
  const units: string[] = []
  for (const address of addresses) {
    const read = await readFormanceAccount(context, address)
    if (read.kind === 'setup_required') return { kind: 'refused', code: read.code }
    if (read.kind === 'unavailable') return { kind: 'unavailable', code: read.code }
    const balance = read.kind === 'not_found' ? '0' : read.volumes['AUD/6']?.balanceUnits ?? '0'
    if (!/^(?:0|[1-9]\d{0,15})$/u.test(balance)) return { kind: 'refused', code: 'formance_plan_hold_balance_invalid' }
    units.push(balance)
  }
  const purchasedUnits = units[0]
  if (purchasedUnits === undefined) return { kind: 'refused', code: 'formance_plan_hold_balance_invalid' }
  const holdBalanceUnits = units.reduce((sum, amount) => sum + BigInt(amount), 0n).toString()
  const allocation = input.promotionalCreditAllocation === undefined ? {} : { remainingCreditAllocation: {
    version: 'ae.promotional-credit-allocation:v1' as const, purchasedUnits,
    grants: input.promotionalCreditAllocation.grants.flatMap((grant, index) => {
      const amountUnits = units[index + 1]
      return amountUnits === undefined || amountUnits === '0' ? [] : [{ ...grant, amountUnits }]
    }),
  } }
  return { kind: 'available', holdBalanceUnits, ...allocation }
}

/** Requires a financially conclusive Plan and its frozen, native-read remainder.
 * Ensures an exact atomic release or proven replay, including every original grant.
 * Invariant: unknown/missing Hold evidence never becomes a successful zero refund.
 * On violation: refuse conflicting evidence; unavailable/partial reads retain uncertainty.
 */
export async function releasePlanRemainder(context: FormanceContext, input: PlanRelease): Promise<FormanceMoneyResult> {
  if (!validPlanRemainder(input) || input.allNodeCallsFinanciallyConclusive !== true
    || !/^sha256:[a-f0-9]{64}$/u.test(input.terminalEvidenceDigest)
    || !/^(?:0|[1-9]\d{0,15})$/u.test(input.holdBalanceUnits)
    || BigInt(input.holdBalanceUnits) > BigInt(input.approvedTotalUnits)) return refused('formance_plan_release_input_invalid')
  const prepared = input.holdBalanceUnits === '0' ? undefined : preparePlanRemainderRelease(input)
  if (prepared?.kind === 'refused') return prepared
  if (prepared !== undefined) {
    const replay = await readPlanCommands(context, prepared.bulk.commands)
    if (replay.kind === 'confirmed') return completedMany(prepared.bulk.commands.map(command => command.commandRef), true)
    if (replay.kind === 'refused') return replay.code === 'formance_plan_evidence_partial'
      ? unknown(prepared.bulk.commands[0]?.commandRef ?? input.planRef) : refused(replay.code)
    if (replay.kind === 'unavailable') return unknown(prepared.bulk.commands[0]?.commandRef ?? input.planRef)
  }
  const current = await readPlanHoldRemainder(context, input)
  if (current.kind !== 'available') return current.kind === 'refused' ? refused(current.code) : unavailable(current.code)
  if (current.holdBalanceUnits !== input.holdBalanceUnits
    || canonicalDigest(current.remainingCreditAllocation ?? null) !== canonicalDigest(input.remainingCreditAllocation ?? null)) {
    return refused('formance_plan_remainder_changed')
  }
  return prepared === undefined ? completedMany([], false) : executePreparedBulk(context, prepared)
}

async function readPlanCommands(context: FormanceContext, commands: readonly FormanceMoneyCommand[]): Promise<
  | Readonly<{ kind: 'confirmed' }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'refused' | 'unavailable'; code: string }>
> {
  let found = 0
  for (const expected of commands) {
    const actual = await readFormanceTransactionByReference(context, expected.commandRef)
    if (actual.kind === 'setup_required') return { kind: 'refused', code: actual.code }
    if (actual.kind === 'unavailable') return { kind: 'unavailable', code: actual.code }
    if (actual.kind === 'absent') continue
    if (actual.template !== expected.template || actual.reference !== expected.commandRef
      || !formanceCommandPostingsMatch(expected, actual.postings)
      || Object.entries(expected.metadata).some(([key, value]) => actual.metadata[key] !== value)) {
      return { kind: 'refused', code: 'formance_plan_evidence_invalid' }
    }
    found += 1
  }
  return found === commands.length ? { kind: 'confirmed' } : found === 0 ? { kind: 'absent' }
    : { kind: 'refused', code: 'formance_plan_evidence_partial' }
}

/**
 * Requires: the original valid frozen booking and its configured native ledger.
 * Ensures: confirms the complete ordered original reservation only when every
 *   native reference, template, expected metadata value and posting matches.
 * Invariant: no writes; this proves historical booking, not current capacity,
 *   payment absence, delivery or authority to release/retry the payment.
 * On violation: missing/partial/reverted/conflicting evidence refuses; failed
 *   reads remain unavailable. At most eight native reads run in each batch.
 */
export async function readFormanceManagedCallReservation(
  context: FormanceContext,
  booking: FormanceManagedCallBooking,
): Promise<FormanceReservationReadResult> {
  const prepared = prepareFormanceManagedCallReservation(booking)
  if (prepared.kind === 'refused') {
    return Object.freeze({ kind: 'refused', code: 'formance_reservation_evidence_invalid' })
  }
  const commands = prepared.bulk.commands
  for (let offset = 0; offset < commands.length; offset += 8) {
    const batch = commands.slice(offset, offset + 8)
    const reads = await Promise.all(batch.map(async command =>
      await readFormanceTransactionByReference(context, command.commandRef)))
    for (const [index, expected] of batch.entries()) {
      const actual = reads[index]
      if (actual?.kind === 'setup_required') return Object.freeze({ kind: 'refused', code: actual.code })
      if (actual?.kind === 'unavailable') return Object.freeze({ kind: 'unavailable', code: actual.code })
      if (actual?.kind !== 'found' || actual.reference !== expected.commandRef
        || actual.template !== expected.template
        || !formanceCommandPostingsMatch(expected, actual.postings)
        || Object.entries(expected.metadata).some(([key, value]) => actual.metadata[key] !== value)) {
        return Object.freeze({ kind: 'refused', code: 'formance_reservation_evidence_invalid' })
      }
    }
  }
  return Object.freeze({ kind: 'confirmed',
    transactionRefs: Object.freeze(commands.map(command => command.commandRef)),
  })
}

export async function releaseFormanceManagedCall(
  context: FormanceContext,
  input: FormanceManagedCallRelease,
): Promise<FormanceMoneyResult> {
  return executePreparedBulk(context, prepareFormanceManagedCallRelease(input))
}

/**
 * Requires: the original valid frozen booking and its configured native ledger.
 * Ensures: confirms only the complete original unpaid release, including treasury
 *   return and obligation release, with exact references/metadata/postings.
 * Invariant: read-only historical accounting; no assertion of payment absence,
 *   original release authority, current spendability or delivery. Paid-result
 *   remedy shares the buyer release but cannot satisfy this complete bundle.
 * On violation: missing/partial/reverted/conflicting evidence refuses; failed
 *   reads stay unavailable. At most eight native reads run in each batch.
 */
export async function readFormanceManagedCallRelease(
  context: FormanceContext,
  booking: FormanceManagedCallBooking,
): Promise<FormanceReleaseReadResult> {
  // The flag is only a builder precondition for reconstructing historical
  // commands. It is never projected as an authority or absence assertion.
  const identity = prepareFormanceManagedCallRelease({ booking,
    externalEvidenceDigest: booking.x402RequirementDigest, submissionProvenAbsent: true,
  })
  if (identity.kind === 'refused') {
    return Object.freeze({ kind: 'refused', code: 'formance_release_evidence_invalid' })
  }
  const firstRef = identity.bulk.commands[0]?.commandRef
  if (firstRef === undefined) return Object.freeze({ kind: 'refused', code: 'formance_release_evidence_invalid' })
  const first = await readFormanceTransactionByReference(context, firstRef)
  if (first.kind === 'setup_required') return Object.freeze({ kind: 'refused', code: first.code })
  if (first.kind === 'unavailable') return Object.freeze({ kind: 'unavailable', code: first.code })
  if (first.kind !== 'found' || !/^[a-f0-9]{64}$/u.test(first.metadata.external_evidence_digest ?? '')) {
    return Object.freeze({ kind: 'refused', code: 'formance_release_evidence_invalid' })
  }
  const prepared = prepareFormanceManagedCallRelease({ booking, submissionProvenAbsent: true,
    externalEvidenceDigest: `sha256:${first.metadata.external_evidence_digest}`,
  })
  if (prepared.kind === 'refused') {
    return Object.freeze({ kind: 'refused', code: 'formance_release_evidence_invalid' })
  }
  const commands = prepared.bulk.commands
  for (let offset = 0; offset < commands.length; offset += 8) {
    const batch = commands.slice(offset, offset + 8)
    const reads = await Promise.all(batch.map(async (command, index) => offset === 0 && index === 0
      ? first : await readFormanceTransactionByReference(context, command.commandRef)))
    for (const [index, expected] of batch.entries()) {
      const actual = reads[index]
      if (actual?.kind === 'setup_required') return Object.freeze({ kind: 'refused', code: actual.code })
      if (actual?.kind === 'unavailable') return Object.freeze({ kind: 'unavailable', code: actual.code })
      if (actual?.kind !== 'found' || actual.reference !== expected.commandRef
        || actual.template !== expected.template || !formanceCommandPostingsMatch(expected, actual.postings)
        || Object.entries(expected.metadata).some(([key, value]) => actual.metadata[key] !== value)) {
        return Object.freeze({ kind: 'refused', code: 'formance_release_evidence_invalid' })
      }
    }
  }
  return Object.freeze({ kind: 'confirmed',
    transactionRefs: Object.freeze(commands.map(command => command.commandRef)),
  })
}

export async function settleFormanceManagedCall(
  context: FormanceContext,
  input: FormanceManagedCallFinalization,
): Promise<FormanceMoneyResult> {
  return executePreparedBulk(context, prepareFormanceManagedCallSettlement(input))
}

/**
 * Requires: the original valid frozen booking and its configured native ledger.
 * Ensures: confirms only the complete ordered settlement with exact native
 *   references, templates, metadata and postings reconstructed from that booking.
 * Invariant: read-only; accounting evidence does not establish delivery or
 *   authorize a replacement payment, release or refund.
 * On violation: missing/partial/conflicting evidence refuses; unavailable reads
 *   remain unavailable and never establish absence of an earlier payment.
 */
export async function readFormanceManagedCallSettlement(
  context: FormanceContext,
  booking: FormanceManagedCallBooking,
): Promise<FormanceSettlementReadResult> {
  // References depend on the original Call/Quote/stage, not on the external
  // evidence. This digest only derives the references; native proof follows.
  const identity = prepareFormanceManagedCallSettlement({
    booking, externalEvidenceDigest: booking.x402RequirementDigest,
  })
  if (identity.kind === 'refused') {
    return Object.freeze({ kind: 'refused', code: 'formance_settled_sale_evidence_invalid' })
  }
  const saleRef = identity.bulk.commands[0]?.commandRef
  if (saleRef === undefined) return Object.freeze({ kind: 'refused', code: 'formance_settled_sale_evidence_invalid' })
  const sale = await readFormanceTransactionByReference(context, saleRef)
  if (sale.kind === 'setup_required') return Object.freeze({ kind: 'refused', code: sale.code })
  if (sale.kind === 'unavailable') return Object.freeze({ kind: 'unavailable', code: sale.code })
  if (sale.kind !== 'found' || !/^[a-f0-9]{64}$/u.test(sale.metadata.external_evidence_digest ?? '')) {
    return Object.freeze({ kind: 'refused', code: 'formance_settled_sale_evidence_invalid' })
  }
  const original = prepareFormanceManagedCallSettlement({
    booking, externalEvidenceDigest: `sha256:${sale.metadata.external_evidence_digest}`,
  })
  if (original.kind === 'refused') {
    return Object.freeze({ kind: 'refused', code: 'formance_settled_sale_evidence_invalid' })
  }
  for (const [index, expected] of original.bulk.commands.entries()) {
    const actual = index === 0 ? sale : await readFormanceTransactionByReference(context, expected.commandRef)
    if (actual.kind === 'setup_required') return Object.freeze({ kind: 'refused', code: actual.code })
    if (actual.kind === 'unavailable') return Object.freeze({ kind: 'unavailable', code: actual.code })
    if (actual.kind !== 'found' || actual.reference !== expected.commandRef
      || actual.template !== expected.template
      || !formanceCommandPostingsMatch(expected, actual.postings)
      || Object.entries(expected.metadata).some(([key, value]) => actual.metadata[key] !== value)) {
      return Object.freeze({ kind: 'refused', code: 'formance_settled_sale_evidence_invalid' })
    }
  }
  return Object.freeze({ kind: 'confirmed',
    transactionRefs: Object.freeze(original.bulk.commands.map(command => command.commandRef)),
  })
}

/**
 * CONTRACT: refundFormanceSettledSale(context, input)
 *   Requires: the frozen booking and the complete ordered native settlement
 *     references, plus a canonical digest of the approved refund report.
 *   Ensures: executes the same atomic refund bulk on every replay only after
 *     each original settlement is proven by native readback against a command
 *     reconstructed from the sale's actual external evidence digest.
 *   Invariant: missing, unknown or conflicting original evidence never writes
 *     a refund; treasury and Provider settlement remain untouched.
 *   On violation: refuses on evidence conflict, or returns source unavailability
 *     without executing. Native write uncertainty uses the existing bulk result.
 */
export async function refundFormanceSettledSale(
  context: FormanceContext,
  input: FormanceSettledSaleRefund,
): Promise<FormanceMoneyResult> {
  const prepared = prepareFormanceSettledSaleRefund(input)
  if (prepared.kind === 'refused') return prepared
  const original = await readFormanceManagedCallSettlement(context, input.booking)
  if (original.kind === 'refused') return refused(original.code)
  if (original.kind === 'unavailable') return unavailable(original.code)
  if (original.transactionRefs.length !== input.originalSettlementRefs.length
    || original.transactionRefs.some((reference, index) => reference !== input.originalSettlementRefs[index])) {
    return refused('formance_settled_sale_evidence_invalid')
  }
  const posted = await executePreparedBulk(context, prepared)
  if (posted.kind !== 'completed') return posted
  // A successful submit/replay must still prove the exact financial effects.
  // Failure after submission is uncertain, never submission-proven-absent.
  for (const command of prepared.bulk.commands) {
    const actual = await readFormanceTransactionByReference(context, command.commandRef)
    if (actual.kind !== 'found') return unknown(command.commandRef)
    if (actual.template !== command.template || actual.reference !== command.commandRef
      || Object.entries(command.metadata).some(([key, value]) => actual.metadata[key] !== value)
      || !formanceCommandPostingsMatch(command, actual.postings)) return refused('formance_refund_evidence_invalid')
  }
  return posted
}

export async function remedyFormancePaidCall(
  context: FormanceContext,
  input: FormanceManagedCallFinalization,
): Promise<FormanceMoneyResult> {
  return executePreparedBulk(context, prepareFormancePaidCallRemedy(input))
}

export async function reverseFormanceProviderSettlement(
  context: FormanceContext,
  input: FormanceProviderReversal,
): Promise<FormanceMoneyResult> {
  const prepared = prepareFormanceProviderReversal(input)
  if (prepared.kind === 'refused') return prepared
  const expected = expectedProviderSettlementCommand(input)
  if (expected === undefined) return refused('formance_provider_reversal_input_invalid')
  const settlement = await readFormanceTransactionByReference(context, input.originalSettlementRef)
  if (settlement.kind === 'setup_required') return refused(settlement.code)
  if (settlement.kind === 'unavailable') return unavailable(settlement.code)
  if (settlement.kind !== 'found'
    || settlement.template !== 'PROVIDER_SETTLED'
    || settlement.metadata.account_digest !== expected.metadata.account_digest
    || settlement.metadata.call_digest !== expected.metadata.call_digest
    || settlement.metadata.provider_digest !== expected.metadata.provider_digest
    || settlement.metadata.policy_digest !== expected.metadata.policy_digest) {
    return refused('formance_provider_settlement_evidence_invalid')
  }
  return await executeFormanceMoneyCommand(context, prepared.command)
}

export async function bookFormanceBuyerAdjustment(
  context: FormanceContext,
  input: FormanceBuyerAdjustment,
): Promise<FormanceMoneyResult> {
  return executePrepared(context, prepareFormanceBuyerAdjustment(input))
}

/**
 * Requires a validated capacity identity and current observation. Ensures each
 * generation is funded once. Treasury observation refreshes reuse the original
 * verified initialization; they never replenish spent or reserved capacity.
 * Policy or posting mismatches remain conflicts. Quote admission separately
 * caps native available capacity by the current wallet observation.
 */
export async function syncFormanceCapacity(
  context: FormanceContext,
  input: FormanceCapacitySync,
): Promise<FormanceMoneyResult> {
  const prepared = prepareFormanceCapacitySync(input)
  if (prepared.kind === 'refused') return prepared
  const existing = await readFormanceTransactionByReference(context, prepared.command.commandRef)
  if (existing.kind === 'found') {
    // A wallet observation changes as payments settle. Reconstruct the original
    // initialization from its evidence, rather than treating a refresh as funding.
    const posting = existing.postings[0]
    const original = input.kind === 'treasury_usdc'
      && existing.postings.length === 1
      && posting?.source === 'world'
      && posting.destination === prepared.command.variables.capacity
      && posting.asset === 'USDC/6'
      ? prepareFormanceCapacitySync({
          ...input,
          targetUnits: posting.amountUnits,
          externalEvidenceDigest: `sha256:${existing.metadata.external_evidence_digest}`,
        })
      : input.kind === 'treasury_usdc' ? undefined : prepared
    return existing.template === 'TREASURY_CAPACITY_SYNCED'
      && original?.kind === 'prepared'
      && existing.metadata.command_digest === original.command.metadata.command_digest
      && existing.metadata.idempotency_digest === prepared.command.metadata.idempotency_digest
      ? completed(prepared.command.commandRef, true)
      : refused('formance_reference_conflict')
  }
  if (existing.kind === 'setup_required') return refused(existing.code)
  if (existing.kind === 'unavailable') return unavailable(existing.code)
  return await executeFormanceMoneyCommand(context, prepared.command)
}

/**
 * CONTRACT: adjustFormanceSpendingPeriod(context, input)
 *   Requires: a valid UTC day/month interval, a positive authoritative
 *     revision, canonical nonnegative previous/target ceilings, and a signed
 *     authority digest. The previous ceiling is supplied by the durable
 *     control row; it is never read from native balance.
 *   Ensures: applies exactly target - previous once, using a stable
 *     principal/period/revision reference and idempotency key. A decrease may
 *     retire an exact delta into a negative available capacity balance; an
 *     increase credits the period from @world. Equal ceilings produce a
 *     successful no-op with no transaction reference.
 *   Invariant: spending-period accounts remain stable by principal, kind, and
 *     UTC start; no purchase or buyer account is mutated by this command.
 *   On violation: returns a non-retryable refusal before reading or writing the
 *     ledger. Native ambiguity remains outcome_unknown through the existing
 *     exact-reference executor.
 */
export async function adjustFormanceSpendingPeriod(
  context: FormanceContext,
  input: FormanceSpendingPeriodAdjustment,
): Promise<FormanceMoneyResult> {
  const delta = BigInt(input.targetLimitUnits) - BigInt(input.previousLimitUnits)
  if (delta === 0n) {
    return Object.freeze({ kind: 'completed', transactionRefs: Object.freeze([]), replayed: false })
  }
  return executePrepared(context, prepareFormanceSpendingPeriodAdjustment(input))
}

/**
 * CONTRACT: readFormanceSpendingPeriod(context, input)
 *   Requires: a genuine UTC day or month interval. The account is derived from
 *     the supplied principal and period identity, never from the current clock.
 *   Ensures: returns the native available capacity with negative deficits
 *     clamped to spendable zero and marks the read non-authoritative for an
 *     admission consequence.
 *   Invariant: the ledger remains the only usage/balance authority; this query
 *     does not create, reset, or alter a period account.
 *   On violation: returns setup_required for malformed periods or unsafe data,
 *     unavailable for source failures, and not a magic numeric fallback.
 */
export async function readFormanceSpendingPeriod(
  context: FormanceContext,
  input: Readonly<{
    principalRef: string
    periodKind: FormanceSpendingPeriodKind
    periodStartAt: number
    periodEndAt: number
  }>,
): Promise<
  | Exclude<FormanceDisplayBalanceResult, { kind: 'available' }>
  | (Extract<FormanceDisplayBalanceResult, { kind: 'available' }> & { currency: 'AUD'; balanceKind: 'agent_budget' })
> {
  if (spendingPeriodIdentity(input) === undefined) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_spending_period_input_invalid' })
  }
  const read = await readFormanceSignedAccount(
    context,
    formanceSpendingPeriodAccount(input.principalRef, input.periodKind, input.periodStartAt).available,
  )
  if (read.kind === 'setup_required' || read.kind === 'unavailable') return read
  const balance = read.kind === 'not_found' ? '0' : read.volumes['AUD/6']?.balanceUnits ?? '0'
  const units = BigInt(balance) < 0n ? '0' : balance
  return Object.freeze({
    kind: 'available',
    balanceKind: 'agent_budget',
    subjectRef: input.principalRef,
    currency: 'AUD',
    exponent: 6,
    units,
    observedAt: Date.now(),
    source: 'formance_live_read',
    authoritativeForConsequences: false,
  })
}

export async function readFormanceDisplayBalance(
  context: FormanceContext,
  input: Readonly<{
    balanceKind: FormanceBalanceKind
    subjectRef: string
    generation?: number
    now?: number
  }>,
): Promise<FormanceDisplayBalanceResult> {
  if (!boundedReference(input.subjectRef)) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_balance_subject_invalid' })
  }
  if (input.balanceKind !== 'account_aud' && !positiveGeneration(input.generation)) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_balance_generation_invalid' })
  }
  const observedAt = input.now ?? Date.now()
  if (!Number.isSafeInteger(observedAt) || observedAt < 0) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_balance_time_invalid' })
  }
  const address = balanceAccount(input.balanceKind, input.subjectRef, input.generation)
  const asset = balanceAsset(input.balanceKind)
  const read = await readFormanceAccount(context, address)
  if (read.kind === 'setup_required' || read.kind === 'unavailable') return read
  const units = read.kind === 'not_found' ? '0' : read.volumes[asset]?.balanceUnits ?? '0'
  return Object.freeze({
    kind: 'available',
    balanceKind: input.balanceKind,
    subjectRef: input.subjectRef,
    ...(input.generation === undefined ? {} : { generation: input.generation }),
    currency: asset === 'AUD/6' ? 'AUD' : 'USDC',
    exponent: 6,
    units,
    observedAt,
    source: 'formance_live_read',
    authoritativeForConsequences: false,
  })
}

export async function canRebindFormanceLegalCustomer(
  context: FormanceContext,
  input: Readonly<{
    legalCustomerRef: string
    generation: number
    pendingCallCount: number
  }>,
): Promise<FormanceLegalCustomerRebindResult> {
  if (!boundedReference(input.legalCustomerRef)
    || !positiveGeneration(input.generation)
    || !Number.isSafeInteger(input.pendingCallCount)
    || input.pendingCallCount < 0) {
    return Object.freeze({ kind: 'setup_required', code: 'legal_customer_rebind_input_invalid' })
  }
  if (input.pendingCallCount > 0) {
    return Object.freeze({ kind: 'refused', code: 'legal_customer_calls_pending' })
  }
  const read = await readFormanceAccount(
    context,
    capacityAccount('legal_customer_exposure', input.legalCustomerRef, input.generation).replace(
      /:exposure_available$/u,
      ':exposure_reserved',
    ),
  )
  if (read.kind === 'setup_required' || read.kind === 'unavailable') return read
  const reserved = read.kind === 'not_found' ? '0' : read.volumes['AUD/6']?.balanceUnits ?? '0'
  return reserved === '0'
    ? Object.freeze({ kind: 'allowed' })
    : Object.freeze({ kind: 'refused', code: 'legal_customer_capacity_reserved' })
}

async function executePrepared(
  context: FormanceContext,
  prepared: PreparedCommand,
): Promise<FormanceMoneyResult> {
  return prepared.kind === 'refused'
    ? prepared
    : await executeFormanceMoneyCommand(context, prepared.command)
}

async function executePreparedBulk(
  context: FormanceContext,
  prepared: PreparedManagedCallBulk,
): Promise<FormanceMoneyResult> {
  return prepared.kind === 'refused'
    ? prepared
    : await executeFormanceMoneyBulk(context, prepared.bulk)
}
