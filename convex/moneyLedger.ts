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
  canonicalBillingPrincipalContext,
  canonicalBillingTransactionContext,
  canonicalBillingTopupContext,
  persistedInvocationAuthorityIsCurrent,
} from './moneyBillingAuthorization'
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
import { workloadCronSnapshotValue } from './workloadCron'
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
  handler: async (ctx, args) => {
    if (!(await persistedInvocationAuthorityIsCurrent(ctx, {
      invocationRef: args.invocationRef,
      principalId: args.principalId,
      credentialId: args.credentialId,
      grantRef: args.grantRef,
      grantGeneration: args.grantGeneration,
      operationRef: args.operationRef,
      attemptRef: args.attemptRef,
    }))) {
      return {
        kind: 'refused' as const,
        code: 'external_spend_grant_invalid' as const,
        retryable: false,
      }
    }
    return await reconcileExternalInvocationSpendHandler(ctx, args)
  },
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
  handler: async (ctx, args) => {
    const canonicalCtx = await canonicalBillingPrincipalContext(
      ctx,
      args.principalId,
    )
    return canonicalCtx === null
      ? {
          kind: 'refused' as const,
          code: 'billing_identity_missing',
          retryable: false,
        }
      : await reserveCreditTopupHandler(canonicalCtx, args)
  },
})
export const markCreditTopupOutcomeUnknown = mutation({
  args: markCreditTopupOutcomeUnknownArgs.fields,
  returns: topupCommandResultValue,
  handler: async (ctx, args) => {
    const canonicalCtx = await canonicalBillingTopupContext(ctx, {
      commandRef: args.commandRef,
      idempotencyKey: args.idempotencyKey,
    })
    return canonicalCtx === null
      ? {
          kind: 'refused' as const,
          code: 'billing_identity_missing',
          retryable: false,
        }
      : await markCreditTopupOutcomeUnknownHandler(canonicalCtx, args)
  },
})

export const bindCreditPaymentSession = mutation({
  args: bindCreditPaymentSessionArgs.fields,
  returns: topupCommandResultValue,
  handler: async (ctx, args) => {
    const canonicalCtx = await canonicalBillingTopupContext(ctx, {
      commandRef: args.commandRef,
    })
    return canonicalCtx === null
      ? {
          kind: 'refused' as const,
          code: 'billing_identity_missing',
          retryable: false,
        }
      : await bindCreditPaymentSessionHandler(canonicalCtx, args)
  },
})
export const readCreditTopupCommand = query({
  args: topupReadInputArg.fields,
  returns: topupCommandResultValue,
  handler: async (ctx, args) => {
    const canonicalCtx = await canonicalBillingTopupContext(ctx, args)
    return canonicalCtx === null
      ? {
          kind: 'refused' as const,
          code: 'billing_identity_missing',
          retryable: false,
        }
      : await readCreditTopupCommandHandler(canonicalCtx, args)
  },
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
  args: { now: v.optional(v.number()), workload: workloadCronSnapshotValue },
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
  handler: async (ctx, args) => {
    const canonicalCtx = await canonicalBillingTransactionContext(ctx, args)
    return canonicalCtx === null
      ? {
          kind: 'refused' as const,
          code: 'charge_reconciliation_required',
          retryable: false,
        }
      : await reconcileChargeHandler(canonicalCtx, args)
  },
})

export const reconcileInvocationCharge = internalMutation({
  args: reconcileInvocationChargeArgs,
  returns: invocationChargeReconciliationResult,
  handler: async (ctx, args) =>
    (await persistedInvocationAuthorityIsCurrent(ctx, {
      invocationRef: args.invocationRef,
      principalId: args.principalId,
      credentialId: args.credentialId,
      inputDigest: args.inputDigest,
      attemptRef: args.attemptRef,
    }))
      ? await reconcileInvocationChargeHandler(ctx, args)
      : { kind: 'reconciliation_required' as const },
})

export const markChargeOutcomeUnknown = internalMutation({
  args: markChargeOutcomeUnknownArgs,
  returns: chargeOutcomeUnknownResultValue,
  handler: async (ctx, args) => {
    const canonicalCtx = await canonicalBillingTransactionContext(ctx, args)
    return canonicalCtx === null
      ? {
          kind: 'refused' as const,
          code: 'charge_reconciliation_required',
          retryable: false,
        }
      : await markChargeOutcomeUnknownHandler(canonicalCtx, args)
  },
})

export const readCreditAccount = query({
  args: { ...moneyArgs },
  handler: async (ctx, args) => {
    const canonicalCtx = await canonicalBillingPrincipalContext(
      ctx,
      args.principalId,
    )
    return canonicalCtx === null
      ? {
          kind: 'refused' as const,
          code: 'billing_identity_missing' as const,
        }
      : await readCreditAccountHandler(canonicalCtx, args)
  },
})

