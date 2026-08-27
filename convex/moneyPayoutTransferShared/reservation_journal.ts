import type { QueryCtx } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import {
  addExactAmounts,
  amountFromParts,
  compareExactAmounts,
  sameEvidenceRefs,
  type ExactAmount,
  type MoneyAccount,
} from '../../src/modules/money/public'

const everyFact = (facts: readonly boolean[]): boolean => facts.every(Boolean)

const satisfiesWhen = (condition: boolean, fact: boolean): boolean =>
  !condition || fact

function allDefined<T extends readonly unknown[]>(
  values: T,
): values is T & { [Key in keyof T]: Exclude<T[Key], undefined> } {
  return values.every((value) => value !== undefined)
}

type PayoutTransferRowInput = Readonly<{
  providerAccountRef: string
  destinationAccountId: string
  commandId: string
  inputDigest: string
  requestDigest: string
  idempotencyKey: string
  state:
    | 'review'
    | 'held_kyc'
    | 'held_threshold'
    | 'transfer_pending'
    | 'paid'
    | 'reversed'
    | 'failed'
    | 'outcome_unknown'
  transferStatus:
    'pending' | 'succeeded' | 'failed' | 'reversed' | 'outcome_unknown'
  stripeTransferId?: string
  evidenceDigest?: string
  reversalEvidenceDigest?: string
  transferObservedAt?: number
  updatedAt?: number
  providerRecoveryDeadlineAt?: number
  failureCode?: string
  providerHeldBefore?: ExactAmount
  providerHeldAfter?: ExactAmount
  providerPaidBefore?: ExactAmount
  providerPaidAfter?: ExactAmount
}>

export function payoutTransferView(
  row: Doc<'moneyPayouts'>,
  amountOverride?: ExactAmount,
) {
  const amount =
    amountOverride ??
    amountFromParts(
      row.currency,
      row.providerNetUnits,
      row.exponent,
    )
  const providerHeldBefore =
    row.providerHeldBeforeUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.providerHeldBeforeUnits, row.exponent)
  const providerHeldAfter =
    row.providerHeldAfterUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.providerHeldAfterUnits, row.exponent)
  const providerPaidBefore =
    row.providerPaidBeforeUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.providerPaidBeforeUnits, row.exponent)
  const providerPaidAfter =
    row.providerPaidAfterUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.providerPaidAfterUnits, row.exponent)
  if (
    amount === undefined ||
    row.payoutCommandId === undefined ||
    row.inputDigest === undefined ||
    row.destinationAccountId === undefined ||
    ((row.state === 'paid' || row.state === 'reversed') &&
      (providerHeldBefore === undefined ||
        providerHeldAfter === undefined ||
        providerPaidBefore === undefined ||
        providerPaidAfter === undefined))
  )
    return undefined
  return {
    payoutRef: row.payoutRef,
    payoutCommandId: row.payoutCommandId,
    state: row.state,
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    amount,
    destinationAccountId: row.destinationAccountId,
    ...(row.stripeTransferId === undefined
      ? {}
      : { stripeTransferId: row.stripeTransferId }),
    ...(row.transferStatus === undefined
      ? {}
      : { transferStatus: row.transferStatus }),
    ...(row.transferRequestDigest === undefined
      ? {}
      : { requestDigest: row.transferRequestDigest }),
    ...((row.transferReversalEvidenceDigest ?? row.transferEvidenceDigest) ===
    undefined
      ? {}
      : {
          evidenceDigest:
            row.transferReversalEvidenceDigest ?? row.transferEvidenceDigest,
        }),
    ...(row.transferReversalEvidenceDigest === undefined
      ? {}
      : { reversalEvidenceDigest: row.transferReversalEvidenceDigest }),
    ...(row.providerRecoveryDeadlineAt === undefined
      ? {}
      : { providerRecoveryDeadlineAt: row.providerRecoveryDeadlineAt }),
    ...(providerHeldBefore === undefined ? {} : { providerHeldBefore }),
    ...(providerHeldAfter === undefined ? {} : { providerHeldAfter }),
    ...(providerPaidBefore === undefined ? {} : { providerPaidBefore }),
    ...(providerPaidAfter === undefined ? {} : { providerPaidAfter }),
  }
}

