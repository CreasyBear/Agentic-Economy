import { v, type Infer, type ObjectType } from 'convex/values'

import { parsePublishedOperationSnapshot } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { Doc } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { identifier } from './moneyLedgerValues'
import {
  externalSpendIdentityArgs,
} from './moneyExternalSpendShared'
import { reconcileExternalInvocationSpendHandler } from './moneyExternalSpendReconcile'

const reconcilePreSubmissionX402MoneyArgs = {
  ...externalSpendIdentityArgs,
  inputDigest: identifier,
  authorizationDigest: identifier,
  paymentResponseDigest: identifier,
  evidenceRef: identifier,
  evidenceDigest: identifier,
  transportObservationDigest: identifier,
  transportRequestDigest: identifier,
  paymentObservationDigest: identifier,
  observedAt: v.number(),
}

const reconcileManagedSigningX402MoneyArgs = {
  ...reconcilePreSubmissionX402MoneyArgs,
  paymentUnsignedMaterialDigest: identifier,
  paymentSigningIdempotencyKey: identifier,
  paymentPayer: identifier,
  paymentNonce: identifier,
  paymentAuthorizationValidBefore: identifier,
  paymentAuthorizationExpiresAt: v.number(),
  paymentSigningClaimedAt: v.number(),
  replayKind: v.literal('definitive_rejection'),
  replayEvidenceDigest: identifier,
}

const reconcilePostSubmissionX402MoneyArgs = {
  ...externalSpendIdentityArgs,
  inputDigest: identifier,
  settlementStatus: v.union(v.literal('settled'), v.literal('not_settled')),
  paymentResponseDigest: identifier,
  evidenceRef: identifier,
  evidenceDigest: identifier,
  transportObservationDigest: identifier,
  transportRequestDigest: identifier,
  paymentObservationDigest: identifier,
  observedAt: v.number(),
}

const reconcilePreSubmissionX402MoneyResult = v.union(
  v.object({ kind: v.literal('accepted') }),
  v.object({ kind: v.literal('replayed') }),
  v.object({ kind: v.literal('not_reconciled') }),
)

type ReconcileArgs = ObjectType<typeof reconcilePreSubmissionX402MoneyArgs>
type ManagedSigningReconcileArgs = ObjectType<typeof reconcileManagedSigningX402MoneyArgs>
type PostSubmissionReconcileArgs = ObjectType<typeof reconcilePostSubmissionX402MoneyArgs>
type ReconcileResult = Infer<typeof reconcilePreSubmissionX402MoneyResult>
type PaymentAttempt = Doc<'moneyX402PaymentAttempts'>

function externalReconciliationArgs(args: ReconcileArgs) {
  return {
    reservationRef: args.reservationRef,
    principalId: args.principalId,
    credentialId: args.credentialId,
    grantRef: args.grantRef,
    grantGeneration: args.grantGeneration,
    environment: args.environment,
    invocationRef: args.invocationRef,
    attemptRef: args.attemptRef,
    effectGeneration: args.effectGeneration,
    operationRef: args.operationRef,
    providerRef: args.providerRef,
    paymentIdentifier: args.paymentIdentifier,
    challengeDigest: args.challengeDigest,
    amount: args.amount,
    ...(args.executionContext === undefined ? {} : { executionContext: args.executionContext }),
    ...(args.custodyRef === undefined ? {} : { custodyRef: args.custodyRef }),
    ...(args.custodyGeneration === undefined ? {} : { custodyGeneration: args.custodyGeneration }),
    ...(args.custodyDailyMaximum === undefined ? {} : { custodyDailyMaximum: args.custodyDailyMaximum }),
    idempotencyDigest: args.idempotencyDigest,
    settlementStatus: 'not_settled' as const,
    paymentResponseDigest: args.paymentResponseDigest,
    evidenceRef: args.evidenceRef,
    evidenceDigest: args.evidenceDigest,
    observedAt: args.observedAt,
  }
}