export const listCreditActivity = query({
  args: {
    principalId: identifier,
    credentialId: identifier,
    currency: identifier,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const canonicalCtx = await canonicalBillingPrincipalContext(
      ctx,
      args.principalId,
      args.credentialId,
    )
    return canonicalCtx === null
      ? {
          kind: 'refused' as const,
          code: 'billing_identity_missing' as const,
          items: [] as const,
        }
      : await listCreditActivityHandler(canonicalCtx, args)
  },
})

export const readKeyUsage = query({
  args: {
    principalId: identifier,
    credentialId: identifier,
    currency: identifier,
  },
  handler: async (ctx, args) => {
    const canonicalCtx = await canonicalBillingPrincipalContext(
      ctx,
      args.principalId,
      args.credentialId,
    )
    return canonicalCtx === null
      ? {
          kind: 'refused' as const,
          code: 'billing_identity_missing' as const,
          items: [] as const,
        }
      : await readKeyUsageHandler(canonicalCtx, args)
  },
})

export const readOwnerProviderEarnings = query({
  args: readOwnerProviderEarningsArgs,
  returns: ownerProviderEarningsResultValue,
  handler: readOwnerProviderEarningsHandler,
})

export const readAgentProviderEarnings = mutation({
  args: agentProviderEarningsReadArgs,
  returns: ownerProviderEarningsResultValue,
  handler: async (ctx, args) => {
    const now = Date.now()
    const [storedAgent, principal, account] = await Promise.all([
      ctx.db
        .query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) =>
          query.eq('principalId', args.agentPrincipal.principalId),
        )
        .unique(),
      ctx.db
        .query('principals')
        .withIndex('by_principalRef', (query) =>
          query.eq('principalRef', args.agentPrincipal.principalId),
        )
        .unique(),
      ctx.db
        .query('accounts')
        .withIndex('by_accountRef', (query) =>
          query.eq('accountRef', args.agentPrincipal.ownerId),
        )
        .unique(),
    ])
    if (
      storedAgent === null ||
      storedAgent.principalId !== args.agentPrincipal.principalId ||
      storedAgent.ownerId !== args.agentPrincipal.ownerId ||
      storedAgent.credentialId !== args.agentPrincipal.credentialId ||
      storedAgent.applicationRef !== args.agentPrincipal.applicationRef ||
      storedAgent.environment !== args.agentPrincipal.environment ||
      storedAgent.authorityMode !== args.agentPrincipal.authorityMode ||
      storedAgent.lifecycle !== 'active' ||
      (storedAgent.expiresAt !== undefined && storedAgent.expiresAt <= now) ||
      principal === null ||
      principal.principalRef !== storedAgent.principalId ||
      principal.kind !== 'agent' ||
      principal.lifecycle !== 'active' ||
      account === null ||
      account.accountRef !== storedAgent.ownerId ||
      account.lifecycle !== 'active'
    ) {
      return { kind: 'error' as const, code: 'unauthenticated' as const }
    }
    const admission = await readAgentProviderEarningsHandler(ctx, args)
    if (admission.kind === 'error') return admission
    const business = await ctx.db
      .query('businesses')
      .withIndex('by_owningAccountRef_and_updatedAt', (query) => query.eq('owningAccountRef', storedAgent.ownerId))
      .order('desc')
      .first()
    if (business === null) return { kind: 'not_found' as const }
    const businessId = String(business._id)
    const requestedCurrency = args.currency
    const accountRows =
      requestedCurrency === undefined
        ? await ctx.db
            .query('moneyAccounts')
            .withIndex('by_businessId_and_currency', (query) =>
              query.eq('businessId', businessId),
            )
            .take(11)
        : await ctx.db
            .query('moneyAccounts')
            .withIndex('by_businessId_and_currency', (query) =>
              query
                .eq('businessId', businessId)
                .eq('currency', requestedCurrency),
            )
            .take(1)
    const providerAccounts = accountRows.filter(
      (candidate) => candidate.accountKind === 'provider_earnings',
    )
    const projected = await Promise.all(
      providerAccounts.slice(0, 10).map(async (providerAccount) => {
        const earnings = await readProviderEarningsHandler(ctx, {
          businessId,
          currency: providerAccount.currency,
        })
        const payout = await readPayoutStatusHandler(ctx, {
          businessId,
          currency: providerAccount.currency,
        })
        return earnings.kind === 'ok' && payout.kind === 'ok'
          ? { currency: providerAccount.currency, earnings, payout }
          : undefined
      }),
    )
    if (projected.some((candidate) => candidate === undefined)) {
      return { kind: 'error' as const, code: 'source_unavailable' as const }
    }
    return {
      kind: 'available' as const,
      businessId,
      accounts: projected.filter((candidate) => candidate !== undefined),
      accountsTruncated:
        args.currency === undefined && providerAccounts.length > 10,
    }
  },
})

export const readProviderEarnings = internalQuery({
  args: readProviderEarningsArgs,
  handler: readProviderEarningsHandler,
})

export const readPayoutStatus = internalQuery({
  args: readProviderEarningsArgs,
  handler: readPayoutStatusHandler,
})