export function payoutTransferRow(
  row: Doc<'moneyPayouts'>,
  input: PayoutTransferRowInput,
) {
  return {
    payoutRef: row.payoutRef,
    businessId: row.businessId,
    currency: row.currency,
    exponent: row.exponent,
    grossAccrualUnits: row.grossAccrualUnits,
    rakeUnits: row.rakeUnits,
    providerNetUnits: row.providerNetUnits,
    minimumPayoutUnits: row.minimumPayoutUnits,
    ...(row.cadence === undefined ? {} : { cadence: row.cadence }),
    state: input.state,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    providerAccountRef: input.providerAccountRef,
    destinationAccountId: input.destinationAccountId,
    payoutCommandId: input.commandId,
    inputDigest: input.inputDigest,
    transferRequestDigest: input.requestDigest,
    ...(input.stripeTransferId === undefined
      ? {}
      : { stripeTransferId: input.stripeTransferId }),
    ...(input.evidenceDigest === undefined
      ? {}
      : { transferEvidenceDigest: input.evidenceDigest }),
    ...(input.reversalEvidenceDigest === undefined
      ? {}
      : { transferReversalEvidenceDigest: input.reversalEvidenceDigest }),
    ...(input.transferObservedAt === undefined
      ? {}
      : { transferObservedAt: input.transferObservedAt }),
    ...((input.providerRecoveryDeadlineAt ?? row.providerRecoveryDeadlineAt) ===
    undefined
      ? {}
      : {
          providerRecoveryDeadlineAt:
            input.providerRecoveryDeadlineAt ?? row.providerRecoveryDeadlineAt,
        }),
    transferStatus: input.transferStatus,
    ...(input.providerHeldBefore === undefined
      ? row.providerHeldBeforeUnits === undefined
        ? {}
        : { providerHeldBeforeUnits: row.providerHeldBeforeUnits }
      : { providerHeldBeforeUnits: input.providerHeldBefore.units }),
    ...(input.providerHeldAfter === undefined
      ? row.providerHeldAfterUnits === undefined
        ? {}
        : { providerHeldAfterUnits: row.providerHeldAfterUnits }
      : { providerHeldAfterUnits: input.providerHeldAfter.units }),
    ...(input.providerPaidBefore === undefined
      ? row.providerPaidBeforeUnits === undefined
        ? {}
        : { providerPaidBeforeUnits: row.providerPaidBeforeUnits }
      : { providerPaidBeforeUnits: input.providerPaidBefore.units }),
    ...(input.providerPaidAfter === undefined
      ? row.providerPaidAfterUnits === undefined
        ? {}
        : { providerPaidAfterUnits: row.providerPaidAfterUnits }
      : { providerPaidAfterUnits: input.providerPaidAfter.units }),
    idempotencyKey: input.idempotencyKey,
    ...(input.failureCode === undefined
      ? {}
      : { failureCode: input.failureCode }),
    createdAt: row.createdAt,
    updatedAt: input.updatedAt ?? row.updatedAt,
  }
}
type PayoutReservationIdentity = Readonly<{
  transactionRef: string
  sourceDigest: string
  evidenceRefs: readonly string[]
}>

export function payoutReservationIdentity(input: Readonly<{
  payoutRef: string
  payoutCommandId: string
  inputDigest: string
  requestDigest: string
  idempotencyKey: string
}>): PayoutReservationIdentity {
  return {
    transactionRef: canonicalDigest({
      format: 'money-payout-reservation-transaction:v1',
      payoutRef: input.payoutRef,
      payoutCommandId: input.payoutCommandId,
      inputDigest: input.inputDigest,
      idempotencyKey: input.idempotencyKey,
    }),
    sourceDigest: canonicalDigest({
      format: 'money-payout-reservation-source:v1',
      payoutRef: input.payoutRef,
      payoutCommandId: input.payoutCommandId,
      inputDigest: input.inputDigest,
      requestDigest: input.requestDigest,
      idempotencyKey: input.idempotencyKey,
    }),
    evidenceRefs: [
      `payout:${input.payoutRef}`,
      `payout-command:${input.payoutCommandId}`,
      `payout-input:${input.inputDigest}`,
      `payout-request:${input.requestDigest}`,
    ],
  }
}

