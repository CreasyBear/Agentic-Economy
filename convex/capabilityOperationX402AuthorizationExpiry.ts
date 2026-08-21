import { v, type Infer, type ObjectType } from 'convex/values'

import { reconciliationValue } from '@/modules/capability-execution/internal/convex-schema'

import type { Doc } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'

const X402_AUTHORIZATION_EXPIRED_EVIDENCE_SOURCE = 'x402_authorization_expired:provider_transaction_or_chain_nonce_evidence_required' as const

const queueExpiredX402AuthorizationArgs = {
  invocationRef: v.string(),
  principalId: v.string(),
  credentialId: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  reservationRef: v.optional(v.string()),
  nativeTransition: v.union(v.literal('applied'), v.literal('replayable'), v.literal('manual_review')),
  controlInvocationVersion: v.number(),
  observedControlState: v.string(),
  now: v.number(),
}

const queueExpiredX402AuthorizationResult = v.union(
  v.object({
    kind: v.literal('queued'),
    disposition: v.literal('automatic'),
    invocationRef: v.string(),
    operationRef: v.string(),
    evidence: reconciliationValue,
  }),
  v.object({
    kind: v.literal('manual_review'),
    disposition: v.literal('manual_review'),
    invocationRef: v.string(),
    operationRef: v.string(),
    evidence: reconciliationValue,
  }),
  v.object({ kind: v.literal('not_queued') }),
)

type QueueExpiredX402AuthorizationArgs = ObjectType<typeof queueExpiredX402AuthorizationArgs>
type InvocationRow = Doc<'capabilityOperationInvocations'>
type PaymentAttemptRow = Doc<'moneyX402PaymentAttempts'>

function hasSubmissionEvidence(row: PaymentAttemptRow): boolean {
  return row.submissionStartedAt !== undefined
    || row.observedAt !== undefined
    || row.transportObservationDigest !== undefined
    || row.transportRequestDigest !== undefined
    || row.paymentObservationDigest !== undefined
    || row.settlementStatus !== undefined
    || row.paymentResponseDigest !== undefined
    || row.reconciliationEvidenceRef !== undefined
    || row.reconciliationEvidenceDigest !== undefined
    || row.evidenceRefs.length > 0
}

function outerProjectionMatches(
  row: InvocationRow,
  args: QueueExpiredX402AuthorizationArgs,
): boolean {
  const result = row.result
  return row.state === 'reconciliation_required'
    && row.dispatchState === 'reconciliation_required'
    && row.attemptRef === args.attemptRef
    && result?.kind === 'reconciliation_required'
    && result.invocationRef === args.invocationRef
    && result.operationRef === row.operationRef
    && result.evidence.attemptRef === args.attemptRef
    && result.evidence.effectGeneration === args.effectGeneration
    && result.evidence.evidenceSource === X402_AUTHORIZATION_EXPIRED_EVIDENCE_SOURCE
}

