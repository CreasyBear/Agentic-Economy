import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import {
  authorizeInvocationChargeHandler,
  readInvocationChargeExpectedAccountVersionHandler,
  readOperatorAccountVersionHandler,
} from './moneyChargeAuthorize'
import {
  finalizeBrokeredInvocationChargeHandler,
  markBrokeredInvocationChargeOutcomeUnknownHandler,
  releaseBrokeredInvocationChargeHandler,
  reserveBrokeredInvocationChargeHandler,
} from './moneyChargeBrokered'
import { recordBrokeredInvalidOutputLossHandler } from './moneyBrokeredInvalidOutputLoss'
import {
  chargeOutcomeUnknownResultValue,
  invocationChargeReconciliationResult,
  markChargeOutcomeUnknownArgs,
  markChargeOutcomeUnknownHandler,
  reconcileChargeArgs,
  reconcileChargeHandler,
  reconcileInvocationChargeArgs,
  reconcileInvocationChargeHandler,
} from './moneyChargeReconcile'
import {
  bindConnectAccountArgs,
  bindConnectAccountHandler,
  connectAccountResultValue,
  connectAccountReservationResultValue,
  connectAccountViewValue,
  finalizeConnectAccountArgs,
  finalizeConnectAccountHandler,
  payoutBindingViewValue,
  readOwnerPayoutAccountHandler,
  readPayoutAccountByStripeIdArgs,
  readPayoutAccountByStripeIdHandler,
  recordConnectAccountEventArgs,
  recordConnectAccountEventHandler,
  reserveConnectAccountArgs,
  reserveConnectAccountHandler,
} from './moneyConnect'
import {
  listCreditActivityHandler,
  readCreditAccountHandler,
  readKeyUsageHandler,
} from './moneyCreditReads'
import {
  applyCreditTopupArgs,
  applyCreditTopupHandler,
  applyVerifiedStripeEventHandler,
  bindCreditPaymentSessionArgs,
  bindCreditPaymentSessionHandler,
  markCreditTopupOutcomeUnknownArgs,
  markCreditTopupOutcomeUnknownHandler,
  readCreditTopupCommandHandler,
  readCreditTopupWebhookCommandArgs,
  readCreditTopupWebhookCommandHandler,
  reserveCreditTopupArgs,
  reserveCreditTopupHandler,
  topupCommandResultValue,
  topupReadInputArg,
  topupWebhookResultValue,
} from './moneyCreditTopup'
import {
  externalSpendMutationResultValue,
  finalizeExternalInvocationSpendArgs,
  finalizeExternalInvocationSpendHandler,
  reconcileExternalInvocationSpendArgs,
  reconcileExternalInvocationSpendHandler,
  reserveExternalInvocationSpendArgs,
  reserveExternalInvocationSpendHandler,
  reverseExternalInvocationSpendArgs,
  reverseExternalInvocationSpendHandler,
  reverseExternalInvocationSpendForInvalidOutputArgs,
  reverseExternalInvocationSpendForInvalidOutputHandler,
} from './moneyExternalSpend'
import { exactAmount, identifier, moneyArgs } from './moneyLedgerValues'
import {
  beginPayoutTransferHandler,
  payoutBeginArgs,
  payoutTransferResultValue,
} from './moneyPayoutTransferBegin'
import {
  completePayoutTransferHandler,
  payoutCompleteArgs,
  readOwnerPayoutTransferArgs,
  readOwnerPayoutTransferHandler,
  reconcilePayoutTransferArgs,
  reconcilePayoutTransferHandler,
} from './moneyPayoutTransferComplete'
import {
  dailySettlementResultValue,
  markPayoutTransferOutcomeUnknownArgs,
  markPayoutTransferOutcomeUnknownHandler,
  runDailySupplierSettlementHandler,
} from './moneyPayoutTransferSettlement'
import {
  agentProviderEarningsReadArgs,
  ownerProviderEarningsResultValue,
  readAgentProviderEarningsHandler,
  readOwnerProviderEarningsArgs,
  readOwnerProviderEarningsHandler,
  readPayoutStatusHandler,
  readProviderEarningsArgs,
  readProviderEarningsHandler,
} from './moneyProviderEarnings'
import {
  appendRefundArgs,
  appendRefundHandler,
  disputeReversalResultValue,
  reverseDisputedQualifiedUseArgs,
  reverseDisputedQualifiedUseHandler,
} from './moneyRefund'