export function payoutEvidenceSourceDigest(evidenceDigest: string): string {
  return canonicalDigest({
    format: 'money-payout-evidence:v1',
    evidence: evidenceDigest,
  })
}


export type PayoutReservationJournal =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{
      kind: 'found'
      identity: PayoutReservationIdentity
      transaction: Doc<'moneyTransactions'>
      debit: Doc<'moneyLedgerEntries'>
    }>

export async function readPayoutReservationJournal(
  ctx: Pick<QueryCtx, 'db'>,
  input: Readonly<{
    payoutRef: string
    payoutCommandId: string
    inputDigest: string
    requestDigest: string
    idempotencyKey: string
    amount?: ExactAmount
    providerAccountRef: string
    businessId: string
  }>,
): Promise<PayoutReservationJournal> {
  const identity = payoutReservationIdentity(input)
  const [byRefRows, byIdempotencyRows] = await Promise.all([
    ctx.db
      .query('moneyTransactions')
      .withIndex('by_transactionRef', (q) =>
        q.eq('transactionRef', identity.transactionRef),
      )
      .take(2),
    ctx.db
      .query('moneyTransactions')
      .withIndex('by_idempotencyKey', (q) =>
        q.eq('idempotencyKey', input.idempotencyKey),
      )
      .take(2),
  ])
  const byRef = byRefRows[0]
  const byIdempotency = byIdempotencyRows[0]
  if (!everyFact([byRefRows.length <= 1, byIdempotencyRows.length <= 1]))
    return { kind: 'conflict' }
  if (!everyFact([
    byRef === undefined || byRef.transactionRef === identity.transactionRef,
    byIdempotency === undefined || byIdempotency.transactionRef === identity.transactionRef,
  ]))
    return { kind: 'conflict' }
  if (byRef === undefined) return { kind: 'missing' }
  const debitRows = await ctx.db
    .query('moneyLedgerEntries')
    .withIndex('by_transactionRef', (q) =>
      q.eq('transactionRef', identity.transactionRef),
    )
    .take(2)
  const debit = debitRows[0]
  const reservationAmount =
    byRef.amountUnits === undefined
      ? undefined
      : amountFromParts(byRef.currency, byRef.amountUnits, byRef.exponent)
  if (debit === undefined) return { kind: 'conflict' }
  const requestedAmountMatches = input.amount === undefined || everyFact([
    byRef.amountUnits === input.amount.units,
    debit.amountUnits === input.amount.units,
    byRef.currency === input.amount.currency,
    byRef.exponent === input.amount.exponent,
    debit.currency === input.amount.currency,
    debit.exponent === input.amount.exponent,
  ])
  if (!everyFact([
    debitRows.length === 1,
    byRef.kind === 'payout_accrual',
    byRef.idempotencyKey === input.idempotencyKey,
    byRef.inputDigest === input.inputDigest,
    byRef.principalId === `business:${input.businessId}`,
    byRef.accountId === undefined,
    byRef.currency === (input.amount?.currency ?? byRef.currency),
    byRef.exponent === (input.amount?.exponent ?? byRef.exponent),
    byRef.amountUnits !== undefined,
    reservationAmount !== undefined,
    byRef.externalRef === input.payoutRef,
    byRef.reversalOf === undefined,
    debit.entryRef === `${identity.transactionRef}:payout-reservation`,
    debit.accountRef === input.providerAccountRef,
    debit.entryType === 'payout_accrual',
    debit.direction === 'debit',
    debit.amountUnits === byRef.amountUnits,
    debit.currency === byRef.currency,
    debit.exponent === byRef.exponent,
    debit.transactionRef === identity.transactionRef,
    debit.idempotencyKey === input.idempotencyKey,
    debit.businessId === input.businessId,
    debit.sourceDigest === identity.sourceDigest,
    sameEvidenceRefs(debit.evidenceRefs, identity.evidenceRefs),
    requestedAmountMatches,
  ]))
    return { kind: 'conflict' }
  return { kind: 'found', identity, transaction: byRef, debit }
}