async function queueExpiredX402AuthorizationHandler(
  ctx: MutationCtx,
  args: QueueExpiredX402AuthorizationArgs,
): Promise<Infer<typeof queueExpiredX402AuthorizationResult>> {
  if (
    !Number.isFinite(args.now)
    || args.now < 0
    || !Number.isSafeInteger(args.effectGeneration)
    || args.effectGeneration < 1
    || args.invocationRef.trim().length === 0
    || args.principalId.trim().length === 0
    || args.credentialId.trim().length === 0
    || args.attemptRef.trim().length === 0
    || args.custodyRef.trim().length === 0
    || args.authorizationDigest.trim().length === 0
  ) return { kind: 'not_queued' }

  const invocation = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
    .unique()
  const payment = await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_attemptRef_and_effectGeneration', (query) => (
      query.eq('attemptRef', args.attemptRef).eq('effectGeneration', args.effectGeneration)
    ))
    .unique()
  if (invocation === null || payment === null) return { kind: 'not_queued' }

  const actionControl = await ctx.db.query('actionInvocationControls')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
    .unique()
  if (
    actionControl === null
    || actionControl.invocationRef !== args.invocationRef
    || actionControl.invocationVersion !== args.controlInvocationVersion
    || actionControl.currentAttemptRef !== args.attemptRef
    || actionControl.currentEffectGeneration !== args.effectGeneration
    || actionControl.control.invocationRef !== args.invocationRef
    || actionControl.control.invocationVersion !== args.controlInvocationVersion
  ) return { kind: 'not_queued' }
  const actionControlState = actionControl.control.control.state
  if (
    (args.nativeTransition === 'applied' || args.nativeTransition === 'replayable')
      ? actionControlState !== 'reconciliation_required'
      : actionControlState !== args.observedControlState
  ) return { kind: 'not_queued' }

  if (
    invocation.principalId !== args.principalId
    || invocation.credentialId !== args.credentialId
    || invocation.attemptRef !== args.attemptRef
    || payment.dispatchRef !== args.invocationRef
    || payment.attemptRef !== args.attemptRef
    || payment.effectGeneration !== args.effectGeneration
    || payment.custodyRef !== args.custodyRef
    || payment.authorizationDigest !== args.authorizationDigest
    || (payment.reservationRef ?? undefined) !== args.reservationRef
    || (payment.operationRef !== undefined && payment.operationRef !== invocation.operationRef)
    || (payment.inputDigest !== undefined && payment.inputDigest !== invocation.inputDigest)
  ) return { kind: 'not_queued' }
  if (invocation.state !== 'pending' && invocation.state !== 'reconciliation_required') {
    return { kind: 'not_queued' }
  }
  if (
    invocation.state === 'reconciliation_required'
    && invocation.result !== undefined
    && invocation.result.kind === 'reconciliation_required'
    && (
      invocation.result.evidence.attemptRef !== args.attemptRef
      || invocation.result.evidence.effectGeneration !== args.effectGeneration
    )
  ) return { kind: 'not_queued' }

  if (payment.state === 'reconciliation_required') {
    if (
      payment.paymentUnsignedMaterialJson !== undefined
      || hasSubmissionEvidence(payment)
      || !outerProjectionMatches(invocation, args)
    ) return { kind: 'not_queued' }
    const disposition = invocation.reconciliation?.disposition
    if (disposition === 'manual_review' && invocation.result?.kind === 'reconciliation_required') {
      return {
        kind: 'manual_review',
        disposition,
        invocationRef: invocation.result.invocationRef,
        operationRef: invocation.result.operationRef,
        evidence: invocation.result.evidence,
      }
    }
    if (disposition === 'automatic' && invocation.result?.kind === 'reconciliation_required') {
      return {
        kind: 'queued',
        disposition,
        invocationRef: invocation.result.invocationRef,
        operationRef: invocation.result.operationRef,
        evidence: invocation.result.evidence,
      }
    }
    return { kind: 'not_queued' }
  }

  if (invocation.state !== 'pending') return { kind: 'not_queued' }

  if (
    payment.state !== 'prepared'
    || payment.paymentAuthorizationExpiresAt === undefined
    || payment.paymentAuthorizationExpiresAt > args.now
    || hasSubmissionEvidence(payment)
  ) return { kind: 'not_queued' }

  const disposition: 'automatic' | 'manual_review' = args.nativeTransition === 'manual_review' ? 'manual_review' : 'automatic'
  const result = {
    kind: 'reconciliation_required' as const,
    invocationRef: invocation.invocationRef,
    operationRef: invocation.operationRef,
    evidence: {
      attemptRef: args.attemptRef,
      effectGeneration: args.effectGeneration,
      requiredAt: new Date(args.now).toISOString(),
      retry: 'reconcile_before_retry' as const,
      evidenceSource: X402_AUTHORIZATION_EXPIRED_EVIDENCE_SOURCE,
    },
  }
  const reconciliation = {
    attemptCount: 0,
    nextAttemptAt: args.now,
    disposition,
    reason: 'authorization_expired' as const,
  }

  // Convex mutations commit all database writes atomically, including writes
  // spanning the operation and payment-attempt tables.
  await ctx.db.patch(payment._id, {
    paymentUnsignedMaterialJson: undefined,
    state: 'reconciliation_required',
  })
  await ctx.db.patch(invocation._id, {
    state: 'reconciliation_required',
    result,
    attemptRef: args.attemptRef,
    dispatchState: 'reconciliation_required',
    reconciliation,
    updatedAt: args.now,
  })
  return disposition === 'manual_review'
    ? { kind: 'manual_review', disposition, invocationRef: result.invocationRef, operationRef: result.operationRef, evidence: result.evidence }
    : { kind: 'queued', disposition, invocationRef: result.invocationRef, operationRef: result.operationRef, evidence: result.evidence }
}

export const queueExpiredX402Authorization = internalMutation({
  args: queueExpiredX402AuthorizationArgs,
  returns: queueExpiredX402AuthorizationResult,
  handler: queueExpiredX402AuthorizationHandler,
})