export const readOperatorAccountVersion = internalQuery({
  args: {
    ownerId: identifier,
    currency: identifier,
  },
  handler: readOperatorAccountVersionHandler,
})

export const readInvocationChargeExpectedAccountVersion = internalQuery({
  args: { transactionRef: identifier },
  returns: v.union(v.number(), v.null()),
  handler: readInvocationChargeExpectedAccountVersionHandler,
})
export const reserveExternalInvocationSpend = internalMutation({
  args: reserveExternalInvocationSpendArgs,
  returns: externalSpendMutationResultValue,
  handler: reserveExternalInvocationSpendHandler,
})

export const finalizeExternalInvocationSpend = internalMutation({
  args: finalizeExternalInvocationSpendArgs,
  returns: externalSpendMutationResultValue,
  handler: finalizeExternalInvocationSpendHandler,
})

export const reconcileExternalInvocationSpend = internalMutation({
  args: reconcileExternalInvocationSpendArgs,
  returns: externalSpendMutationResultValue,
  handler: reconcileExternalInvocationSpendHandler,
})

export const reverseExternalInvocationSpend = internalMutation({
  args: reverseExternalInvocationSpendArgs,
  returns: externalSpendMutationResultValue,
  handler: reverseExternalInvocationSpendHandler,
})

export const reverseExternalInvocationSpendForInvalidOutput = internalMutation({
  args: reverseExternalInvocationSpendForInvalidOutputArgs,
  returns: externalSpendMutationResultValue,
  handler: reverseExternalInvocationSpendForInvalidOutputHandler,
})

export const authorizeInvocationCharge = internalMutation({
  args: {
    principalId: identifier,
    amount: exactAmount,
    operatorAccountRef: identifier,
    providerAccountRef: identifier,
    rakeAccountRef: identifier,
    transactionRef: identifier,
    idempotencyKey: identifier,
    inputDigest: identifier,
    expectedAccountVersion: v.number(),
    rakeBps: v.number(),
    priceDigest: identifier,
    priceSourceDigest: identifier,
    authorityMaximumSpend: exactAmount,
    credentialId: identifier,
    applicationRef: v.optional(identifier),
    serviceRef: identifier,
    offeringRef: identifier,
    businessId: identifier,
    invocationRef: identifier,
    attemptRef: identifier,
    operationKey: identifier,
    sourceDigest: identifier,
    evidenceRefs: v.array(v.string()),
    observedAt: v.number(),
    freeTier: v.boolean(),
    credentialBudgetGrantRef: v.optional(identifier),
    credentialBudgetGeneration: v.optional(v.number()),
  },
  handler: authorizeInvocationChargeHandler,
})

const brokeredInvocationChargeArgs = {
  principalId: identifier,
  amount: exactAmount,
  operatorAccountRef: identifier,
  providerAccountRef: identifier,
  rakeAccountRef: identifier,
  transactionRef: identifier,
  idempotencyKey: identifier,
  inputDigest: identifier,
  expectedAccountVersion: v.number(),
  rakeBps: v.number(),
  priceDigest: identifier,
  priceSourceDigest: identifier,
  authorityMaximumSpend: exactAmount,
  credentialId: identifier,
  applicationRef: v.optional(identifier),
  serviceRef: identifier,
  offeringRef: identifier,
  businessId: identifier,
  invocationRef: identifier,
  attemptRef: identifier,
  operationKey: identifier,
  sourceDigest: identifier,
  evidenceRefs: v.array(v.string()),
  observedAt: v.number(),
  freeTier: v.boolean(),
  credentialBudgetGrantRef: v.optional(identifier),
  credentialBudgetGeneration: v.optional(v.number()),
} as const

