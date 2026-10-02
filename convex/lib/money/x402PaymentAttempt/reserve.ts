import { v, type Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import { loadByAttempt } from './attempt'
import { type AttemptRow, type PrepareArgs } from './contracts'
import { assertManagedCustodyPolicy, assertX402PaymentEnvironmentFence, prepareAttributionMatches, x402AuthorizationDigest, x402CustodyRefDigest, x402PaymentIdentityDigest } from './identity'
import { x402PaymentAuthorizationFailureCodeValue, x402PaymentAuthorizationFailureDetailValue } from '../../../../src/modules/money/schema'
import { x402SpendReservationRef } from '../../../../src/modules/money/x402-spend-admission'

export const prepareX402PaymentAuthorizationArgs = {
  aeEnvironment: v.union(v.literal('sandbox'), v.literal('production')),
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  toolRef: v.optional(v.string()),
  inputDigest: v.optional(v.string()),
  paymentIdentifier: v.string(),
  operationKeyDigest: v.string(),
  challengeDigest: v.string(),
  challengeJson: v.string(),
  selectedRequirementJson: v.string(),
  providerEndpoint: v.string(),
  credentialRef: v.string(),
  scheme: v.string(),
  network: v.string(),
  asset: v.string(),
  payTo: v.string(),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  reservationRef: v.optional(v.string()),
  requestFingerprint: v.optional(v.string()),
  custodyBudgetRef: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
  custodyDailyMaximumUnits: v.optional(v.string()),
}

export const prepareX402PaymentAuthorizationReturns = v.object({
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  custodyBudgetRef: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
  custodyDailyMaximumUnits: v.optional(v.string()),
})

export const x402PaymentAuthorizationFailureCode = x402PaymentAuthorizationFailureCodeValue

export type X402PaymentAuthorizationFailureCode = Infer<
  typeof x402PaymentAuthorizationFailureCode
>
export const x402PaymentAuthorizationFailureDetail = x402PaymentAuthorizationFailureDetailValue
export type X402PaymentAuthorizationFailureDetail = Infer<
  typeof x402PaymentAuthorizationFailureDetail
>

export const recordX402PaymentAuthorizationFailureArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  code: x402PaymentAuthorizationFailureCode,
  detail: v.optional(x402PaymentAuthorizationFailureDetail),
}

export const recordX402PaymentAuthorizationFailureReturns = v.null()

export type RecordAuthorizationFailureArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  code: X402PaymentAuthorizationFailureCode
  detail?: X402PaymentAuthorizationFailureDetail
}

async function loadByPaymentIdentifier(
  ctx: MutationCtx,
  paymentIdentifier: string,
): Promise<readonly AttemptRow[]> {
  return await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_paymentIdentifier', (query) => (
      query.eq('paymentIdentifier', paymentIdentifier)
    ))
    .take(8)
}

export async function prepareX402PaymentAuthorizationHandler(
  ctx: MutationCtx,
  args: PrepareArgs,
): Promise<Infer<typeof prepareX402PaymentAuthorizationReturns>> {
  assertX402PaymentEnvironmentFence({
    aeEnvironment: args.aeEnvironment,
    scheme: args.scheme,
    network: args.network,
    asset: args.asset,
  })
  assertManagedCustodyPolicy(args)
  const existing = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (existing !== null) {
    if (
      args.requestFingerprint !== undefined
      && existing.requestFingerprint !== args.requestFingerprint
    ) throw new Error('x402_payment_request_fingerprint_conflict')
    if (!prepareAttributionMatches(existing, args)) {
      throw new Error('x402_payment_attempt_attribution_invalid')
    }
    if (existing.state !== 'prepared') {
      throw new Error('x402_payment_attempt_reconciliation_required')
    }
    return {
      custodyRef: existing.custodyRef,
      authorizationDigest: existing.authorizationDigest,
      ...(existing.custodyBudgetRef === undefined ? {} : { custodyBudgetRef: existing.custodyBudgetRef }),
      ...(existing.custodyGeneration === undefined ? {} : { custodyGeneration: existing.custodyGeneration }),
      ...(existing.custodyDailyMaximumUnits === undefined ? {} : { custodyDailyMaximumUnits: existing.custodyDailyMaximumUnits }),
    }
  }
  const identified = await loadByPaymentIdentifier(ctx, args.paymentIdentifier)
  if (identified.some((row) => (
    args.requestFingerprint !== undefined
    && row.requestFingerprint !== args.requestFingerprint
  ))) {
    throw new Error('x402_payment_request_fingerprint_conflict')
  }
  if (identified.some((row) => (
    row.attemptRef !== args.attemptRef
    || row.effectGeneration !== args.effectGeneration
    || !prepareAttributionMatches(row, args)
  ))) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  const custodyRef = x402CustodyRefDigest(args)
  const paymentIdentityDigest = x402PaymentIdentityDigest(args)
  const authorizationDigest = x402AuthorizationDigest(paymentIdentityDigest, args.credentialRef)
  const { aeEnvironment: _aeEnvironment, ...persistArgs } = args
  await ctx.db.insert('moneyX402PaymentAttempts', {
    ...persistArgs,
    custodyRef,
    authorizationDigest,
    paymentIdentityDigest,
    spendReservationRef: x402SpendReservationRef({ custodyRef, attemptRef: args.attemptRef, effectGeneration: args.effectGeneration, paymentIdentityDigest }),
    state: 'prepared',
    preparedAt: Date.now(),
    evidenceRefs: [],
  })
  return {
    custodyRef,
    authorizationDigest,
    ...(args.custodyBudgetRef === undefined ? {} : { custodyBudgetRef: args.custodyBudgetRef }),
    ...(args.custodyGeneration === undefined ? {} : { custodyGeneration: args.custodyGeneration }),
    ...(args.custodyDailyMaximumUnits === undefined ? {} : { custodyDailyMaximumUnits: args.custodyDailyMaximumUnits }),
  }
}

export async function recordX402PaymentAuthorizationFailureHandler(
  ctx: MutationCtx,
  args: RecordAuthorizationFailureArgs,
): Promise<null> {
  const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (row === null || row.dispatchRef !== args.dispatchRef) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  if (
    row.state !== 'prepared'
    || row.submissionStartedAt !== undefined
    || row.paymentSignatureDigest !== undefined
  ) throw new Error('x402_payment_authorization_failure_state_invalid')
  if (args.code !== 'provider_authority_invalid' && args.detail !== undefined) {
    throw new Error('x402_payment_authorization_failure_detail_invalid')
  }
  if (
    row.authorizationFailureCode === args.code
    && row.authorizationFailureDetail === args.detail
  ) {
    return null
  }
  await ctx.db.patch(row._id, {
    authorizationFailureCode: args.code,
    ...(args.detail === undefined
      ? { authorizationFailureDetail: undefined }
      : { authorizationFailureDetail: args.detail }),
    authorizationFailureObservedAt: Date.now(),
  })
  return null
}
