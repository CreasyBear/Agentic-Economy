import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
import {
  creditAccountArgs,
  creditActivityArgs,
  creditAccountResultValue,
  creditActivityResultValue,
  keyUsageArgs,
  keyUsageResultValue,
} from './lib/money/credit-contracts'
import {
  creditAccountMoneyFactsArgs,
  creditAccountMoneyFactsValue,
  readCreditAccountMoneyFactsHandler,
  readCreditAccountHandler,
} from './lib/money/credit-balance'
import { listCreditActivityHandler, readKeyUsageHandler } from './lib/money/credit-activity'
import {
  ownerProviderEarningsArgs,
  ownerProviderEarningsResultValue,
  agentProviderEarningsArgs,
  agentProviderEarningsResultValue,
  readOwnerProviderEarningsHandler,
  readAgentProviderEarningsHandler,
} from './lib/money/provider-earnings'
import { connectAccountResultValue, connectAccountReservationResultValue } from './lib/money/connect/contracts'
import { reserveConnectAccountArgs, reserveConnectAccountHandler } from './lib/money/connect/account-reserve'
import { authorizeConnectOnboardingArgs, authorizeConnectOnboardingHandler } from './lib/money/connect/account-authorize'
import { finalizeConnectAccountArgs, finalizeConnectAccountHandler } from './lib/money/connect/account-finalize'
import {
  readPayoutAccountByStripeIdArgs,
  readPayoutAccountByStripeIdForWorkerArgs,
  readOwnerPayoutAccountArgs,
  payoutAccountReadResultValue,
  payoutBindingListValue,
  readPayoutAccountByStripeIdHandler,
  readPayoutAccountByStripeIdForWorkerHandler,
  readOwnerPayoutAccountHandler,
} from './lib/money/connect/binding-read'
import {
  recordConnectAccountEventArgs,
  recordConnectAccountEventFromInboxArgs,
  recordConnectAccountEventHandler,
  recordConnectAccountEventFromInboxHandler,
} from './lib/money/connect/stripe-event'

// Stripe Connect account custody is domain identity, not ledger authority, so
// these maintained handlers remain while all monetary reads and writes move to
// the official Formance boundary.
export const reserveConnectAccount = mutation({
  args: reserveConnectAccountArgs,
  returns: connectAccountReservationResultValue,
  handler: reserveConnectAccountHandler,
})

export const authorizeConnectOnboarding = mutation({
  args: authorizeConnectOnboardingArgs,
  returns: connectAccountResultValue,
  handler: authorizeConnectOnboardingHandler,
})

export const finalizeConnectAccount = mutation({
  args: finalizeConnectAccountArgs,
  returns: connectAccountReservationResultValue,
  handler: finalizeConnectAccountHandler,
})

export const readPayoutAccountByStripeId = query({
  args: readPayoutAccountByStripeIdArgs,
  returns: payoutBindingListValue,
  handler: readPayoutAccountByStripeIdHandler,
})

export const readOwnerPayoutAccount = query({
  args: readOwnerPayoutAccountArgs,
  returns: payoutAccountReadResultValue,
  handler: readOwnerPayoutAccountHandler,
})

export const recordConnectAccountEvent = mutation({
  args: recordConnectAccountEventArgs,
  returns: connectAccountResultValue,
  handler: recordConnectAccountEventHandler,
})

export const readPayoutAccountByStripeIdForWorker = internalQuery({
  args: readPayoutAccountByStripeIdForWorkerArgs,
  returns: payoutBindingListValue,
  handler: readPayoutAccountByStripeIdForWorkerHandler,
})

export const recordConnectAccountEventFromInbox = internalMutation({
  args: recordConnectAccountEventFromInboxArgs,
  returns: connectAccountResultValue,
  handler: recordConnectAccountEventFromInboxHandler,
})

export const readCreditAccountMoneyFacts = internalQuery({
  args: creditAccountMoneyFactsArgs,
  returns: creditAccountMoneyFactsValue,
  handler: readCreditAccountMoneyFactsHandler,
})

export const readCreditAccount = action({
  args: creditAccountArgs,
  returns: creditAccountResultValue,
  handler: readCreditAccountHandler,
})

export const listCreditActivity = action({
  args: creditActivityArgs,
  returns: creditActivityResultValue,
  handler: listCreditActivityHandler,
})

export const readKeyUsage = action({
  args: keyUsageArgs,
  returns: keyUsageResultValue,
  handler: readKeyUsageHandler,
})

export const readOwnerProviderEarnings = query({
  args: ownerProviderEarningsArgs,
  returns: ownerProviderEarningsResultValue,
  handler: readOwnerProviderEarningsHandler,
})

export const readAgentProviderEarnings = mutation({
  args: agentProviderEarningsArgs,
  returns: agentProviderEarningsResultValue,
  handler: readAgentProviderEarningsHandler,
})
