import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { resolveBusinessActor } from './authz'
import { requireSourceWrite } from './sourceWriteAdmission'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  addExactAmounts,
  amountFromParts,
  compareExactAmounts,
  sameEvidenceRefs,
  type ExactAmount,
  type MoneyAccount,
  type MoneyPayout,
} from '../src/modules/money/public'

export type BillingSourceWriteArgs = {
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}

type PayoutTransferView = {
  payoutRef: string
  payoutCommandId: string
  state:
    | 'review'
    | 'held_kyc'
    | 'held_threshold'
    | 'transfer_pending'
    | 'paid'
    | 'reversed'
    | 'failed'
    | 'outcome_unknown'
  idempotencyKey: string
  inputDigest: string
  amount: ExactAmount
  destinationAccountId: string
  stripeTransferId?: string
  transferStatus?:
    | 'pending'
    | 'succeeded'
    | 'failed'
    | 'reversed'
    | 'outcome_unknown'
  requestDigest?: string
  evidenceDigest?: string
  reversalEvidenceDigest?: string
  providerRecoveryDeadlineAt?: number
  providerHeldBefore?: ExactAmount
  providerHeldAfter?: ExactAmount
  providerPaidBefore?: ExactAmount
  providerPaidAfter?: ExactAmount
}

export type PayoutTransferResult =
  | { kind: 'accepted'; transfer: PayoutTransferView }
  | { kind: 'refused'; code: string; retryable: boolean }

export async function requireBillingSourceWrite(
  ctx: MutationCtx,
  args: BillingSourceWriteArgs,
): Promise<void> {
  const result = await requireSourceWrite(ctx, args, 'billing')
  if (result.kind === 'rejected') {
    throw new Error(`money_billing_source_write_rejected:${result.reason}`)
  }
}

function principalAllowed(
  identity: { tokenIdentifier?: string } | null,
  principalId: string,
): boolean {
  if (identity === null || identity.tokenIdentifier === undefined) return false
  return (
    identity.tokenIdentifier === principalId ||
    `clerk_api_key:${identity.tokenIdentifier}` === principalId
  )
}

