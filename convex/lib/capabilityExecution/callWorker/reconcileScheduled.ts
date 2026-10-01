"use node";

import * as crypto from 'node:crypto'
import { v, type Infer } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  expireAuthorizationRecovery,
  readRecoveryStatus,
} from '@/modules/capability-execution/call-runtime'
import { recoveryResultValue } from '@/modules/capability-execution/convex'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import { bindWorkloadCronActionContext } from '../../platform/workloadCron/consequence'
import {
  parseWorkloadCronSnapshot,
  workloadCronSnapshotValue,
  type WorkloadCronSnapshot,
} from '../../platform/workloadCron/context'
import { reconcileCallWorkloadAuthority } from './authority'
import { reconcilePreClaimRefundHandler } from './preClaimRefund'

export const reconcileScheduledArgs = { workload: workloadCronSnapshotValue }
export const reconcileScheduledResult = v.object({
  selected: v.number(),
  claimed: v.number(),
  completed: v.number(),
  retried: v.number(),
  manualReview: v.number(),
  expiredSelected: v.number(),
  expiredQueued: v.number(),
  expiredManualReview: v.number(),
})

const RECONCILIATION_SWEEP_LIMIT = 25
const RECONCILIATION_SWEEP_DEADLINE_MS = 45_000

type RecoveryResult = Infer<typeof recoveryResultValue>

function isTerminalRecoveryResult(result: RecoveryResult): boolean {
  if (result.kind === 'refused') return !result.retryable
  return result.kind === 'found'
    && (result.state === 'terminal' || result.state === 'cancelled' || result.state === 'invalidated')
}

