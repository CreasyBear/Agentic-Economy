import { internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import {
  claimX402PaymentAuthorizationArgs,
  claimX402PaymentAuthorizationHandler,
  claimX402PaymentAuthorizationReturns,
  checkpointX402ResponseHandler,
  listExpiredPreparedX402PaymentAttemptsArgs,
  listExpiredPreparedX402PaymentAttemptsHandler,
  listExpiredPreparedX402PaymentAttemptsReturns,
  markX402PaymentPossiblySubmittedArgs,
  markX402PaymentPossiblySubmittedHandler,
  markX402PaymentPossiblySubmittedReturns,
  observeX402PaymentAttemptArgs,
  observeX402PaymentAttemptHandler,
  observeX402PaymentAttemptReturns,
  prepareX402PaymentAuthorizationArgs,
  prepareX402PaymentAuthorizationHandler,
  prepareX402PaymentAuthorizationReturns,
  readX402PaymentAttemptArgs,
  readX402PaymentAttemptHandler,
  readX402PaymentAttemptReturns,
  readX402PaymentAuthorizationArgs,
  readX402PaymentAuthorizationByDigestArgs,
  readX402PaymentAuthorizationByDigestHandler,
  readX402PaymentAuthorizationByDigestReturns,
  readX402PaymentAuthorizationHandler,
  readX402PaymentAuthorizationReturns,
  reconcileX402PaymentAttemptArgs,
  reconcileX402PaymentAttemptHandler,
  reconcileX402PaymentAttemptReturns,
  recordX402PaymentAuthorizationFailureArgs,
  recordX402PaymentAuthorizationFailureHandler,
  recordX402PaymentAuthorizationFailureReturns,
  recordX402PaymentObservationArgs,
  recordX402PaymentObservationHandler,
  recordX402PaymentObservationReturns,
  recordX402PaymentSignatureDigestArgs,
  recordX402PaymentSignatureDigestHandler,
  recordX402PaymentSignatureDigestReturns,
  recordX402PaymentSigningIntentArgs,
  recordX402PaymentSigningIntentHandler,
  recordX402PaymentSigningIntentReturns,
} from './lib/x402PaymentAttempt'
import { prepareSellerOnboardingCanaryPaymentAuthorizationHandler } from './lib/x402PaymentAttemptCanary'
import { persistedCallAuthorityIsCurrent } from './moneyBillingAuthorization'

/** Platform validation uses the same durable signing attempt, without a buyer reservation. */
export const prepareSellerOnboardingCanaryPaymentAuthorization = internalMutation({
  args: prepareX402PaymentAuthorizationArgs,
  returns: prepareX402PaymentAuthorizationReturns,
  handler: prepareSellerOnboardingCanaryPaymentAuthorizationHandler,
})

export const prepareX402PaymentAuthorization = internalMutation({
  args: prepareX402PaymentAuthorizationArgs,
  returns: prepareX402PaymentAuthorizationReturns,
  handler: prepareX402PaymentAuthorizationHandler,
})

export const claimX402PaymentAuthorization = internalMutation({
  args: claimX402PaymentAuthorizationArgs,
  returns: claimX402PaymentAuthorizationReturns,
  handler: claimX402PaymentAuthorizationHandler,
})

export const recordX402PaymentSigningIntent = internalMutation({
  args: recordX402PaymentSigningIntentArgs,
  returns: recordX402PaymentSigningIntentReturns,
  handler: recordX402PaymentSigningIntentHandler,
})

export const recordX402PaymentSignatureDigest = internalMutation({
  args: recordX402PaymentSignatureDigestArgs,
  returns: recordX402PaymentSignatureDigestReturns,
  handler: recordX402PaymentSignatureDigestHandler,
})

export const recordX402PaymentAuthorizationFailure = internalMutation({
  args: recordX402PaymentAuthorizationFailureArgs,
  returns: recordX402PaymentAuthorizationFailureReturns,
  handler: recordX402PaymentAuthorizationFailureHandler,
})

export const readX402PaymentAuthorization = internalQuery({
  args: readX402PaymentAuthorizationArgs,
  returns: readX402PaymentAuthorizationReturns,
  handler: readX402PaymentAuthorizationHandler,
})

export const readX402PaymentAuthorizationByDigest = internalQuery({
  args: readX402PaymentAuthorizationByDigestArgs,
  returns: readX402PaymentAuthorizationByDigestReturns,
  handler: readX402PaymentAuthorizationByDigestHandler,
})

export const markX402PaymentPossiblySubmitted = internalMutation({
  args: markX402PaymentPossiblySubmittedArgs,
  returns: markX402PaymentPossiblySubmittedReturns,
  handler: markX402PaymentPossiblySubmittedHandler,
})

export const observeX402PaymentAttempt = internalMutation({
  args: observeX402PaymentAttemptArgs,
  returns: observeX402PaymentAttemptReturns,
  handler: observeX402PaymentAttemptHandler,
})

export const readX402PaymentAttempt = internalQuery({
  args: readX402PaymentAttemptArgs,
  returns: readX402PaymentAttemptReturns,
  handler: readX402PaymentAttemptHandler,
})

export const listExpiredPreparedX402PaymentAttempts = internalQuery({
  args: listExpiredPreparedX402PaymentAttemptsArgs,
  returns: listExpiredPreparedX402PaymentAttemptsReturns,
  handler: listExpiredPreparedX402PaymentAttemptsHandler,
})

export const recordX402PaymentObservation = internalMutation({
  args: recordX402PaymentObservationArgs,
  returns: recordX402PaymentObservationReturns,
  handler: recordX402PaymentObservationHandler,
})

export const checkpointX402Response = internalMutation({
  args: {
    dispatchRef: v.string(), attemptRef: v.string(), effectGeneration: v.number(),
    toolRef: v.string(), inputDigest: v.string(), paymentIdentifier: v.string(),
    responseDigest: v.string(), outputJson: v.string(),
    settlementTransactionRef: v.optional(v.string()),
    requestDigest: v.string(), paymentResponseDigest: v.optional(v.string()),
  },
  returns: v.null(),
  handler: checkpointX402ResponseHandler,
})

/** Commit the next watchdog before an action can die during RPC or accounting. */
export const beginResponseRecovery = internalMutation({
  args: { callRef: v.string(), attempt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.attempt) || args.attempt < 0 || args.attempt > 4) return false
    const row = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
    if (row === null || (row.state !== 'pending' && row.state !== 'reconciliation_required')) return false
    const owner = row.reconciliation?.leaseOwner
    const ownStep = owner?.startsWith('paid-response:') ? Number(owner.slice('paid-response:'.length)) : -1
    if (ownStep >= args.attempt) return false
    if (owner !== undefined && ownStep < 0
      && (row.reconciliation?.leaseExpiresAt ?? 0) > Date.now()) {
      // A status sweep owns no payment effect; wait for it without losing this watchdog.
      if (owner.startsWith('reconciliation-sweep:') && row.reconciliation !== undefined) {
        const resumeAt = row.reconciliation.leaseExpiresAt! + 1
        if (row.reconciliation.nextAttemptAt !== resumeAt) {
          await ctx.db.patch(row._id, { reconciliation: { ...row.reconciliation, nextAttemptAt: resumeAt } })
          await ctx.scheduler.runAt(resumeAt, internal.moneyX402ResponseActions.recover, args)
        }
      }
      return false
    }
    const nextAt = Date.now() + 60_000 * 2 ** args.attempt
    await ctx.db.patch(row._id, { reconciliation: {
      disposition: args.attempt === 4 ? 'manual_review' : 'automatic',
      reason: 'recovery_failed', attemptCount: args.attempt + 1, nextAttemptAt: nextAt,
      leaseOwner: `paid-response:${args.attempt}`, leaseExpiresAt: nextAt + 60_000,
    } })
    if (args.attempt < 4) await ctx.scheduler.runAt(nextAt, internal.moneyX402ResponseActions.recover, {
      callRef: args.callRef, attempt: args.attempt + 1,
    })
    return args.attempt < 4
  },
})

export const reconcileX402PaymentAttempt = internalMutation({
  args: reconcileX402PaymentAttemptArgs,
  returns: reconcileX402PaymentAttemptReturns,
  handler: async (ctx, args) => {
    const attempt = await ctx.db
      .query('moneyX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', (query) =>
        query
          .eq('attemptRef', args.attemptRef)
          .eq('effectGeneration', args.effectGeneration),
      )
      .unique()
    if (
      attempt === null ||
      attempt.dispatchRef !== args.dispatchRef ||
      attempt.toolRef !== args.toolRef ||
      attempt.inputDigest !== args.inputDigest ||
      !(await persistedCallAuthorityIsCurrent(ctx, {
        callRef: attempt.dispatchRef,
        toolRef: attempt.toolRef,
        inputDigest: attempt.inputDigest,
        attemptRef: attempt.attemptRef,
      }))
    ) {
      return { kind: 'reconciliation_required' as const }
    }
    return await reconcileX402PaymentAttemptHandler(ctx, args)
  },
})