function postSubmissionExternalReconciliationArgs(args: PostSubmissionReconcileArgs) {
  return {
    reservationRef: args.reservationRef,
    principalId: args.principalId,
    credentialId: args.credentialId,
    grantRef: args.grantRef,
    grantGeneration: args.grantGeneration,
    environment: args.environment,
    invocationRef: args.invocationRef,
    attemptRef: args.attemptRef,
    effectGeneration: args.effectGeneration,
    operationRef: args.operationRef,
    providerRef: args.providerRef,
    paymentIdentifier: args.paymentIdentifier,
    challengeDigest: args.challengeDigest,
    amount: args.amount,
    ...(args.executionContext === undefined ? {} : { executionContext: args.executionContext }),
    ...(args.custodyRef === undefined ? {} : { custodyRef: args.custodyRef }),
    ...(args.custodyGeneration === undefined ? {} : { custodyGeneration: args.custodyGeneration }),
    ...(args.custodyDailyMaximum === undefined ? {} : { custodyDailyMaximum: args.custodyDailyMaximum }),
    idempotencyDigest: args.idempotencyDigest,
    settlementStatus: args.settlementStatus,
    paymentResponseDigest: args.paymentResponseDigest,
    evidenceRef: args.evidenceRef,
    evidenceDigest: args.evidenceDigest,
    observedAt: args.observedAt,
  }
}

function invocationIdentityMatches(
  invocation: Doc<'capabilityOperationInvocations'>,
  args: ReconcileArgs | PostSubmissionReconcileArgs,
): boolean {
  const canary = invocation.sellerOnboardingCanary
  if (
    invocation.environment !== 'sandbox'
    || canary === undefined
    || canary.executionPurpose !== 'seller_onboarding_canary'
    || invocation.state !== 'reconciliation_required'
    || invocation.dispatchState !== 'reconciliation_required'
    || invocation.invocationRef !== args.invocationRef
    || invocation.principalId !== args.principalId
    || invocation.credentialId !== args.credentialId
    || invocation.grantRef !== args.grantRef
    || invocation.grantGeneration !== args.grantGeneration
    || invocation.operationRef !== args.operationRef
    || invocation.inputDigest !== args.inputDigest
    || invocation.attemptRef !== args.attemptRef
    || canary.invocationRef !== args.invocationRef
    || canary.operationRef !== args.operationRef
    || canary.inputDigest !== args.inputDigest
    || canary.funding.principalId !== args.principalId
    || canary.funding.credentialId !== args.credentialId
    || canary.funding.grantRef !== args.grantRef
    || canary.funding.grantGeneration !== args.grantGeneration
  ) return false
  const result = invocation.result
  if (
    result?.kind !== 'reconciliation_required'
    || result.invocationRef !== args.invocationRef
    || result.operationRef !== args.operationRef
    || result.evidence.attemptRef !== args.attemptRef
    || result.evidence.effectGeneration !== args.effectGeneration
  ) return false
  try {
    if (invocation.operationJson === undefined) return false
    const operation = parsePublishedOperationSnapshot(invocation.operationJson)
    return operation?.identity.adapterId === 'x402-fetch:v2'
      && operation.binding.authority.kind === 'provider_connection'
      && operation.binding.authority.providerRef === args.providerRef
      && operation.identity.payment.kind === 'x402'
  } catch {
    return false
  }
}

function controlIdentityMatches(
  control: Doc<'actionInvocationControls'>,
  args: ReconcileArgs | PostSubmissionReconcileArgs,
): boolean {
  const canonical = control.control.control
  return control.invocationRef === args.invocationRef
    && control.currentAttemptRef === args.attemptRef
    && control.currentEffectGeneration === args.effectGeneration
    && control.control.invocationRef === args.invocationRef
    && control.control.owner.principalRef === args.principalId
    && control.control.owner.callerRef === args.credentialId
    && (
      (canonical.state === 'reconciliation_required' && canonical.attemptRef === args.attemptRef)
      || canonical.state === 'retryable'
    )
}

