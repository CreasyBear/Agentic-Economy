import {
  amountFromParts,
  type ExactAmount,
  type MoneyPayout,
} from '../../src/modules/money/public'
import type { Doc } from '../_generated/dataModel'

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