const brokeredInvalidOutputLossResult = v.union(
  v.object({
    kind: v.literal('settled'),
    chargeTransactionRef: identifier,
    lossTransactionRef: identifier,
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.string(),
    retryable: v.boolean(),
    requiredAmount: v.optional(exactAmount),
    availableAmount: v.optional(exactAmount),
    nextAction: v.optional(v.literal('credit_topup_required')),
  }),
)

export const reserveBrokeredInvocationCharge = internalMutation({
  args: brokeredInvocationChargeArgs,
  handler: reserveBrokeredInvocationChargeHandler,
})

export const finalizeBrokeredInvocationCharge = internalMutation({
  args: {
    ...brokeredInvocationChargeArgs,
    externalRef: identifier,
    reconciliationEvidenceRefs: v.optional(v.array(v.string())),
  },
  handler: finalizeBrokeredInvocationChargeHandler,
})

export const releaseBrokeredInvocationCharge = internalMutation({
  args: {
    ...brokeredInvocationChargeArgs,
    reconciliationEvidenceRefs: v.optional(v.array(v.string())),
  },
  handler: releaseBrokeredInvocationChargeHandler,
})

export const markBrokeredInvocationChargeOutcomeUnknown = internalMutation({
  args: brokeredInvocationChargeArgs,
  handler: markBrokeredInvocationChargeOutcomeUnknownHandler,
})

export const recordBrokeredInvalidOutputLoss = internalMutation({
  args: {
    ...brokeredInvocationChargeArgs,
    externalRef: identifier,
    invalidOutputEvidenceRef: identifier,
    invalidOutputEvidenceDigest: identifier,
    reconciliationEvidenceRefs: v.array(identifier),
  },
  returns: brokeredInvalidOutputLossResult,
  handler: recordBrokeredInvalidOutputLossHandler,
})

export const reserveCreditTopup = mutation({
  args: reserveCreditTopupArgs.fields,
  returns: topupCommandResultValue,
  handler: reserveCreditTopupHandler,
})
export const markCreditTopupOutcomeUnknown = mutation({
  args: markCreditTopupOutcomeUnknownArgs.fields,
  returns: topupCommandResultValue,
  handler: markCreditTopupOutcomeUnknownHandler,
})

export const bindCreditPaymentSession = mutation({
  args: bindCreditPaymentSessionArgs.fields,
  returns: topupCommandResultValue,
  handler: bindCreditPaymentSessionHandler,
})
export const readCreditTopupCommand = query({
  args: topupReadInputArg.fields,
  returns: topupCommandResultValue,
  handler: readCreditTopupCommandHandler,
})

export const readCreditTopupWebhookCommand = query({
  args: readCreditTopupWebhookCommandArgs.fields,
  returns: topupCommandResultValue,
  handler: readCreditTopupWebhookCommandHandler,
})

export const applyCreditTopup = internalMutation({
  args: applyCreditTopupArgs.fields,
  returns: topupWebhookResultValue,
  handler: applyCreditTopupHandler,
})

export const applyVerifiedStripeEvent = action({
  args: applyCreditTopupArgs.fields,
  returns: topupWebhookResultValue,
  handler: applyVerifiedStripeEventHandler,
})

export const reserveConnectAccount = mutation({
  args: reserveConnectAccountArgs,
  returns: connectAccountReservationResultValue,
  handler: reserveConnectAccountHandler,
})

export const finalizeConnectAccount = mutation({
  args: finalizeConnectAccountArgs,
  returns: connectAccountReservationResultValue,
  handler: finalizeConnectAccountHandler,
})

export const bindConnectAccount = mutation({
  args: bindConnectAccountArgs,
  returns: connectAccountResultValue,
  handler: bindConnectAccountHandler,
})