function paymentIdentityMatches(payment: PaymentAttempt, args: ReconcileArgs): boolean {
  return payment.dispatchRef === args.invocationRef
    && payment.attemptRef === args.attemptRef
    && payment.effectGeneration === args.effectGeneration
    && payment.operationRef === args.operationRef
    && payment.inputDigest === args.inputDigest
    && payment.paymentIdentifier === args.paymentIdentifier
    && payment.challengeDigest === args.challengeDigest
    && payment.reservationRef === args.reservationRef
    && payment.authorizationDigest === args.authorizationDigest
    && payment.amountUnits === args.amount.units
    && payment.currency === args.amount.currency
    && payment.exponent === args.amount.exponent
}

function postSubmissionPaymentIdentityMatches(
  payment: PaymentAttempt,
  args: PostSubmissionReconcileArgs,
): boolean {
  return payment.dispatchRef === args.invocationRef
    && payment.attemptRef === args.attemptRef
    && payment.effectGeneration === args.effectGeneration
    && payment.operationRef === args.operationRef
    && payment.inputDigest === args.inputDigest
    && payment.paymentIdentifier === args.paymentIdentifier
    && payment.challengeDigest === args.challengeDigest
    && payment.reservationRef === args.reservationRef
    && payment.amountUnits === args.amount.units
    && payment.currency === args.amount.currency
    && payment.exponent === args.amount.exponent
}

function noSigningOrSubmissionMaterial(payment: PaymentAttempt): boolean {
  return [
    payment.paymentUnsignedMaterialJson,
    payment.paymentUnsignedMaterialDigest,
    payment.paymentSigningIdempotencyKey,
    payment.paymentSignatureDigest,
    payment.paymentPayer,
    payment.paymentNonce,
    payment.paymentAuthorizationValidBefore,
    payment.paymentAuthorizationExpiresAt,
    payment.paymentSigningClaimedAt,
    payment.submissionStartedAt,
  ].every((value) => value === undefined)
}

function pristinePaymentAttempt(payment: PaymentAttempt): boolean {
  return noSigningOrSubmissionMaterial(payment)
    && payment.state === 'reconciliation_required'
    && payment.settlementStatus === 'unknown'
    && payment.paymentResponseDigest === undefined
    && payment.reconciliationEvidenceRef === undefined
    && payment.reconciliationEvidenceDigest === undefined
    && payment.evidenceRefs.length === 0
}

function reconciledPaymentReplay(payment: PaymentAttempt, args: ReconcileArgs): boolean {
  return noSigningOrSubmissionMaterial(payment)
    && payment.state === 'observed'
    && payment.settlementStatus === 'not_settled'
    && payment.paymentResponseDigest === args.paymentResponseDigest
    && payment.reconciliationEvidenceRef === args.evidenceRef
    && payment.reconciliationEvidenceDigest === args.evidenceDigest
    && payment.transportObservationDigest === args.transportObservationDigest
    && payment.transportRequestDigest === args.transportRequestDigest
    && payment.paymentObservationDigest === args.paymentObservationDigest
    && payment.evidenceRefs.length === 0
}

function managedSigningIdentityMatches(
  payment: PaymentAttempt,
  args: ManagedSigningReconcileArgs,
): boolean {
  return payment.paymentUnsignedMaterialJson !== undefined
    && payment.paymentUnsignedMaterialDigest === args.paymentUnsignedMaterialDigest
    && payment.paymentSigningIdempotencyKey === args.paymentSigningIdempotencyKey
    && payment.paymentPayer === args.paymentPayer
    && payment.paymentNonce === args.paymentNonce
    && payment.paymentAuthorizationValidBefore === args.paymentAuthorizationValidBefore
    && payment.paymentAuthorizationExpiresAt === args.paymentAuthorizationExpiresAt
    && payment.paymentSigningClaimedAt === args.paymentSigningClaimedAt
    && payment.paymentSignatureDigest === undefined
    && payment.submissionStartedAt === undefined
    && payment.evidenceRefs.length === 0
    && args.replayKind === 'definitive_rejection'
    && managedSigningMoneyProofMatches(args)
}