export function payoutSnapshotAmounts(
  payout: Doc<'moneyPayouts'>,
): Readonly<{
  providerHeldBefore: ExactAmount
  providerHeldAfter: ExactAmount
  providerPaidBefore: ExactAmount
}> | undefined {
  if (
    payout.providerHeldBeforeUnits === undefined ||
    payout.providerHeldAfterUnits === undefined ||
    payout.providerPaidBeforeUnits === undefined
  )
    return undefined
  const providerHeldBefore = amountFromParts(
    payout.currency,
    payout.providerHeldBeforeUnits,
    payout.exponent,
  )
  const providerHeldAfter = amountFromParts(
    payout.currency,
    payout.providerHeldAfterUnits,
    payout.exponent,
  )
  const providerPaidBefore = amountFromParts(
    payout.currency,
    payout.providerPaidBeforeUnits,
    payout.exponent,
  )
  return providerHeldBefore === undefined ||
    providerHeldAfter === undefined ||
    providerPaidBefore === undefined
    ? undefined
    : { providerHeldBefore, providerHeldAfter, providerPaidBefore }
}

export function payoutReservationRowIdentityMatches(
  payout: Doc<'moneyPayouts'>,
  input: Readonly<{
    businessId: string
    payoutRef: string
    amount: ExactAmount
    providerAccountRef: string
    destinationAccountId: string
    payoutCommandId: string
    inputDigest: string
    requestDigest: string
    idempotencyKey: string
  }>,
): boolean {
  return (
    payout.payoutRef === input.payoutRef &&
    payout.businessId === input.businessId &&
    payout.currency === input.amount.currency &&
    payout.exponent === input.amount.exponent &&
    payout.providerAccountRef === input.providerAccountRef &&
    payout.destinationAccountId === input.destinationAccountId &&
    payout.payoutCommandId === input.payoutCommandId &&
    payout.inputDigest === input.inputDigest &&
    payout.transferRequestDigest === input.requestDigest &&
    payout.idempotencyKey === input.idempotencyKey
  )
}

export function payoutReservationCurrentAmountMatches(
  payout: Doc<'moneyPayouts'>,
  amount: ExactAmount,
): boolean {
  const providerNet = amountFromParts(
    payout.currency,
    payout.providerNetUnits,
    payout.exponent,
  )
  return (
    providerNet !== undefined &&
    compareExactAmounts(providerNet, amount) === 0
  )
}
export function payoutAttemptMaterialIsFrozen(
  payout: Doc<'moneyPayouts'>,
): boolean {
  return (
    payout.payoutCommandId !== undefined ||
    payout.inputDigest !== undefined ||
    payout.destinationAccountId !== undefined ||
    payout.transferRequestDigest !== undefined ||
    payout.transferStatus !== undefined ||
    payout.transferEvidenceDigest !== undefined ||
    payout.transferReversalEvidenceDigest !== undefined ||
    payout.stripeTransferId !== undefined ||
    payout.transferObservedAt !== undefined ||
    payout.providerRecoveryDeadlineAt !== undefined ||
    payout.providerHeldBeforeUnits !== undefined ||
    payout.providerHeldAfterUnits !== undefined ||
    payout.providerPaidBeforeUnits !== undefined ||
    payout.providerPaidAfterUnits !== undefined ||
    payout.failureCode !== undefined
  )
}


export function payoutAccountAfterReservationMatches(
  provider: MoneyAccount,
  transaction: Doc<'moneyTransactions'>,
  snapshots: Readonly<{
    providerHeldBefore: ExactAmount
    providerHeldAfter: ExactAmount
  }>,
  reservationAmount: ExactAmount,
): boolean {
  const reconstructedBefore = addExactAmounts(
    snapshots.providerHeldAfter,
    reservationAmount,
  )
  const balanceComparison = compareExactAmounts(
    provider.balance,
    snapshots.providerHeldAfter,
  )
  return (
    reconstructedBefore !== undefined &&
    compareExactAmounts(reconstructedBefore, snapshots.providerHeldBefore) === 0 &&
    transaction.expectedAccountVersion + 1 <= provider.version &&
    balanceComparison !== undefined &&
    balanceComparison !== -1 &&
    provider.recoveryDue.units === '0'
  )
}
type PayoutTerminalReplayInput = Readonly<{
  ctx: Pick<QueryCtx, 'db'>
  businessId: string
  currency: string
  amount: ExactAmount
  payout: Doc<'moneyPayouts'>
  provider: MoneyAccount
  journal: Extract<PayoutReservationJournal, { kind: 'found' }>
}>