export async function reconcileScheduledHandler(
  ctx: ActionCtx,
  args: { workload: WorkloadCronSnapshot },
): Promise<Infer<typeof reconcileScheduledResult>> {
  const workload: WorkloadCronSnapshot = await ctx.runQuery(internal.workloadCron.reconcile, {
    name: 'reconcile due facilitator invocations',
    snapshot: parseWorkloadCronSnapshot(args.workload),
  })
  const startedAt = Date.now()
  const deadlineAt = startedAt + RECONCILIATION_SWEEP_DEADLINE_MS
  const leaseOwner = `reconciliation-sweep:${crypto.randomUUID()}`
  try {
    await ctx.runMutation(internal.capabilityCalls.reconcileFinishedDispatches, {
      workload, cursor: null, createdBefore: Math.max(0, startedAt - 60_000),
    })
  } catch (cause) {
    // A failed completion repair must not block already admitted recovery/refunds.
    degradeBackend(cause, undefined, { site: 'reconcileFinishedDispatches', reason: 'source_unavailable' })
  }
  let expiredCandidates: Array<{
    dispatchRef: string
    attemptRef: string
    effectGeneration: number
    custodyRef: string
    authorizationDigest: string
    reservationRef?: string
    paymentAuthorizationExpiresAt: number
  }> = []
  try {
    expiredCandidates = await ctx.runQuery(
      internal.moneyX402PaymentAttempts.listExpiredPreparedX402PaymentAttempts,
      { now: startedAt, limit: RECONCILIATION_SWEEP_LIMIT },
    )
  } catch (cause) {
    expiredCandidates = degradeBackend(cause, [], { site: 'reconcileScheduled', reason: 'source_unavailable' })
  }
  const expiredSelected = Math.min(expiredCandidates.length, RECONCILIATION_SWEEP_LIMIT)
  let expiredQueued = 0
  let expiredManualReview = 0
  for (const candidate of expiredCandidates) {
    if (Date.now() >= deadlineAt) break
    let ownerRecovery: { principalId: string; credentialId: string } | null
    try {
      ownerRecovery = await ctx.runQuery(
        internal.capabilityCalls.readOwnerRecovery,
        { callRef: candidate.dispatchRef },
      )
    } catch (cause) {
      degradeBackend(cause, undefined, { site: 'readOwnerRecovery', reason: 'source_unavailable' })
      continue
    }
    if (ownerRecovery === null) continue
    try {
      const invocationContext = bindWorkloadCronActionContext(ctx, {
        name: 'reconcile due facilitator invocations',
        snapshot: workload,
        resourceInvocationRef: candidate.dispatchRef,
      })
      if (await reconcileCallWorkloadAuthority(ctx, candidate.dispatchRef, ownerRecovery) === null) continue
      const result = await expireAuthorizationRecovery(invocationContext, {
        callRef: candidate.dispatchRef,
        principalId: ownerRecovery.principalId,
        credentialId: ownerRecovery.credentialId,
      })
      if (result.kind !== 'reconciliation_required' || !('expiryDisposition' in result)) continue
      if (result.expiryDisposition === 'manual_review') expiredManualReview += 1
      else expiredQueued += 1
    } catch (cause) {
      // A failed expiry candidate must not prevent the remaining candidates from running.
      degradeBackend(cause, undefined, { site: 'expireAuthorizationRecovery', reason: 'source_unavailable' })
    }
  }
  const remainingCapacity = Math.max(0, RECONCILIATION_SWEEP_LIMIT - expiredSelected)
  const candidates = remainingCapacity === 0 || Date.now() >= deadlineAt
    ? []
    : await ctx.runQuery(
        internal.capabilityCalls.listDueAutomaticReconciliationCandidates,
        { now: startedAt, limit: remainingCapacity },
      )
  let claimed = 0
  let completed = 0
  let retried = 0
  let manualReview = 0
  for (const candidate of candidates) {
    if (Date.now() >= deadlineAt) break
    let claim: { kind: string; principalId?: string; credentialId?: string }
    const invocationContext = bindWorkloadCronActionContext(ctx, {
      name: 'reconcile due facilitator invocations',
      snapshot: workload,
      resourceInvocationRef: candidate.callRef,
    })
    if (candidate.preClaimRefund === true) {
      try {
        const refund = await reconcilePreClaimRefundHandler(invocationContext, { callRef: candidate.callRef })
        if (refund.kind !== 'not_claimed') claimed += 1
        if (refund.kind === 'settled') completed += 1
        else if (refund.kind === 'retried') retried += 1
        else if (refund.kind === 'manual_review') manualReview += 1
      } catch (cause) {
        // The persisted lease and refund intent survive interruption.
        degradeBackend(cause, undefined, { site: 'reconcilePreClaimRefund', reason: 'source_unavailable' })
      }
      continue
    }
    if (await reconcileCallWorkloadAuthority(ctx, candidate.callRef) === null) continue
    try {
      claim = await invocationContext.runMutation(
        internal.capabilityCalls.claimAutomaticReconciliationCandidate,
        { callRef: candidate.callRef, leaseOwner, now: Date.now() },
      )
    } catch (cause) {
      degradeBackend(cause, undefined, { site: 'claimAutomaticReconciliationCandidate', reason: 'source_unavailable' })
      continue
    }
    if (claim.kind !== 'claimed' || claim.principalId === undefined || claim.credentialId === undefined) continue
    claimed += 1
    let outcome: 'success' | 'terminal' | 'reconciliation_required' | 'error'
    let reason: 'recovery_failed' | undefined
    if (Date.now() >= deadlineAt) {
      outcome = 'error'
      reason = 'recovery_failed'
    } else {
      try {
        const result = await readRecoveryStatus(invocationContext, {
          callRef: candidate.callRef,
          principalId: claim.principalId,
          credentialId: claim.credentialId,
        })
        outcome = isTerminalRecoveryResult(result) ? 'terminal' : 'reconciliation_required'
      } catch (cause) {
        degradeBackend(cause, undefined, { site: 'readRecoveryStatus', reason: 'source_unavailable' })
        outcome = 'error'
        reason = 'recovery_failed'
      }
    }
    try {
      const finished = await invocationContext.runMutation(
        internal.capabilityCalls.finishAutomaticReconciliation,
        {
          callRef: candidate.callRef,
          leaseOwner,
          now: Date.now(),
          outcome,
          ...(reason === undefined ? {} : { reason }),
        },
      )
      if (finished.kind === 'completed') completed += 1
      else if (finished.kind === 'retried') retried += 1
      else if (finished.kind === 'manual_review') manualReview += 1
    } catch (cause) {
      // A failed finish must not prevent the remaining candidates from running.
      degradeBackend(cause, undefined, { site: 'finishAutomaticReconciliation', reason: 'source_unavailable' })
    }
  }
  return {
    selected: Math.min(candidates.length, remainingCapacity),
    claimed: Math.min(claimed, remainingCapacity),
    completed: Math.min(completed, remainingCapacity),
    retried: Math.min(retried, remainingCapacity),
    manualReview: Math.min(manualReview, remainingCapacity),
    expiredSelected,
    expiredQueued: Math.min(expiredQueued, expiredSelected),
    expiredManualReview: Math.min(expiredManualReview, expiredSelected),
  }
}
