import { paginationOptsValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'

import { internal } from './_generated/api'
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { agentAccessPrincipalValue } from './agentAccessPrincipals'
import { exactAmount } from './moneyLedgerValues'
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

// Money reads now go through the official Formance boundary
// (`convex/moneyFormance.ts`), which only exposes Node internal actions, so
// these three public functions must be `action`s themselves — a `query`
// cannot call a Node action. Each derives its owner from the interactive
// session (never a client-supplied id) the same way `readOwnerPayoutAccount`
// and `readAccountBalanceSubjectHandler` do, and only serves the Account the
// caller's own args claim to be reading.
const creditRefusalValue = v.object({ kind: v.literal('refused'), code: v.string() })
const creditRefusalWithItemsValue = v.object({
  kind: v.literal('refused'),
  code: v.string(),
  items: v.array(v.string()),
})
const chargeStateValue = v.union(
  v.literal('free_tier'),
  v.literal('paid'),
  v.literal('insufficient_credit'),
  v.literal('outcome_unknown'),
  v.literal('refunded'),
)
const creditAccountResultValue = v.union(
  v.object({
    kind: v.literal('ok'),
    principalId: v.string(),
    accountId: v.string(),
    balance: exactAmount,
    pendingTopup: v.optional(v.object({
      amount: exactAmount,
      state: v.union(v.literal('pending'), v.literal('outcome_unknown')),
      externalRef: v.optional(v.string()),
    })),
    autoRecharge: v.object({
      enabled: v.boolean(),
      threshold: exactAmount,
      rechargeAmount: exactAmount,
    }),
    evidence: v.literal('source'),
  }),
  creditRefusalValue,
)
const creditActivityResultValue = v.union(
  v.object({
    kind: v.literal('ok'),
    page: v.array(v.object({
      activityRef: v.string(),
      credentialId: v.string(),
      serviceRef: v.string(),
      offeringRef: v.string(),
      businessId: v.string(),
      operationKey: v.string(),
      callRef: v.string(),
      attemptRef: v.string(),
      grossAmount: exactAmount,
      chargeState: chargeStateValue,
      priceDigest: v.string(),
      observedAt: v.number(),
      transactionRef: v.optional(v.string()),
    })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  creditRefusalWithItemsValue,
)
const keyUsageResultValue = v.union(
  v.object({
    kind: v.literal('ok'),
    credentialId: v.string(),
    callCount: v.number(),
    paidCallCount: v.number(),
    freeCallCount: v.number(),
    grossSpend: exactAmount,
    states: v.array(chargeStateValue),
  }),
  creditRefusalWithItemsValue,
)

// Explicit return-type annotations on the three `ctx.runAction` calls below
// work around the TS circularity Convex's own guidelines call out: `internal`
// aggregates every module (including this one), so inference on a same-file
// export can otherwise loop back on itself.
type FormanceDisplayBalanceRead = Readonly<
  | { kind: 'available'; currency: 'AUD' | 'USDC'; exponent: 6; units: string }
  | { kind: 'setup_required' | 'unavailable' }
>
type FormanceStatementPageRead = Readonly<
  | { kind: 'available'; transactionRefs: readonly string[]; exactAmountUnits: string; continueCursor: string; isDone: boolean }
  | { kind: 'setup_required' | 'unavailable' }
>
type FormancePeriodSpendRead = Readonly<
  | { kind: 'available'; spendUnits: string }
  | { kind: 'empty' }
  | { kind: 'setup_required' | 'unavailable' }
>

/** The current UTC-month window `AeOwnerCredit`'s own copy already promises. */
function currentUtcMonthWindow(): { periodStartAt: number; periodEndAt: number } {
  const now = new Date()
  return {
    periodStartAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    periodEndAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  }
}

export const readCreditAccount = action({
  args: { principalId: identifier, currency: identifier },
  returns: creditAccountResultValue,
  handler: async (ctx, args): Promise<Infer<typeof creditAccountResultValue>> => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'unauthenticated' }
    if (args.principalId !== actor.canonicalAccountRef) {
      return { kind: 'refused' as const, code: 'billing_identity_mismatch' }
    }
    const balance: FormanceDisplayBalanceRead = await ctx.runAction(internal.moneyFormance.readDisplayBalance, {
      balanceKind: 'account_aud' as const,
      subjectRef: actor.canonicalAccountRef,
    })
    if (balance.kind !== 'available') return { kind: 'refused' as const, code: 'source_unavailable' }
    const zero = { currency: balance.currency, units: '0', exponent: 6 as const }
    return {
      kind: 'ok' as const,
      principalId: actor.canonicalAccountRef,
      accountId: actor.canonicalAccountRef,
      balance: { currency: balance.currency, units: balance.units, exponent: balance.exponent },
      // Auto-recharge is not implemented yet; report the fixed disabled
      // default used elsewhere for this not-yet-built feature rather than
      // inventing a value the source cannot back.
      autoRecharge: { enabled: false, threshold: zero, rechargeAmount: zero },
      evidence: 'source' as const,
    }
  },
})

export const listCreditActivity = action({
  args: {
    principalId: identifier,
    credentialId: identifier,
    currency: identifier,
    paginationOpts: paginationOptsValidator,
  },
  returns: creditActivityResultValue,
  handler: async (ctx, args): Promise<Infer<typeof creditActivityResultValue>> => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'unauthenticated', items: [] }
    if (args.principalId !== actor.canonicalAccountRef) {
      return { kind: 'refused' as const, code: 'billing_identity_mismatch', items: [] }
    }
    const { periodStartAt, periodEndAt } = currentUtcMonthWindow()
    const page: FormanceStatementPageRead = await ctx.runAction(internal.moneyFormance.readStatementPage, {
      accountRef: actor.canonicalAccountRef,
      periodStartAt,
      periodEndAt,
      snapshotCutoffAt: Date.now(),
      ...(args.paginationOpts.cursor === null ? {} : { cursor: args.paginationOpts.cursor }),
    })
    if (page.kind !== 'available') return { kind: 'refused' as const, code: 'source_unavailable', items: [] }
    // Formance's statement page returns bare transaction references. It does
    // not carry the per-credential service/offering/charge-state detail this
    // view needs, and nothing else in the source tracks that breakdown per
    // credential today. Report unavailable rather than fabricate it.
    return { kind: 'refused' as const, code: 'credential_activity_unavailable', items: [] }
  },
})

export const readKeyUsage = action({
  args: { principalId: identifier, credentialId: identifier, currency: identifier },
  returns: keyUsageResultValue,
  handler: async (ctx, args): Promise<Infer<typeof keyUsageResultValue>> => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'unauthenticated', items: [] }
    if (args.principalId !== actor.canonicalAccountRef) {
      return { kind: 'refused' as const, code: 'billing_identity_mismatch', items: [] }
    }
    const { periodStartAt, periodEndAt } = currentUtcMonthWindow()
    const spend: FormancePeriodSpendRead = await ctx.runAction(internal.moneyFormance.readPeriodSpend, {
      accountRef: actor.canonicalAccountRef,
      periodStartAt,
      periodEndAt,
    })
    if (spend.kind === 'setup_required' || spend.kind === 'unavailable') {
      return { kind: 'refused' as const, code: 'source_unavailable', items: [] }
    }
    // Formance's period spend is scoped to the whole Account, not a single
    // credential; there is no per-credential ledger to attribute a call
    // count or spend split to `args.credentialId`. Report unavailable rather
    // than fabricate a credential-level breakdown.
    return { kind: 'refused' as const, code: 'credential_usage_unavailable', items: [] }
  },
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
