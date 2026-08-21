import { internalMutation, internalQuery } from './_generated/server'
import {
  claimX402PaymentAuthorizationArgs,
  claimX402PaymentAuthorizationHandler,
  claimX402PaymentAuthorizationReturns,
  markX402PaymentPossiblySubmittedArgs,
  markX402PaymentPossiblySubmittedHandler,
  markX402PaymentPossiblySubmittedReturns,
  prepareX402PaymentAuthorizationArgs,
  prepareX402PaymentAuthorizationHandler,
  prepareX402PaymentAuthorizationReturns,
  recordX402PaymentSignatureDigestArgs,
  recordX402PaymentSignatureDigestHandler,
  recordX402PaymentSignatureDigestReturns,
  recordX402PaymentSigningIntentArgs,
  recordX402PaymentSigningIntentHandler,
  recordX402PaymentSigningIntentReturns,
} from './moneyX402PaymentAuthorization'
import {
  observeX402PaymentAttemptArgs,
  observeX402PaymentAttemptHandler,
  observeX402PaymentAttemptReturns,
  recordX402PaymentObservationArgs,
  recordX402PaymentObservationHandler,
  recordX402PaymentObservationReturns,
  reconcileX402PaymentAttemptArgs,
  reconcileX402PaymentAttemptHandler,
  reconcileX402PaymentAttemptReturns,
} from './moneyX402PaymentObservation'
import {
  listExpiredPreparedX402PaymentAttemptsArgs,
  listExpiredPreparedX402PaymentAttemptsHandler,
  listExpiredPreparedX402PaymentAttemptsReturns,
  readX402PaymentAttemptArgs,
  readX402PaymentAttemptHandler,
  readX402PaymentAttemptReturns,
  readX402PaymentAuthorizationArgs,
  readX402PaymentAuthorizationByDigestArgs,
  readX402PaymentAuthorizationByDigestHandler,
  readX402PaymentAuthorizationByDigestReturns,
  readX402PaymentAuthorizationHandler,
  readX402PaymentAuthorizationReturns,
} from './moneyX402PaymentRead'

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

export const reconcileX402PaymentAttempt = internalMutation({
  args: reconcileX402PaymentAttemptArgs,
  returns: reconcileX402PaymentAttemptReturns,
  handler: reconcileX402PaymentAttemptHandler,
})