export const readPayoutAccountByStripeId = query({
  args: readPayoutAccountByStripeIdArgs,
  returns: v.array(payoutBindingViewValue),
  handler: readPayoutAccountByStripeIdHandler,
})
export const readOwnerPayoutAccount = query({
  args: { businessId: identifier, currency: identifier },
  returns: v.union(connectAccountViewValue, v.null()),
  handler: readOwnerPayoutAccountHandler,
})
export const readOwnerPayoutTransfer = query({
  args: readOwnerPayoutTransferArgs,
  returns: payoutTransferResultValue,
  handler: readOwnerPayoutTransferHandler,
})
export const recordConnectAccountEvent = mutation({
  args: recordConnectAccountEventArgs,
  returns: connectAccountResultValue,
  handler: recordConnectAccountEventHandler,
})

export const beginPayoutTransfer = mutation({
  args: payoutBeginArgs,
  returns: payoutTransferResultValue,
  handler: beginPayoutTransferHandler,
})

/**
 * UTC daily supplier settlement. Convex cron docs: internal.*, idempotent.
 * Stripe Transfer I/O is not issued here; this reuses beginPayoutTransferReservation only.
 */
export const runDailySupplierSettlement = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: dailySettlementResultValue,
  handler: runDailySupplierSettlementHandler,
})

export const markPayoutTransferOutcomeUnknown = mutation({
  args: markPayoutTransferOutcomeUnknownArgs,
  returns: payoutTransferResultValue,
  handler: markPayoutTransferOutcomeUnknownHandler,
})

export const completePayoutTransfer = mutation({
  args: payoutCompleteArgs,
  returns: payoutTransferResultValue,
  handler: completePayoutTransferHandler,
})

export const reconcilePayoutTransfer = mutation({
  args: reconcilePayoutTransferArgs,
  returns: payoutTransferResultValue,
  handler: reconcilePayoutTransferHandler,
})

export const reverseDisputedQualifiedUse = internalMutation({
  args: reverseDisputedQualifiedUseArgs,
  returns: disputeReversalResultValue,
  handler: reverseDisputedQualifiedUseHandler,
})

export const appendRefund = internalMutation({
  args: appendRefundArgs,
  handler: appendRefundHandler,
})

export const reconcileCharge = internalMutation({
  args: reconcileChargeArgs,
  handler: reconcileChargeHandler,
})

export const reconcileInvocationCharge = internalMutation({
  args: reconcileInvocationChargeArgs,
  returns: invocationChargeReconciliationResult,
  handler: reconcileInvocationChargeHandler,
})

export const markChargeOutcomeUnknown = internalMutation({
  args: markChargeOutcomeUnknownArgs,
  returns: chargeOutcomeUnknownResultValue,
  handler: markChargeOutcomeUnknownHandler,
})

export const readCreditAccount = query({
  args: { ...moneyArgs },
  handler: readCreditAccountHandler,
})

export const listCreditActivity = query({
  args: {
    principalId: identifier,
    credentialId: identifier,
    currency: identifier,
    paginationOpts: paginationOptsValidator,
  },
  handler: listCreditActivityHandler,
})

export const readKeyUsage = query({
  args: {
    principalId: identifier,
    credentialId: identifier,
    currency: identifier,
  },
  handler: readKeyUsageHandler,
})

export const readOwnerProviderEarnings = query({
  args: readOwnerProviderEarningsArgs,
  returns: ownerProviderEarningsResultValue,
  handler: readOwnerProviderEarningsHandler,
})

export const readAgentProviderEarnings = mutation({
  args: agentProviderEarningsReadArgs,
  returns: ownerProviderEarningsResultValue,
  handler: readAgentProviderEarningsHandler,
})

export const readProviderEarnings = internalQuery({
  args: readProviderEarningsArgs,
  handler: readProviderEarningsHandler,
})

export const readPayoutStatus = internalQuery({
  args: readProviderEarningsArgs,
  handler: readPayoutStatusHandler,
})
