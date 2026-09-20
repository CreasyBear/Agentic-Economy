import { v } from 'convex/values'

import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import {
  finalizeFundingEventHandler,
  finalizeFundingRefundHandler,
  markFundingBookingUnknownHandler,
  markFundingReversalUnknownHandler,
} from './lib/money/fundingStripeEventPipeline'
import {
  applyFundingEventArgsValue,
  applyFundingEventResultValue,
  trustedApplyFundingEventArgsValue,
} from './lib/money/accountFundingValidators'
import {
  bindAgentHandoffArgs,
  bindAgentHandoffHandler,
  bindAgentHandoffResult,
  readAgentHandoffArgs,
  readAgentHandoffHandler,
  readAgentHandoffResult,
  readPayerSafeHandoffHandler,
  readPayerSafeHandoffResult,
  reserveAgentHandoffArgs,
  reserveAgentHandoffHandler,
  reserveAgentHandoffResult,
} from './lib/money/agentFundingHandoff'
import {
  readBalanceSubjectArgs,
  readBalanceSubjectHandler,
  readBalanceSubjectResult,
} from './lib/money/fundingBalanceSubject'
import {
  prepareVerifiedEventArgs,
  prepareVerifiedEventFromInboxArgs,
  prepareVerifiedEventFromInboxHandler,
  prepareVerifiedEventFromInboxResult,
  prepareVerifiedEventHandler,
  prepareVerifiedEventResult,
} from './lib/money/fundingPrepareVerifiedEvent'
import {
  readWebhookCommandArgs,
  readWebhookCommandHandler,
  readWebhookCommandResult,
  readWebhookRefundCommandArgs,
  readWebhookRefundCommandHandler,
  readWebhookRefundCommandResult,
} from './lib/money/fundingWebhookLookup'
import {
  readWebhookCommandForWorkerArgs,
  readWebhookCommandForWorkerHandler,
  readWebhookCommandForWorkerResult,
  readWebhookRefundCommandForWorkerArgs,
  readWebhookRefundCommandForWorkerHandler,
  readWebhookRefundCommandForWorkerResult,
} from './lib/money/fundingWebhookWorkerReads'
import {
  listOwnerInvoiceHistoryArgs,
  listOwnerInvoiceHistoryHandler,
  listOwnerInvoiceHistoryResult,
  readOwnerFundingCommandForReceiptArgs,
  readOwnerFundingCommandForReceiptHandler,
  readOwnerFundingCommandForReceiptResult,
} from './lib/money/ownerFundingInvoiceHistory'
import { bindArgs, bindHandler, bindResult } from './lib/money/ownerFundingBind'
import {
  markOutcomeUnknownArgs,
  markOutcomeUnknownHandler,
  markOutcomeUnknownResult,
} from './lib/money/ownerFundingMarkUnknown'
import { readArgs, readHandler, readResult } from './lib/money/ownerFundingRead'
import { reserveArgs, reserveHandler, reserveResult } from './lib/money/ownerFundingReserve'

// -- Registrations only. Validators, handler bodies, and DB logic live under --
// -- convex/lib/money/*, grouped by concern. -----------------------------------

export const reserve = mutation({
  args: reserveArgs.fields,
  returns: reserveResult,
  handler: reserveHandler,
})

export const bind = mutation({
  args: bindArgs.fields,
  returns: bindResult,
  handler: bindHandler,
})

export const read = query({
  args: readArgs.fields,
  returns: readResult,
  handler: readHandler,
})

export const reserveAgentHandoff = mutation({
  args: reserveAgentHandoffArgs.fields,
  returns: reserveAgentHandoffResult,
  handler: reserveAgentHandoffHandler,
})

export const bindAgentHandoff = mutation({
  args: bindAgentHandoffArgs.fields,
  returns: bindAgentHandoffResult,
  handler: bindAgentHandoffHandler,
})