export function payoutFromRow(row: Doc<'moneyPayouts'>): MoneyPayout | undefined {
  const grossAccrual = amountFromParts(
    row.currency,
    row.grossAccrualUnits,
    row.exponent,
  )
  const rake = amountFromParts(row.currency, row.rakeUnits, row.exponent)
  const providerNet = amountFromParts(
    row.currency,
    row.providerNetUnits,
    row.exponent,
  )
  const minimumPayout = amountFromParts(
    row.currency,
    row.minimumPayoutUnits,
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
    grossAccrual === undefined ||
    rake === undefined ||
    providerNet === undefined ||
    minimumPayout === undefined ||
    ((row.state === 'paid' || row.state === 'reversed') &&
      (providerHeldBefore === undefined ||
        providerHeldAfter === undefined ||
        providerPaidBefore === undefined ||
        providerPaidAfter === undefined))
  )
    return undefined
  return {
    payoutRef: row.payoutRef,
    businessId: row.businessId,
    grossAccrual,
    rake,
    providerNet,
    minimumPayout,
    state: row.state,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    ...(row.stripeTransferId === undefined
      ? {}
      : { stripeTransferId: row.stripeTransferId }),
    ...(row.payoutCommandId === undefined
      ? {}
      : { payoutCommandId: row.payoutCommandId }),
    ...(row.inputDigest === undefined ? {} : { inputDigest: row.inputDigest }),
    ...(row.transferRequestDigest === undefined
      ? {}
      : { transferRequestDigest: row.transferRequestDigest }),
    ...(row.transferEvidenceDigest === undefined
      ? {}
      : { transferEvidenceDigest: row.transferEvidenceDigest }),
    ...(row.transferReversalEvidenceDigest === undefined
      ? {}
      : { transferReversalEvidenceDigest: row.transferReversalEvidenceDigest }),
    ...(row.transferObservedAt === undefined
      ? {}
      : { transferObservedAt: row.transferObservedAt }),
    ...(row.transferStatus === undefined
      ? {}
      : { transferStatus: row.transferStatus }),
    ...(providerHeldBefore === undefined ? {} : { providerHeldBefore }),
    ...(providerHeldAfter === undefined ? {} : { providerHeldAfter }),
    ...(providerPaidBefore === undefined ? {} : { providerPaidBefore }),
    ...(providerPaidAfter === undefined ? {} : { providerPaidAfter }),
    idempotencyKey: row.idempotencyKey,
    ...(row.failureCode === undefined ? {} : { failureCode: row.failureCode }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function payoutAuthorityAllowed(
  ctx: Pick<MutationCtx, 'auth' | 'db'>,
  businessId: string,
  principalId: string,
): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity()
  if (principalAllowed(identity, principalId)) return true
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return false
  const owner = await ctx.db
    .query('owners')
    .withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', actor.clerkUserId))
    .unique()
  if (owner === null) return false
  const businesses = await ctx.db
    .query('businesses')
    .withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id))
    .order('desc')
    .take(20)
  return businesses.some((business) => String(business._id) === businessId)
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
  if (byRefRows.length > 1 || byIdempotencyRows.length > 1)
    return { kind: 'conflict' }
  if (
    (byRef !== undefined && byRef.transactionRef !== identity.transactionRef) ||
    (byIdempotency !== undefined &&
      byIdempotency.transactionRef !== identity.transactionRef)
  )
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
    byRef === undefined || byRef.amountUnits === undefined
      ? undefined
      : amountFromParts(byRef.currency, byRef.amountUnits, byRef.exponent)
  if (
    debitRows.length !== 1 ||
    debit === undefined ||
    byRef.kind !== 'payout_accrual' ||
    byRef.idempotencyKey !== input.idempotencyKey ||
    byRef.inputDigest !== input.inputDigest ||
    byRef.principalId !== `business:${input.businessId}` ||
    byRef.accountId !== undefined ||
    byRef.currency !== (input.amount?.currency ?? byRef.currency) ||
    byRef.exponent !== (input.amount?.exponent ?? byRef.exponent) ||
    byRef.amountUnits === undefined ||
    reservationAmount === undefined ||
    byRef.externalRef !== input.payoutRef ||
    byRef.reversalOf !== undefined ||
    debit.entryRef !== `${identity.transactionRef}:payout-reservation` ||
    debit.accountRef !== input.providerAccountRef ||
    debit.entryType !== 'payout_accrual' ||
    debit.direction !== 'debit' ||
    debit.amountUnits !== byRef.amountUnits ||
    debit.currency !== byRef.currency ||
    debit.exponent !== byRef.exponent ||
    debit.transactionRef !== identity.transactionRef ||
    debit.idempotencyKey !== input.idempotencyKey ||
    debit.businessId !== input.businessId ||
    debit.sourceDigest !== identity.sourceDigest ||
    !sameEvidenceRefs(debit.evidenceRefs, identity.evidenceRefs) ||
    (input.amount !== undefined &&
      (byRef.amountUnits !== input.amount.units ||
        debit.amountUnits !== input.amount.units ||
        byRef.currency !== input.amount.currency ||
        byRef.exponent !== input.amount.exponent ||
        debit.currency !== input.amount.currency ||
        debit.exponent !== input.amount.exponent))
  )
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
  if (
    snapshots === undefined ||
    payout.businessId !== businessId ||
    payout.currency !== currency ||
    payout.exponent !== amount.exponent ||
    payout.providerAccountRef !== provider.accountRef ||
    transaction.currency !== amount.currency ||
    transaction.exponent !== amount.exponent ||
    transaction.amountUnits !== amount.units
  )
    return false
  if (transaction.state === 'pending' || transaction.state === 'outcome_unknown') {
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
    if (
      pendingRows.some((row) => row._id !== payout._id) ||
      unknownRows.some((row) => row._id !== payout._id)
    )
      return false
    const expectedState =
      transaction.state === 'pending' ? 'transfer_pending' : 'outcome_unknown'
    return (
      payoutReservationCurrentAmountMatches(payout, amount) &&
      payout.state === expectedState &&
      payoutAccountAfterReservationMatches(
        provider,
        transaction,
        snapshots,
        amount,
      ) &&
      (transaction.state !== 'pending' ||
        payoutTransferView(payout)?.transferStatus === 'pending') &&
      (transaction.state !== 'outcome_unknown' ||
        payoutTransferView(payout)?.transferStatus === 'outcome_unknown')
    )
  }
  if (transaction.state === 'applied') {
    const expectedProviderHeldBefore = addExactAmounts(
      snapshots.providerHeldAfter,
      amount,
    )
    const linkedReversals = await ctx.db
      .query('moneyTransactions')
      .withIndex('by_reversalOf', (q) =>
        q.eq('reversalOf', transaction.transactionRef),
      )
      .take(2)
    const providerPaidAfter =
      payout.providerPaidAfterUnits === undefined
        ? undefined
        : amountFromParts(
            payout.currency,
            payout.providerPaidAfterUnits,
            payout.exponent,
          )
    const expectedProviderPaidAfter = addExactAmounts(
      snapshots.providerPaidBefore,
      amount,
    )
    return (
      payout.state === 'paid' &&
      payoutTransferView(payout)?.transferStatus === 'succeeded' &&
      payout.stripeTransferId !== undefined &&
      payout.stripeTransferId.length > 0 &&
      payout.transferEvidenceDigest !== undefined &&
      payout.transferEvidenceDigest.length > 0 &&
      payout.transferReversalEvidenceDigest === undefined &&
      linkedReversals.length === 0 &&
      expectedProviderHeldBefore !== undefined &&
      compareExactAmounts(
        expectedProviderHeldBefore,
        snapshots.providerHeldBefore,
      ) === 0 &&
      providerPaidAfter !== undefined &&
      expectedProviderPaidAfter !== undefined &&
      compareExactAmounts(providerPaidAfter, expectedProviderPaidAfter) === 0 &&
      provider.version >= transaction.expectedAccountVersion + 1
    )
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
  const stateEvidenceIsValid =
    payout.state === 'reversed'
      ? payout.transferStatus === 'reversed' &&
        payout.stripeTransferId !== undefined &&
        payout.stripeTransferId.length > 0 &&
        payout.transferEvidenceDigest !== undefined &&
        payout.transferEvidenceDigest.length > 0 &&
        payout.transferReversalEvidenceDigest !== undefined &&
        payout.transferReversalEvidenceDigest.length > 0 &&
        payout.transferReversalEvidenceDigest !== payout.transferEvidenceDigest
      : (payout.state === 'held_threshold' ||
          payout.state === 'held_kyc') &&
        payout.transferStatus === 'failed' &&
        payout.transferEvidenceDigest !== undefined &&
        payout.transferEvidenceDigest.length > 0 &&
        payout.transferReversalEvidenceDigest === undefined
  return !(
    reversals.length !== 1 ||
    reversal === undefined ||
    reversalRef === undefined ||
    reversalRows.length !== 1 ||
    reversalEntry === undefined ||
    reversal.state !== 'reversed' ||
    reversal.inputDigest !== payout.inputDigest ||
    reversal.principalId !== `business:${businessId}` ||
    reversal.currency !== amount.currency ||
    reversal.exponent !== amount.exponent ||
    reversal.amountUnits !== amount.units ||
    reversal.reversalOf !== transaction.transactionRef ||
    reversal.transactionRef !== reversalRef ||
    reversal.externalRef !== payout.payoutRef ||
    reversal.kind !== 'payout_accrual' ||
    reversal.expectedAccountVersion < transaction.expectedAccountVersion + 1 ||
    reversal.idempotencyKey !==
      canonicalDigest({
        format: 'money-payout-reversal-idempotency:v1',
        reservationTransactionRef: transaction.transactionRef,
      }) ||
    reversalEntry.entryRef !== `${reversalRef}:payout-reversal` ||
    reversalEntry.accountRef !== provider.accountRef ||
    reversalEntry.entryType !== 'payout_accrual' ||
    reversalEntry.direction !== 'credit' ||
    reversalEntry.amountUnits !== amount.units ||
    reversalEntry.currency !== amount.currency ||
    reversalEntry.exponent !== amount.exponent ||
    reversalEntry.transactionRef !== reversalRef ||
    reversalEntry.idempotencyKey !== reversal.idempotencyKey ||
    reversalEntry.businessId !== businessId ||
    reversalEntry.reversalOf !== transaction.transactionRef ||
    !stateEvidenceIsValid ||
    expectedEvidenceDigest === undefined ||
    reversalEntry.sourceDigest !==
      payoutEvidenceSourceDigest(expectedEvidenceDigest) ||
    reversalEntry.evidenceRefs.length !== 1 ||
    reversalEntry.evidenceRefs[0] !== expectedEvidenceDigest ||
    reservationRestored === undefined ||
    compareExactAmounts(reservationRestored, snapshots.providerHeldBefore) !== 0 ||
    provider.version < reversal.expectedAccountVersion + 1
  )
}

const PAYOUT_SNAPSHOT_READ_LIMIT = 2

export async function readLatestCompletedPayoutPaidAfter(
  ctx: Pick<MutationCtx, 'db'>,
  businessId: string,
  expectedAmount: ExactAmount,
  currentPayoutId?: string,
): Promise<ExactAmount | null | undefined> {
  const [paidRows, reversedRows] = await Promise.all([
    ctx.db
      .query('moneyPayouts')
      .withIndex(
        'by_businessId_and_currency_and_state_and_updatedAt',
        (q) =>
          q
            .eq('businessId', businessId)
            .eq('currency', expectedAmount.currency)
            .eq('state', 'paid'),
      )
      .order('desc')
      .take(PAYOUT_SNAPSHOT_READ_LIMIT),
    ctx.db
      .query('moneyPayouts')
      .withIndex(
        'by_businessId_and_currency_and_state_and_updatedAt',
        (q) =>
          q
            .eq('businessId', businessId)
            .eq('currency', expectedAmount.currency)
            .eq('state', 'reversed'),
      )
      .order('desc')
      .take(PAYOUT_SNAPSHOT_READ_LIMIT),
  ])
  const candidates = [paidRows, reversedRows].flatMap((rows) => {
    const eligible = rows.filter(
      (row) => currentPayoutId === undefined || row._id !== currentPayoutId,
    )
    if (
      eligible.length > 1 &&
      eligible[0]?.updatedAt === eligible[1]?.updatedAt
    )
      return [undefined]
    return eligible[0] === undefined ? [] : [eligible[0]]
  })
  if (candidates.some((candidate) => candidate === undefined))
    return undefined
  const latestCandidates = candidates.filter(
    (candidate): candidate is Doc<'moneyPayouts'> =>
      candidate !== undefined,
  )
  if (latestCandidates.length === 0) return null
  const latest = latestCandidates.reduce((current, candidate) =>
    candidate.updatedAt > current.updatedAt ? candidate : current,
  )
  if (
    latestCandidates.some(
      (candidate) =>
        candidate !== latest && candidate.updatedAt === latest.updatedAt,
    )
  )
    return undefined
  const payout = payoutFromRow(latest)
  if (
    payout === undefined ||
    latest.currency !== expectedAmount.currency ||
    latest.exponent !== expectedAmount.exponent ||
    payout.providerPaidAfter === undefined ||
    payout.providerPaidAfter.currency !== expectedAmount.currency ||
    payout.providerPaidAfter.exponent !== expectedAmount.exponent
  )
    return undefined
  return payout.providerPaidAfter
}
