import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import {
  authorizeConnectOnboardingArgs,
  authorizeConnectOnboardingHandler,
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

export const recordConnectAccountEvent = mutation({
  args: recordConnectAccountEventArgs,
  returns: connectAccountResultValue,
  handler: recordConnectAccountEventHandler,
})

const retiredCreditRefusal = { kind: 'refused' as const, code: 'account_aud_required' as const }

export const readCreditAccount = query({
  args: { principalId: identifier, currency: identifier },
  handler: async () => retiredCreditRefusal,
})

export const listCreditActivity = query({
  args: {
    principalId: identifier,
    credentialId: identifier,
    currency: identifier,
    paginationOpts: paginationOptsValidator,
  },
  handler: async () => ({ ...retiredCreditRefusal, items: [] as const }),
})

export const readKeyUsage = query({
  args: { principalId: identifier, credentialId: identifier, currency: identifier },
  handler: async () => ({ ...retiredCreditRefusal, items: [] as const }),
})

export const readOwnerProviderEarnings = query({
  args: {},
  handler: async (ctx) => {
    const actor = await resolveBusinessActor(ctx)
    return actor.kind === 'authenticated_owner'
      ? { kind: 'not_found' as const }
      : { kind: 'error' as const, code: 'unauthenticated' as const }
  },
})

export const readAgentProviderEarnings = mutation({
  args: { agentPrincipal: v.any(), currency: v.optional(v.string()) },
  handler: async () => ({ kind: 'error' as const, code: 'source_unavailable' as const }),
})
