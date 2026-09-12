import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { agentAccessPrincipalValue } from './agentAccessPrincipals'
import { sourceWriteArgs } from './sourceWriteAdmission'
import {
  authorizeConnectOnboardingArgs,
  authorizeConnectOnboardingHandler,
  connectAccountResultValue,
  connectAccountReservationResultValue,
  connectAccountViewValue,
  finalizeConnectAccountArgs,
  finalizeConnectAccountHandler,
  payoutBindingViewValue,
  readOwnerPayoutAccountHandler,
  readPayoutAccountByStripeIdArgs,
  readPayoutAccountByStripeIdHandler,
  readPayoutAccountByStripeIdForWorkerHandler,
  recordConnectAccountEventArgs,
  recordConnectAccountEventFromInboxArgs,
  recordConnectAccountEventFromInboxHandler,
  recordConnectAccountEventHandler,
  reserveConnectAccountArgs,
  reserveConnectAccountHandler,
} from './moneyConnect'
import { resolveBusinessActor } from './authz'

const identifier = v.string()

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
  returns: v.array(payoutBindingViewValue),
  handler: readPayoutAccountByStripeIdHandler,
})

export const readOwnerPayoutAccount = query({
  args: { businessId: identifier, currency: identifier },
  returns: v.union(connectAccountViewValue, v.null()),
  handler: readOwnerPayoutAccountHandler,
})

export const recordConnectAccountEvent = mutation({
  args: recordConnectAccountEventArgs,
  returns: connectAccountResultValue,
  handler: recordConnectAccountEventHandler,
})

export const readPayoutAccountByStripeIdForWorker = internalQuery({
  args: { stripeAccountId: v.string() },
  returns: v.array(payoutBindingViewValue),
  handler: async (ctx, args) => await readPayoutAccountByStripeIdForWorkerHandler(ctx, args.stripeAccountId),
})

export const recordConnectAccountEventFromInbox = internalMutation({
  args: recordConnectAccountEventFromInboxArgs,
  returns: connectAccountResultValue,
  handler: recordConnectAccountEventFromInboxHandler,
})

const retiredCreditRefusal = { kind: 'refused' as const, code: 'account_aud_required' as const }
const retiredCreditRefusalValue = v.object({ kind: v.literal('refused'), code: v.literal('account_aud_required') })
const retiredCreditRefusalWithItemsValue = v.object({
  kind: v.literal('refused'),
  code: v.literal('account_aud_required'),
  items: v.array(v.string()),
})

export const readCreditAccount = query({
  args: { principalId: identifier, currency: identifier },
  returns: retiredCreditRefusalValue,
  handler: async () => retiredCreditRefusal,
})

export const listCreditActivity = query({
  args: {
    principalId: identifier,
    credentialId: identifier,
    currency: identifier,
    paginationOpts: paginationOptsValidator,
  },
  returns: retiredCreditRefusalWithItemsValue,
  handler: async () => ({ ...retiredCreditRefusal, items: [] }),
})

export const readKeyUsage = query({
  args: { principalId: identifier, credentialId: identifier, currency: identifier },
  returns: retiredCreditRefusalWithItemsValue,
  handler: async () => ({ ...retiredCreditRefusal, items: [] }),
})

export const readOwnerProviderEarnings = query({
  args: {},
  returns: v.union(
    v.object({ kind: v.literal('not_found') }),
    v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
  ),
  handler: async (ctx) => {
    const actor = await resolveBusinessActor(ctx)
    return actor.kind === 'authenticated_owner'
      ? { kind: 'not_found' as const }
      : { kind: 'error' as const, code: 'unauthenticated' as const }
  },
})

export const readAgentProviderEarnings = mutation({
  args: {
    agentPrincipal: agentAccessPrincipalValue,
    currency: v.optional(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: v.object({ kind: v.literal('error'), code: v.literal('source_unavailable') }),
  handler: async () => ({ kind: 'error' as const, code: 'source_unavailable' as const }),
})