export async function payoutTerminalReplayIsConsistent(
  input: PayoutTerminalReplayInput,
): Promise<boolean> {
  const { ctx, businessId, currency, amount, payout, provider, journal } = input
  const snapshots = payoutSnapshotAmounts(payout)
  const transaction = journal.transaction
  if (snapshots === undefined) return false
  if (!everyFact([
    payout.businessId === businessId,
    payout.currency === currency,
    payout.exponent === amount.exponent,
    payout.providerAccountRef === provider.accountRef,
    transaction.currency === amount.currency,
    transaction.exponent === amount.exponent,
    transaction.amountUnits === amount.units,
  ]))
    return false
  if (['pending', 'outcome_unknown'].includes(transaction.state)) {
    const [pendingRows, unknownRows] = await Promise.all([
      ctx.db
        .query('moneyPayouts')
        .withIndex('by_businessId_and_currency_and_state', (q) =>
          q.eq('businessId', businessId).eq('currency', currency).eq('state', 'transfer_pending'),
        )
        .take(2),
      ctx.db
        .query('moneyPayouts')
        .withIndex('by_businessId_and_currency_and_state', (q) =>
          q.eq('businessId', businessId).eq('currency', currency).eq('state', 'outcome_unknown'),
        )
        .take(2),
    ])
    if (!everyFact([
      pendingRows.every((row) => row._id === payout._id),
      unknownRows.every((row) => row._id === payout._id),
    ]))
      return false
    const expectedState =
      transaction.state === 'pending' ? 'transfer_pending' : 'outcome_unknown'
    return everyFact([
      payoutReservationCurrentAmountMatches(payout, amount),
      payout.state === expectedState,
      payoutAccountAfterReservationMatches(
        provider,
        transaction,
        snapshots,
        amount,
      ),
      satisfiesWhen(
        transaction.state === 'pending',
        payoutTransferView(payout)?.transferStatus === 'pending',
      ),
      satisfiesWhen(
        transaction.state === 'outcome_unknown',
        payoutTransferView(payout)?.transferStatus === 'outcome_unknown',
      ),
    ])
  }
  if (transaction.state === 'applied') {
    const expectedProviderHeldBeforeCandidate = addExactAmounts(
      snapshots.providerHeldAfter,
      amount,
    )
    const linkedReversals = await ctx.db
      .query('moneyTransactions')
      .withIndex('by_reversalOf', (q) =>
        q.eq('reversalOf', transaction.transactionRef),
      )
      .take(2)
    const providerPaidAfterCandidate =
      payout.providerPaidAfterUnits === undefined
        ? undefined
        : amountFromParts(
            payout.currency,
            payout.providerPaidAfterUnits,
            payout.exponent,
          )
    const expectedProviderPaidAfterCandidate = addExactAmounts(
      snapshots.providerPaidBefore,
      amount,
    )
    const appliedAmounts = [
      expectedProviderHeldBeforeCandidate,
      providerPaidAfterCandidate,
      expectedProviderPaidAfterCandidate,
    ] as const
    if (!allDefined(appliedAmounts)) return false
    const [
      expectedProviderHeldBefore,
      providerPaidAfter,
      expectedProviderPaidAfter,
    ] = appliedAmounts
    return everyFact([
      payout.state === 'paid',
      payoutTransferView(payout)?.transferStatus === 'succeeded',
      payout.stripeTransferId !== undefined,
      (payout.stripeTransferId?.length ?? 0) > 0,
      payout.transferEvidenceDigest !== undefined,
      (payout.transferEvidenceDigest?.length ?? 0) > 0,
      payout.transferReversalEvidenceDigest === undefined,
      linkedReversals.length === 0,
      compareExactAmounts(
        expectedProviderHeldBefore,
        snapshots.providerHeldBefore,
      ) === 0,
      compareExactAmounts(providerPaidAfter, expectedProviderPaidAfter) === 0,
      provider.version >= transaction.expectedAccountVersion + 1,
    ])
  }
  if (transaction.state !== 'reversed') return false
  const reversals = await ctx.db
    .query('moneyTransactions')
    .withIndex('by_reversalOf', (q) =>
      q.eq('reversalOf', transaction.transactionRef),
    )
    .take(2)
  const reversal = reversals[0]
  const reversalRef =
    reversal === undefined
      ? undefined
      : canonicalDigest({
          format: 'money-payout-reversal-transaction:v1',
          reservationTransactionRef: transaction.transactionRef,
        })
  const reversalRows =
    reversalRef === undefined
      ? []
      : await ctx.db
          .query('moneyLedgerEntries')
          .withIndex('by_transactionRef', (q) =>
            q.eq('transactionRef', reversalRef),
          )
          .take(2)
  const reversalEntry = reversalRows[0]
  const reservationRestored = addExactAmounts(
    snapshots.providerHeldAfter,
    amount,
  )
  const expectedEvidenceDigest =
    payout.state === 'reversed'
      ? payout.transferReversalEvidenceDigest
      : payout.transferEvidenceDigest
  const stateEvidenceIsValid = payout.state === 'reversed'
    ? everyFact([
        payout.transferStatus === 'reversed',
        payout.stripeTransferId !== undefined,
        (payout.stripeTransferId?.length ?? 0) > 0,
        payout.transferEvidenceDigest !== undefined,
        (payout.transferEvidenceDigest?.length ?? 0) > 0,
        payout.transferReversalEvidenceDigest !== undefined,
        (payout.transferReversalEvidenceDigest?.length ?? 0) > 0,
        payout.transferReversalEvidenceDigest !== payout.transferEvidenceDigest,
      ])
    : everyFact([
        ['held_threshold', 'held_kyc'].includes(payout.state),
        payout.transferStatus === 'failed',
        payout.transferEvidenceDigest !== undefined,
        (payout.transferEvidenceDigest?.length ?? 0) > 0,
        payout.transferReversalEvidenceDigest === undefined,
      ])
  const reversalMaterial = [
    reversal,
    reversalRef,
    reversalEntry,
    expectedEvidenceDigest,
    reservationRestored,
  ] as const
  if (!allDefined(reversalMaterial)) return false
  const [
    requiredReversal,
    requiredReversalRef,
    requiredReversalEntry,
    requiredEvidenceDigest,
    requiredReservationRestored,
  ] = reversalMaterial
  return everyFact([
    reversals.length === 1,
    reversalRows.length === 1,
    requiredReversal.state === 'reversed',
    requiredReversal.inputDigest === payout.inputDigest,
    requiredReversal.principalId === `business:${businessId}`,
    requiredReversal.currency === amount.currency,
    requiredReversal.exponent === amount.exponent,
    requiredReversal.amountUnits === amount.units,
    requiredReversal.reversalOf === transaction.transactionRef,
    requiredReversal.transactionRef === requiredReversalRef,
    requiredReversal.externalRef === payout.payoutRef,
    requiredReversal.kind === 'payout_accrual',
    requiredReversal.expectedAccountVersion >= transaction.expectedAccountVersion + 1,
    requiredReversal.idempotencyKey ===
      canonicalDigest({
        format: 'money-payout-reversal-idempotency:v1',
        reservationTransactionRef: transaction.transactionRef,
      }),
    requiredReversalEntry.entryRef === `${requiredReversalRef}:payout-reversal`,
    requiredReversalEntry.accountRef === provider.accountRef,
    requiredReversalEntry.entryType === 'payout_accrual',
    requiredReversalEntry.direction === 'credit',
    requiredReversalEntry.amountUnits === amount.units,
    requiredReversalEntry.currency === amount.currency,
    requiredReversalEntry.exponent === amount.exponent,
    requiredReversalEntry.transactionRef === requiredReversalRef,
    requiredReversalEntry.idempotencyKey === requiredReversal.idempotencyKey,
    requiredReversalEntry.businessId === businessId,
    requiredReversalEntry.reversalOf === transaction.transactionRef,
    stateEvidenceIsValid,
    requiredReversalEntry.sourceDigest === payoutEvidenceSourceDigest(requiredEvidenceDigest),
    requiredReversalEntry.evidenceRefs.length === 1,
    requiredReversalEntry.evidenceRefs[0] === requiredEvidenceDigest,
    compareExactAmounts(requiredReservationRestored, snapshots.providerHeldBefore) === 0,
    provider.version >= requiredReversal.expectedAccountVersion + 1,
  ])
}
