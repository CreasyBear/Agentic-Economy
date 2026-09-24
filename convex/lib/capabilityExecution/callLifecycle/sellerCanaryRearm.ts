import { type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { marketDispatchWorkpool } from '../../../marketDispatchWorkpool'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { callAuthorityValue } from '@/modules/capability-execution/convex'
import type { SellerOnboardingCanaryExecutionEnvelope } from '@/modules/capability-supply/public'
import type { DispatchResult } from './callIdentity'
import { knownUnpaidSellerCanaryRefusal } from './sellerCanaryKnownUnpaid'
import {
  SELLER_CANARY_ROUTE_SIGNING_UNAVAILABLE_NEXT_ACTION,
  safeBeforeReleaseSellerCanaryRefusal,
} from './sellerCanarySafeBeforeRelease'

const OPERATION_INVOKE_RETRY_AFTER_MS = 1_000

type CallRow = Doc<'capabilityCalls'>
type PersistedOperationAuthority = Infer<typeof callAuthorityValue>

type SellerCanaryRearmInput = Readonly<{
  envelope: SellerOnboardingCanaryExecutionEnvelope
  authority: PersistedOperationAuthority
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  toolJson: string
  inputJson: string
  inputDigest: string
  requestDigest: string
  idempotencyKey: string
  now: number
}>

function refreshedSellerCanaryIdentityMatches(
  row: CallRow,
  canary: SellerOnboardingCanaryExecutionEnvelope,
  refreshed: SellerCanaryRearmInput,
): boolean {
  return [
    refreshed.envelope.canaryRef === canary.canaryRef,
    refreshed.envelope.callRef === row.callRef,
    refreshed.envelope.toolRef === row.toolRef,
    refreshed.envelope.inputDigest === row.inputDigest,
    refreshed.envelope.idempotencyKey === row.idempotencyKey,
    refreshed.envelope.funding.principalId === row.principalId,
    refreshed.envelope.funding.ownerId === row.ownerId,
    refreshed.envelope.funding.credentialId === row.credentialId,
    refreshed.envelope.funding.applicationRef === row.applicationRef,
    refreshed.envelope.funding.grantRef === row.grantRef,
    refreshed.inputDigest === row.inputDigest,
    refreshed.idempotencyKey === row.idempotencyKey,
    refreshed.envelope.expiresAt > refreshed.now,
  ].every(Boolean)
}

/**
 * Re-arm one seller canary only when the prior worker stopped before claim and
 * every canonical effect ledger is empty. The enqueue, audit insert, and row
 * generation replacement share one Convex mutation transaction.
 */
export async function enqueueKnownUnpaidSellerCanaryRearm(
  ctx: MutationCtx,
  row: CallRow,
  refreshed: SellerCanaryRearmInput,
): Promise<DispatchResult> {
  const canary = row.sellerOnboardingCanary
  const refusalCode = await knownUnpaidSellerCanaryRefusal(ctx, row)
  if (canary === undefined || refusalCode === undefined || row.workId === undefined) {
    return { kind: 'refused' }
  }
  if (!refreshedSellerCanaryIdentityMatches(row, canary, refreshed)) return { kind: 'refused' }

  const priorWorkId = row.workId
  const priorResultDigest = canonicalDigest(row.result as never)
  const refusalProvenance = {
    phase: 'pre_claim' as const,
    source: refusalCode === 'provider_refused'
      ? 'legacy_exact_provider_approval' as const
      : 'known_preclaim_code' as const,
    ...(row.result?.kind !== 'refused' || row.result.nextAction === undefined
      ? {}
      : { nextAction: row.result.nextAction }),
  }
  const workId = await marketDispatchWorkpool.enqueueAction(
    ctx,
    internal.capabilityCallWorker.run,
    { callRef: row.callRef },
    {
      retry: true,
      onComplete: internal.capabilityCalls.completeWork,
      context: { callRef: row.callRef },
    },
  )
  const auditMaterial = {
    format: 'seller-onboarding-canary-rearm-audit:v1',
    canaryRef: canary.canaryRef,
    callRef: row.callRef,
    priorWorkId,
    rearmedWorkId: workId,
    refusalCode,
    priorResultDigest,
    refusalProvenance,
  } as const
  await ctx.db.insert('sellerOnboardingCanaryRearmAudits', {
    auditRef: `seller-canary-rearm:${canonicalDigest(auditMaterial as never).slice('sha256:'.length)}`,
    canaryRef: canary.canaryRef,
    callRef: row.callRef,
    priorWorkId,
    rearmedWorkId: workId,
    refusalCode,
    priorResultDigest,
    refusalProvenance,
    rearmedEnvelopeDigest: canonicalDigest(refreshed.envelope as never),
    rearmedAuthorityDigest: canonicalDigest(refreshed.authority as never),
    rearmedAt: refreshed.now,
  })
  await ctx.db.patch(row._id, {
    sellerOnboardingCanary: structuredClone(refreshed.envelope),
    grantGeneration: refreshed.grantGeneration,
    policyDigest: refreshed.policyDigest,
    grantExpiresAt: refreshed.grantExpiresAt,
    toolJson: refreshed.toolJson,
    inputJson: refreshed.inputJson,
    inputDigest: refreshed.inputDigest,
    requestDigest: refreshed.requestDigest,
    idempotencyKey: refreshed.idempotencyKey,
    authority: structuredClone(refreshed.authority),
    state: 'pending',
    workId,
    attemptRef: undefined,
    dispatchState: 'enqueued',
    result: {
      kind: 'pending',
      callRef: row.callRef,
      toolRef: row.toolRef,
      retryAfterMs: OPERATION_INVOKE_RETRY_AFTER_MS,
    },
    usage: undefined,
    evidenceHash: undefined,
    reconciliation: undefined,
    updatedAt: refreshed.now,
  })
  return { kind: 'enqueued', workId }
}

/**
 * Resume an exact seller canary only after its canonical attempt proves a
 * safe-before-release failure and every economic/effect ledger is empty.
 * Prior control and attempt history remain intact so the worker claims the
 * next attempt/effect generation.
 */
export async function enqueueSafeBeforeReleaseSellerCanaryResume(
  ctx: MutationCtx,
  row: CallRow,
  refreshed: SellerCanaryRearmInput,
): Promise<DispatchResult> {
  const canary = row.sellerOnboardingCanary
  const proof = await safeBeforeReleaseSellerCanaryRefusal(ctx, row)
  if (canary === undefined || proof === undefined || row.workId === undefined) {
    return { kind: 'refused' }
  }
  if (!refreshedSellerCanaryIdentityMatches(row, canary, refreshed)) return { kind: 'refused' }

  const priorWorkId = row.workId
  const priorResultDigest = canonicalDigest(row.result as never)
  const workId = await marketDispatchWorkpool.enqueueAction(
    ctx,
    internal.capabilityCallWorker.run,
    { callRef: row.callRef },
    {
      retry: true,
      onComplete: internal.capabilityCalls.completeWork,
      context: { callRef: row.callRef },
    },
  )
  const commonRefusalProvenance = {
    phase: 'safe_before_release' as const,
    priorAttemptRef: proof.attemptRef,
    priorAttemptNumber: proof.attemptNumber,
    priorEffectGeneration: proof.effectGeneration,
    controlDigest: proof.controlDigest,
    attemptDigest: proof.attemptDigest,
  }
  const refusalProvenance = {
    ...commonRefusalProvenance,
    source: 'canonical_retryable_attempt' as const,
    nextAction: SELLER_CANARY_ROUTE_SIGNING_UNAVAILABLE_NEXT_ACTION,
  }
  const auditMaterial = {
    format: 'seller-onboarding-canary-rearm-audit:v1',
    canaryRef: canary.canaryRef,
    callRef: row.callRef,
    priorWorkId,
    rearmedWorkId: workId,
    refusalCode: proof.refusalCode,
    priorResultDigest,
    refusalProvenance,
  } as const
  await ctx.db.insert('sellerOnboardingCanaryRearmAudits', {
    auditRef: `seller-canary-rearm:${canonicalDigest(auditMaterial as never).slice('sha256:'.length)}`,
    canaryRef: canary.canaryRef,
    callRef: row.callRef,
    priorWorkId,
    rearmedWorkId: workId,
    refusalCode: proof.refusalCode,
    priorResultDigest,
    refusalProvenance,
    rearmedEnvelopeDigest: canonicalDigest(refreshed.envelope as never),
    rearmedAuthorityDigest: canonicalDigest(refreshed.authority as never),
    rearmedAt: refreshed.now,
  })
  await ctx.db.patch(row._id, {
    sellerOnboardingCanary: structuredClone(refreshed.envelope),
    grantGeneration: refreshed.grantGeneration,
    policyDigest: refreshed.policyDigest,
    grantExpiresAt: refreshed.grantExpiresAt,
    toolJson: refreshed.toolJson,
    inputJson: refreshed.inputJson,
    inputDigest: refreshed.inputDigest,
    requestDigest: refreshed.requestDigest,
    idempotencyKey: refreshed.idempotencyKey,
    authority: structuredClone(refreshed.authority),
    state: 'pending',
    workId,
    // Preserve attemptRef and the canonical control/attempt rows. The worker
    // uses that exact retryable snapshot to claim attempt N+1.
    dispatchState: 'enqueued',
    result: {
      kind: 'pending',
      callRef: row.callRef,
      toolRef: row.toolRef,
      retryAfterMs: OPERATION_INVOKE_RETRY_AFTER_MS,
    },
    usage: undefined,
    evidenceHash: undefined,
    reconciliation: undefined,
    updatedAt: refreshed.now,
  })
  return { kind: 'enqueued', workId }
}

/**
 * Re-arm only the exact workless state produced by successful recovery.
 * Enqueue and the new workId patch occur in this mutation transaction, so a
 * concurrent replay observes one work generation rather than creating two.
 */
export async function enqueueRecoveredSellerCanaryReplay(
  ctx: MutationCtx,
  row: CallRow,
  refreshed: SellerCanaryRearmInput,
): Promise<DispatchResult> {
  const canary = row.sellerOnboardingCanary
  if (canary === undefined) return { kind: 'refused' }
  const retryableWorklessIdentity = [
    row.state === 'pending',
    row.result === undefined,
    row.workId === undefined,
    row.attemptRef === undefined,
    row.dispatchState === undefined,
    row.authority !== undefined,
    canary.callRef === row.callRef,
    canary.toolRef === row.toolRef,
    canary.inputDigest === row.inputDigest,
    canary.idempotencyKey === row.idempotencyKey,
  ].every(Boolean)
  if (!retryableWorklessIdentity || row.authority === undefined) return { kind: 'refused' }
  if (!refreshedSellerCanaryIdentityMatches(row, canary, refreshed)) return { kind: 'refused' }

  const workId = await marketDispatchWorkpool.enqueueAction(
    ctx,
    internal.capabilityCallWorker.run,
    { callRef: row.callRef },
    {
      retry: true,
      onComplete: internal.capabilityCalls.completeWork,
      context: { callRef: row.callRef },
    },
  )
  await ctx.db.patch(row._id, {
    sellerOnboardingCanary: structuredClone(refreshed.envelope),
    grantGeneration: refreshed.grantGeneration,
    policyDigest: refreshed.policyDigest,
    grantExpiresAt: refreshed.grantExpiresAt,
    toolJson: refreshed.toolJson,
    inputJson: refreshed.inputJson,
    inputDigest: refreshed.inputDigest,
    requestDigest: refreshed.requestDigest,
    idempotencyKey: refreshed.idempotencyKey,
    authority: structuredClone(refreshed.authority),
    workId,
    dispatchState: 'enqueued',
    result: {
      kind: 'pending',
      callRef: row.callRef,
      toolRef: row.toolRef,
      retryAfterMs: OPERATION_INVOKE_RETRY_AFTER_MS,
    },
    updatedAt: refreshed.now,
  })
  return { kind: 'enqueued', workId }
}