function managedSigningMoneyProofMatches(args: ManagedSigningReconcileArgs): boolean {
  const proofDigest = canonicalDigest({
    format: 'ae.x402-managed-signing-expired-proof:v1',
    invocationRef: args.invocationRef,
    attemptRef: args.attemptRef,
    effectGeneration: args.effectGeneration,
    operationRef: args.operationRef,
    inputDigest: args.inputDigest,
    paymentIdentifier: args.paymentIdentifier,
    challengeDigest: args.challengeDigest,
    reservationRef: args.reservationRef,
    authorizationDigest: args.authorizationDigest,
    paymentUnsignedMaterialDigest: args.paymentUnsignedMaterialDigest,
    paymentSigningIdempotencyKey: args.paymentSigningIdempotencyKey,
    paymentPayer: args.paymentPayer,
    paymentNonce: args.paymentNonce,
    paymentAuthorizationExpiresAt: args.paymentAuthorizationExpiresAt,
    replayKind: args.replayKind,
    replayEvidenceDigest: args.replayEvidenceDigest,
    conclusion: 'signature_never_admitted_to_transport',
    resolution: 'not_released',
    observedAt: new Date(args.observedAt).toISOString(),
  })
  return args.observedAt === args.paymentAuthorizationExpiresAt
    && args.evidenceRef === `x402-managed-signing-recovery:${proofDigest}`
    && args.paymentResponseDigest === canonicalDigest({
      format: 'ae.x402-managed-signing-no-payment-response:v1',
      proofDigest,
    })
}

function pristineManagedSigningPayment(
  payment: PaymentAttempt,
  args: ManagedSigningReconcileArgs,
): boolean {
  return managedSigningIdentityMatches(payment, args)
    && payment.state === 'reconciliation_required'
    && payment.settlementStatus === 'unknown'
    && payment.paymentResponseDigest === undefined
    && payment.reconciliationEvidenceRef === undefined
    && payment.reconciliationEvidenceDigest === undefined
}

function reconciledManagedSigningReplay(
  payment: PaymentAttempt,
  args: ManagedSigningReconcileArgs,
): boolean {
  return managedSigningIdentityMatches(payment, args)
    && payment.state === 'observed'
    && payment.settlementStatus === 'not_settled'
    && payment.paymentResponseDigest === args.paymentResponseDigest
    && payment.reconciliationEvidenceRef === args.evidenceRef
    && payment.reconciliationEvidenceDigest === args.evidenceDigest
    && payment.transportObservationDigest === args.transportObservationDigest
    && payment.transportRequestDigest === args.transportRequestDigest
    && payment.paymentObservationDigest === args.paymentObservationDigest
}

async function reconcilePreSubmissionX402MoneyHandler(
  ctx: MutationCtx,
  args: ReconcileArgs,
): Promise<ReconcileResult> {
  if (!Number.isFinite(args.observedAt)) return { kind: 'not_reconciled' }
  const [invocation, control, payment] = await Promise.all([
    ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique(),
    ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique(),
    ctx.db.query('moneyX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', (query) => (
        query.eq('attemptRef', args.attemptRef).eq('effectGeneration', args.effectGeneration)
      ))
      .unique(),
  ])
  if (
    invocation === null
    || control === null
    || payment === null
    || !invocationIdentityMatches(invocation, args)
    || !controlIdentityMatches(control, args)
    || !paymentIdentityMatches(payment, args)
  ) return { kind: 'not_reconciled' }
  if (reconciledPaymentReplay(payment, args)) {
    const externalReplay = await reconcileExternalInvocationSpendHandler(
      ctx,
      externalReconciliationArgs(args),
    )
    return externalReplay.kind === 'accepted'
      ? { kind: 'replayed' }
      : { kind: 'not_reconciled' }
  }
  if (
    control.control.control.state !== 'reconciliation_required'
    || !pristinePaymentAttempt(payment)
  ) return { kind: 'not_reconciled' }

  const external = await reconcileExternalInvocationSpendHandler(
    ctx,
    externalReconciliationArgs(args),
  )
  if (external.kind !== 'accepted' || external.status !== 'released') {
    return { kind: 'not_reconciled' }
  }
  await ctx.db.patch(payment._id, {
    state: 'observed',
    settlementStatus: 'not_settled',
    paymentResponseDigest: args.paymentResponseDigest,
    reconciliationEvidenceRef: args.evidenceRef,
    reconciliationEvidenceDigest: args.evidenceDigest,
    transportObservationDigest: args.transportObservationDigest,
    transportRequestDigest: args.transportRequestDigest,
    paymentObservationDigest: args.paymentObservationDigest,
    observedAt: args.observedAt,
  })
  return external.replayed ? { kind: 'replayed' } : { kind: 'accepted' }
}

