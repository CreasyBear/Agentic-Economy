import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { finalizeFundingEventHandler } from './lib/money/funding/stripeEventPipeline'
import { finalizeFundingDisputeHandler } from './lib/money/funding/stripeDisputePipeline'
import { finalizeFundingRefundHandler } from './lib/money/funding/stripeRefundPipeline'
import {
  markFundingBookingUnknownArgs, markFundingBookingUnknownHandler,
  markFundingReversalUnknownArgs, markFundingReversalUnknownHandler, markFundingUnknownResult,
} from './lib/money/funding/unknown'
import {
  applyFundingEventResultValue, finalizeFundingEventArgsValue, trustedFinalizeFundingEventArgsValue,
} from './lib/money/funding/contracts'
import {
  bindAgentHandoffArgs, bindAgentHandoffHandler, bindAgentHandoffResult,
  readAgentHandoffArgs, readAgentHandoffHandler, readAgentHandoffResult,
  readPayerSafeHandoffArgs, readPayerSafeHandoffHandler, readPayerSafeHandoffResult,
  reserveAgentHandoffArgs, reserveAgentHandoffHandler, reserveAgentHandoffResult,
} from './lib/money/funding/agentFundingHandoff'
import { readBalanceSubjectArgs, readBalanceSubjectHandler, readBalanceSubjectResult } from './lib/money/funding/balanceSubject'
import { resolveFundingReceiptSourcesArgs, resolveFundingReceiptSourcesHandler, resolveFundingReceiptSourcesResult } from './lib/money/funding/fundingReceiptSources'
import {
  prepareVerifiedEventArgs,
  prepareVerifiedEventFromInboxArgs,
  prepareVerifiedEventFromInboxHandler,
  prepareVerifiedEventFromInboxResult,
  prepareVerifiedEventHandler,
  prepareVerifiedEventResult,
} from './lib/money/funding/prepareVerifiedEvent'
import {
  readWebhookCommandArgs,
  readWebhookCommandHandler,
  readWebhookCommandResult,
  readWebhookRefundCommandArgs,
  readWebhookRefundCommandHandler,
  readWebhookRefundCommandResult,
} from './lib/money/funding/webhookLookup'
import {
  readWebhookCommandForWorkerArgs,
  readWebhookCommandForWorkerHandler,
  readWebhookCommandForWorkerResult,
  readWebhookRefundCommandForWorkerArgs,
  readWebhookRefundCommandForWorkerHandler,
  readWebhookRefundCommandForWorkerResult,
} from './lib/money/funding/webhookWorkerReads'
import {
  listOwnerInvoiceHistoryArgs,
  listOwnerInvoiceHistoryHandler,
  listOwnerInvoiceHistoryResult,
  readOwnerFundingCommandForReceiptArgs,
  readOwnerFundingCommandForReceiptHandler,
  readOwnerFundingCommandForReceiptResult,
} from './lib/money/funding/ownerInvoiceHistory'
import { bindArgs, bindHandler, bindResult } from './lib/money/funding/ownerBind'
import {
  markOutcomeUnknownArgs,
  markOutcomeUnknownHandler,
  markOutcomeUnknownResult,
} from './lib/money/funding/ownerMarkUnknown'
import { readArgs, readHandler, readResult } from './lib/money/funding/ownerRead'
import { reserveArgs, reserveHandler, reserveResult } from './lib/money/funding/ownerReserve'

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

export const readAgentHandoff = query({
  args: readAgentHandoffArgs.fields,
  returns: readAgentHandoffResult,
  handler: readAgentHandoffHandler,
})

export const readPayerSafeHandoff = query({
  args: readPayerSafeHandoffArgs,
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
  args: finalizeFundingEventArgsValue.fields,
  returns: applyFundingEventResultValue,
  handler: finalizeFundingEventHandler,
})

export const finalizeVerifiedEventFromInbox = internalMutation({
  args: trustedFinalizeFundingEventArgsValue.fields,
  returns: applyFundingEventResultValue,
  handler: finalizeFundingEventHandler,
})

export const finalizeVerifiedRefund = internalMutation({
  args: finalizeFundingEventArgsValue.fields,
  returns: applyFundingEventResultValue,
  handler: finalizeFundingRefundHandler,
})

export const finalizeVerifiedRefundFromInbox = internalMutation({
  args: trustedFinalizeFundingEventArgsValue.fields,
  returns: applyFundingEventResultValue,
  handler: finalizeFundingRefundHandler,
})

export const finalizeVerifiedDispute = internalMutation({
  args: finalizeFundingEventArgsValue.fields,
  returns: applyFundingEventResultValue,
  handler: finalizeFundingDisputeHandler,
})

export const finalizeVerifiedDisputeFromInbox = internalMutation({
  args: trustedFinalizeFundingEventArgsValue.fields,
  returns: applyFundingEventResultValue,
  handler: finalizeFundingDisputeHandler,
})

export const markFundingBookingUnknown = internalMutation({
  args: markFundingBookingUnknownArgs,
  returns: markFundingUnknownResult,
  handler: markFundingBookingUnknownHandler,
})

export const markFundingReversalUnknown = internalMutation({
  args: markFundingReversalUnknownArgs,
  returns: markFundingUnknownResult,
  handler: markFundingReversalUnknownHandler,
})
export const resolveFundingReceiptSources = internalQuery({
  args: resolveFundingReceiptSourcesArgs, returns: resolveFundingReceiptSourcesResult, handler: resolveFundingReceiptSourcesHandler,
})
