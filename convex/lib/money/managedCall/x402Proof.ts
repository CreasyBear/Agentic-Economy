import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { ActionCtx, QueryCtx } from '../../../_generated/server'
import { transitionResult, type TransitionResult } from './transitions'

export const validateX402ReleaseProofArgs = v.object({
    callRef: v.string(), attemptRef: v.string(), effectGeneration: v.number(),
    toolRef: v.string(), inputDigest: v.string(), reservationRef: v.string(),
    paymentIdentifier: v.string(), challengeDigest: v.string(), evidenceRef: v.string(),
    evidenceDigest: v.string(), paymentResponseDigest: v.string(),
    transportObservationDigest: v.string(), transportRequestDigest: v.string(),
    paymentObservationDigest: v.string(), observedAt: v.number(),
  })
export const validateX402ReleaseProofResult = v.boolean()
export const validateX402ReleaseProofHandler = async (ctx: QueryCtx, args: Infer<typeof validateX402ReleaseProofArgs>) => {
    const [call, payment] = await Promise.all([
      ctx.db.query('capabilityCalls')
        .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique(),
      ctx.db.query('moneyX402PaymentAttempts')
        .withIndex('by_attemptRef_and_effectGeneration', (query) => query
          .eq('attemptRef', args.attemptRef).eq('effectGeneration', args.effectGeneration)).unique(),
    ])
    return call !== null
      && (call.formanceFinancialState === 'reserved' || call.formanceFinancialState === 'released')
      && call.formanceReservationRefs?.includes(args.reservationRef) === true
      && payment !== null
      && payment.dispatchRef === args.callRef
      && payment.toolRef === args.toolRef
      && payment.inputDigest === args.inputDigest
      && payment.reservationRef === args.reservationRef
      && payment.paymentIdentifier === args.paymentIdentifier
      && payment.challengeDigest === args.challengeDigest
      && payment.paymentSignatureDigest === undefined
      && payment.submissionStartedAt === undefined
  }

export const releaseBeforeSubmissionWithX402ProofArgs = v.object({
    callRef: v.string(), attemptRef: v.string(), effectGeneration: v.number(),
    toolRef: v.string(), inputDigest: v.string(), reservationRef: v.string(),
    paymentIdentifier: v.string(), challengeDigest: v.string(), evidenceRef: v.string(),
    evidenceDigest: v.string(), paymentResponseDigest: v.string(),
    transportObservationDigest: v.string(), transportRequestDigest: v.string(),
    paymentObservationDigest: v.string(), observedAt: v.number(),
  })
export const releaseBeforeSubmissionWithX402ProofResult = transitionResult
export const releaseBeforeSubmissionWithX402ProofHandler = async (ctx: ActionCtx, args: Infer<typeof releaseBeforeSubmissionWithX402ProofArgs>): Promise<TransitionResult> => {
    const valid = await ctx.runQuery(internal.moneyManagedCallLifecycle.validateX402ReleaseProof, args)
    if (!valid) return { kind: 'refused' as const, code: 'managed_call_recovery_identity_mismatch' }
    return await ctx.runAction(internal.moneyManagedCallLifecycle.releaseBeforeSubmission, {
      callRef: args.callRef,
      now: args.observedAt,
    })
  }