async function reconcileManagedSigningX402MoneyHandler(
  ctx: MutationCtx,
  args: ManagedSigningReconcileArgs,
): Promise<ReconcileResult> {
  if (!Number.isFinite(args.observedAt)) return { kind: 'not_reconciled' }
  const [invocation, control, payment] = await Promise.all([
    ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique(),
    ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique(),
    ctx.db.query('moneyX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', (query) => (
        query.eq('attemptRef', args.attemptRef).eq('effectGeneration', args.effectGeneration)
      ))
      .unique(),
  ])
  if (
    invocation === null
    || control === null
    || payment === null
    || !invocationIdentityMatches(invocation, args)
    || !controlIdentityMatches(control, args)
    || !paymentIdentityMatches(payment, args)
    || !managedSigningIdentityMatches(payment, args)
  ) return { kind: 'not_reconciled' }
  if (reconciledManagedSigningReplay(payment, args)) {
    const externalReplay = await reconcileExternalInvocationSpendHandler(
      ctx,
      externalReconciliationArgs(args),
    )
    return externalReplay.kind === 'accepted'
      ? { kind: 'replayed' }
      : { kind: 'not_reconciled' }
  }
  if (
    control.control.control.state !== 'reconciliation_required'
    || !pristineManagedSigningPayment(payment, args)
  ) return { kind: 'not_reconciled' }

  const external = await reconcileExternalInvocationSpendHandler(
    ctx,
    externalReconciliationArgs(args),
  )
  if (external.kind !== 'accepted' || external.status !== 'released') {
    return { kind: 'not_reconciled' }
  }
  await ctx.db.patch(payment._id, {
    state: 'observed',
    settlementStatus: 'not_settled',
    paymentResponseDigest: args.paymentResponseDigest,
    reconciliationEvidenceRef: args.evidenceRef,
    reconciliationEvidenceDigest: args.evidenceDigest,
    transportObservationDigest: args.transportObservationDigest,
    transportRequestDigest: args.transportRequestDigest,
    paymentObservationDigest: args.paymentObservationDigest,
    observedAt: args.observedAt,
  })
  return external.replayed ? { kind: 'replayed' } : { kind: 'accepted' }
}