export const readAgentHandoff = mutation({
  args: readAgentHandoffArgs.fields,
  returns: readAgentHandoffResult,
  handler: readAgentHandoffHandler,
})

export const readPayerSafeHandoff = query({
  args: { externalRef: v.string() },
  returns: readPayerSafeHandoffResult,
  handler: readPayerSafeHandoffHandler,
})

export const readWebhookCommand = query({
  args: readWebhookCommandArgs.fields,
  returns: readWebhookCommandResult,
  handler: readWebhookCommandHandler,
})

export const readWebhookRefundCommand = query({
  args: readWebhookRefundCommandArgs.fields,
  returns: readWebhookRefundCommandResult,
  handler: readWebhookRefundCommandHandler,
})

export const readWebhookCommandForWorker = internalQuery({
  args: readWebhookCommandForWorkerArgs,
  returns: readWebhookCommandForWorkerResult,
  handler: readWebhookCommandForWorkerHandler,
})

export const listOwnerInvoiceHistory = query({
  args: listOwnerInvoiceHistoryArgs,
  returns: listOwnerInvoiceHistoryResult,
  handler: listOwnerInvoiceHistoryHandler,
})

export const readOwnerFundingCommandForReceipt = query({
  args: readOwnerFundingCommandForReceiptArgs,
  returns: readOwnerFundingCommandForReceiptResult,
  handler: readOwnerFundingCommandForReceiptHandler,
})

export const readWebhookRefundCommandForWorker = internalQuery({
  args: readWebhookRefundCommandForWorkerArgs,
  returns: readWebhookRefundCommandForWorkerResult,
  handler: readWebhookRefundCommandForWorkerHandler,
})

export const markOutcomeUnknown = mutation({
  args: markOutcomeUnknownArgs.fields,
  returns: markOutcomeUnknownResult,
  handler: markOutcomeUnknownHandler,
})

export const readBalanceSubject = internalQuery({
  args: readBalanceSubjectArgs,
  returns: readBalanceSubjectResult,
  handler: readBalanceSubjectHandler,
})

export const prepareVerifiedEvent = internalMutation({
  args: prepareVerifiedEventArgs.fields,
  returns: prepareVerifiedEventResult,
  handler: prepareVerifiedEventHandler,
})

export const prepareVerifiedEventFromInbox = internalMutation({
  args: prepareVerifiedEventFromInboxArgs.fields,
  returns: prepareVerifiedEventFromInboxResult,
  handler: prepareVerifiedEventFromInboxHandler,
})

export const finalizeVerifiedEvent = internalMutation({
  args: { ...applyFundingEventArgsValue.fields, formanceTransactionRef: v.string() },
  returns: applyFundingEventResultValue,
  handler: finalizeFundingEventHandler,
})

export const finalizeVerifiedEventFromInbox = internalMutation({
  args: { ...trustedApplyFundingEventArgsValue.fields, formanceTransactionRef: v.string() },
  returns: applyFundingEventResultValue,
  handler: finalizeFundingEventHandler,
})

export const finalizeVerifiedRefund = internalMutation({
  args: { ...applyFundingEventArgsValue.fields, formanceTransactionRef: v.string() },
  returns: applyFundingEventResultValue,
  handler: finalizeFundingRefundHandler,
})

export const finalizeVerifiedRefundFromInbox = internalMutation({
  args: { ...trustedApplyFundingEventArgsValue.fields, formanceTransactionRef: v.string() },
  returns: applyFundingEventResultValue,
  handler: finalizeFundingRefundHandler,
})

export const markFundingBookingUnknown = internalMutation({
  args: { commandRef: v.string(), stripeEventId: v.string(), observedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markFundingBookingUnknownHandler(ctx, args)
    return null
  },
})

export const markFundingReversalUnknown = internalMutation({
  args: {
    paymentId: v.string(), refundId: v.string(), stripeEventId: v.string(),
    statusRef: v.string(), observedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markFundingReversalUnknownHandler(ctx, args)
    return null
  },
})
