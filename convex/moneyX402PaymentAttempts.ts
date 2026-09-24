import { internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'
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
import { beginResponseRecoveryHandler, responseRecoveryIsCurrentHandler } from './lib/x402ResponseRecovery'
import { persistedCallAuthorityIsCurrent } from './lib/money/billingAuthorization/persistedCall'
import { persistedPaidCallConsequenceIsAdmitted } from './lib/callLifecycle/paidConsequenceAdmission'

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

export const beginResponseRecovery = internalMutation({
  args: { callRef: v.string(), attempt: v.number() },
  returns: v.boolean(),
  handler: beginResponseRecoveryHandler,
})

export const responseRecoveryIsCurrent = internalQuery({
  args: { callRef: v.string(), attempt: v.number() },
  returns: v.boolean(),
  handler: responseRecoveryIsCurrentHandler,
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
      !(args.settlementStatus === 'settled' && await persistedPaidCallConsequenceIsAdmitted(ctx, attempt)) &&
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
