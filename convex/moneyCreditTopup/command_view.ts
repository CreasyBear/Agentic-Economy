import { amountFromParts } from '../../src/modules/money/public'
import type { Doc } from '../_generated/dataModel'

export function topupCommandView(row: Doc<'moneyTopupCommands'>) {
  const buyerBalanceBefore =
    row.buyerBalanceBeforeUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.buyerBalanceBeforeUnits, row.exponent)
  const buyerBalanceAfter =
    row.buyerBalanceAfterUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.buyerBalanceAfterUnits, row.exponent)
  return {
    commandRef: row.commandRef,
    principalId: row.principalId,
    accountRef: row.accountRef,
    currency: row.currency,
    exponent: row.exponent,
    amountUnits: row.amountUnits,
    processingFeeUnits: row.processingFeeUnits,
    chargeAmountUnits: row.chargeAmountUnits,
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    successReturnRef: row.successReturnRef,
    providerRecoveryDeadlineAt: row.providerRecoveryDeadlineAt,
    state: row.state,
    ...(row.externalRef === undefined ? {} : { externalRef: row.externalRef }),
    ...(row.paymentId === undefined ? {} : { paymentId: row.paymentId }),
    ...(row.providerStatus === undefined
      ? {}
      : { providerStatus: row.providerStatus }),
    ...(row.metadataDigest === undefined
      ? {}
      : { metadataDigest: row.metadataDigest }),
    ...(row.requestDigest === undefined
      ? {}
      : { requestDigest: row.requestDigest }),
    ...(row.checkoutSessionDigest === undefined
      ? {}
      : { checkoutSessionDigest: row.checkoutSessionDigest }),
    ...(row.paymentIntentDigest === undefined
      ? {}
      : { paymentIntentDigest: row.paymentIntentDigest }),
    ...(row.evidenceDigest === undefined
      ? {}
      : { evidenceDigest: row.evidenceDigest }),
    ...(row.providerEvidenceRef === undefined
      ? {}
      : { providerEvidenceRef: row.providerEvidenceRef }),
    ...(row.appliedStripeEventId === undefined
      ? {}
      : { appliedStripeEventId: row.appliedStripeEventId }),
    ...(row.appliedPayloadDigest === undefined
      ? {}
      : { appliedPayloadDigest: row.appliedPayloadDigest }),
    ...(row.appliedTransactionRef === undefined
      ? {}
      : { appliedTransactionRef: row.appliedTransactionRef }),
    ...(buyerBalanceBefore === undefined ? {} : { buyerBalanceBefore }),
    ...(buyerBalanceAfter === undefined ? {} : { buyerBalanceAfter }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