async function reconcilePostSubmissionX402MoneyHandler(
  ctx: MutationCtx,
  args: PostSubmissionReconcileArgs,
): Promise<ReconcileResult> {
  if (!Number.isFinite(args.observedAt)) return { kind: 'not_reconciled' }
  const [invocation, control, payment, externalRow] = await Promise.all([
    ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique(),
    ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique(),
    ctx.db.query('moneyX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', (query) => (
        query.eq('attemptRef', args.attemptRef).eq('effectGeneration', args.effectGeneration)
      ))
      .unique(),
    ctx.db.query('moneyExternalSpendReservations')
      .withIndex('by_reservationRef', (query) => query.eq('reservationRef', args.reservationRef))
      .unique(),
  ])
  const mismatch = invocation === null
    ? 'invocation_missing'
    : control === null
      ? 'control_missing'
      : payment === null
        ? 'payment_missing'
        : !invocationIdentityMatches(invocation, args)
          ? 'invocation_identity'
          : !controlIdentityMatches(control, args)
            ? 'control_identity'
            : !postSubmissionPaymentIdentityMatches(payment, args)
              ? 'payment_identity'
              : payment.transportObservationDigest !== args.transportObservationDigest
                ? 'transport_observation_digest'
                : payment.transportRequestDigest !== args.transportRequestDigest
                  ? 'transport_request_digest'
                  : payment.paymentObservationDigest !== args.paymentObservationDigest
                    ? 'payment_observation_digest'
                    : payment.paymentResponseDigest !== args.paymentResponseDigest
                      ? 'payment_response_digest'
                      : undefined
  if (mismatch !== undefined) {
    console.warn('x402_post_submission_money_reconciliation', {
      invocationRef: args.invocationRef,
      attemptRef: args.attemptRef,
      mismatch,
    })
    return { kind: 'not_reconciled' }
  }
  if (invocation === null || control === null || payment === null) {
    return { kind: 'not_reconciled' }
  }

  const replay = payment.state === 'observed'
    && payment.settlementStatus === args.settlementStatus
    && payment.reconciliationEvidenceRef === args.evidenceRef
    && payment.reconciliationEvidenceDigest === args.evidenceDigest
  const pending = payment.state === 'reconciliation_required'
    && payment.settlementStatus === 'unknown'
    && payment.reconciliationEvidenceRef === undefined
    && payment.reconciliationEvidenceDigest === undefined
  if (!replay && !pending) {
    console.warn('x402_post_submission_money_reconciliation', {
      invocationRef: args.invocationRef,
      attemptRef: args.attemptRef,
      mismatch: 'payment_state',
    })
    return { kind: 'not_reconciled' }
  }

  const external = await reconcileExternalInvocationSpendHandler(
    ctx,
    postSubmissionExternalReconciliationArgs(args),
  )
  const expectedExternalStatus = args.settlementStatus === 'settled' ? 'settled' : 'released'
  if (external.kind !== 'accepted' || external.status !== expectedExternalStatus) {
    console.warn('x402_post_submission_money_reconciliation', {
      invocationRef: args.invocationRef,
      attemptRef: args.attemptRef,
      mismatch: 'external_reconciliation',
      external: external.kind,
      ...(external.kind === 'accepted' ? { status: external.status } : { code: external.code }),
      externalState: externalRow?.state,
      custodyFields: externalRow === null
        ? 'missing'
        : [
            externalRow.custodyRef,
            externalRow.custodyGeneration,
            externalRow.custodyDailyMaximumUnits,
            externalRow.custodyBudgetPolicyRef,
            externalRow.custodyBudgetDayStart,
          ].filter((value) => value !== undefined).length,
    })
    return { kind: 'not_reconciled' }
  }
  if (!replay) {
    await ctx.db.patch(payment._id, {
      state: 'observed',
      settlementStatus: args.settlementStatus,
      reconciliationEvidenceRef: args.evidenceRef,
      reconciliationEvidenceDigest: args.evidenceDigest,
      observedAt: args.observedAt,
    })
  }
  return replay || external.replayed ? { kind: 'replayed' } : { kind: 'accepted' }
}

export const reconcilePreSubmissionX402Money = internalMutation({
  args: reconcilePreSubmissionX402MoneyArgs,
  returns: reconcilePreSubmissionX402MoneyResult,
  handler: reconcilePreSubmissionX402MoneyHandler,
})

export const reconcileManagedSigningX402Money = internalMutation({
  args: reconcileManagedSigningX402MoneyArgs,
  returns: reconcilePreSubmissionX402MoneyResult,
  handler: reconcileManagedSigningX402MoneyHandler,
})

/**
 * Reconciles a seller-canary transfer as one durable money operation after the
 * recovery action has independently verified the confirmed chain receipt. It
 * deliberately binds to the original invocation/control/attempt snapshots
 * instead of requiring the now-expired authority to authorize a new spend.
 */
export const reconcilePostSubmissionX402Money = internalMutation({
  args: reconcilePostSubmissionX402MoneyArgs,
  returns: reconcilePreSubmissionX402MoneyResult,
  handler: reconcilePostSubmissionX402MoneyHandler,
})
