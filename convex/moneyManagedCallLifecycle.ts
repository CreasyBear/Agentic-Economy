import { internalQuery, internalMutation, internalAction } from './_generated/server'
import { readReservationArgs, readReservationResult, readReservationHandler } from './lib/money/managedCall/reservationRead'
import { markPossiblySubmittedArgs, markPossiblySubmittedResult, markPossiblySubmittedHandler, markOutcomeUnknownArgs, markOutcomeUnknownResult, markOutcomeUnknownHandler, finalizeReleaseArgs, finalizeReleaseResult, finalizeReleaseHandler, finalizeSettlementArgs, finalizeSettlementResult, finalizeSettlementHandler } from './lib/money/managedCall/transitions'
import { releaseBeforeSubmissionArgs, releaseBeforeSubmissionResult, releaseBeforeSubmissionHandler, settleArgs, settleResult, settleHandler, reconcileSettlementArgs, reconcileSettlementResult, reconcileSettlementHandler, reconcileReservationArgs, reconcileReservationResult, reconcileReservationHandler, reconcileReleaseArgs, reconcileReleaseResult, reconcileReleaseHandler } from './lib/money/managedCall/lifecycleActions'
import { validateX402ReleaseProofArgs, validateX402ReleaseProofResult, validateX402ReleaseProofHandler, releaseBeforeSubmissionWithX402ProofArgs, releaseBeforeSubmissionWithX402ProofResult, releaseBeforeSubmissionWithX402ProofHandler } from './lib/money/managedCall/x402Proof'
import { resolveBuyerSaleSourcesArgs, resolveBuyerSaleSourcesResult, resolveBuyerSaleSourcesHandler } from './lib/money/managedCall/historySources'

export const readReservation = internalQuery({
  args: readReservationArgs.fields,
  returns: readReservationResult,
  handler: readReservationHandler,
})

export const resolveBuyerSaleSources = internalQuery({
  args: resolveBuyerSaleSourcesArgs.fields,
  returns: resolveBuyerSaleSourcesResult,
  handler: resolveBuyerSaleSourcesHandler,
})

export const markPossiblySubmitted = internalMutation({
  args: markPossiblySubmittedArgs.fields,
  returns: markPossiblySubmittedResult,
  handler: markPossiblySubmittedHandler,
})

export const markOutcomeUnknown = internalMutation({
  args: markOutcomeUnknownArgs.fields,
  returns: markOutcomeUnknownResult,
  handler: markOutcomeUnknownHandler,
})

export const finalizeRelease = internalMutation({
  args: finalizeReleaseArgs.fields,
  returns: finalizeReleaseResult,
  handler: finalizeReleaseHandler,
})

export const finalizeSettlement = internalMutation({
  args: finalizeSettlementArgs.fields,
  returns: finalizeSettlementResult,
  handler: finalizeSettlementHandler,
})

export const releaseBeforeSubmission = internalAction({
  args: releaseBeforeSubmissionArgs.fields,
  returns: releaseBeforeSubmissionResult,
  handler: releaseBeforeSubmissionHandler,
})

export const settle = internalAction({
  args: settleArgs.fields,
  returns: settleResult,
  handler: settleHandler,
})

export const reconcileSettlement = internalAction({
  args: reconcileSettlementArgs.fields,
  returns: reconcileSettlementResult,
  handler: reconcileSettlementHandler,
})

export const reconcileReservation = internalAction({
  args: reconcileReservationArgs.fields,
  returns: reconcileReservationResult,
  handler: reconcileReservationHandler,
})

export const reconcileRelease = internalAction({
  args: reconcileReleaseArgs.fields,
  returns: reconcileReleaseResult,
  handler: reconcileReleaseHandler,
})

export const validateX402ReleaseProof = internalQuery({
  args: validateX402ReleaseProofArgs.fields,
  returns: validateX402ReleaseProofResult,
  handler: validateX402ReleaseProofHandler,
})

export const releaseBeforeSubmissionWithX402Proof = internalAction({
  args: releaseBeforeSubmissionWithX402ProofArgs.fields,
  returns: releaseBeforeSubmissionWithX402ProofResult,
  handler: releaseBeforeSubmissionWithX402ProofHandler,
})
