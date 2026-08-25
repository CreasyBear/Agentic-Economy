"use node";

import * as crypto from 'node:crypto'
import { v, type Infer } from 'convex/values'
import { recoveryResultValue } from '@/modules/capability-execution/convex'
import type { WorkerResult } from '@/modules/capability-execution/invocation-worker/charge'
import { prepareInvocationRun } from '@/modules/capability-execution/invocation-worker/runPreparation'
import { releaseInvocationRun } from '@/modules/capability-execution/invocation-worker/runRelease'
import {
  recoverCapabilityOperationInvocation,
  recoveryArgs,
} from '@/modules/capability-execution/invocation-worker/recover'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import {
  bindWorkloadCronActionContext,
  parseWorkloadCronSnapshot,
  workloadCronSnapshotValue,
  type WorkloadCronSnapshot,
} from './workloadCron'

export {
  operationInvocationAttemptIdentityDigest,
  operationInvocationAttemptIdentityMaterial,
  validateOperationInvokeAuthority,
} from './capabilityOperationInvocationIdentity'
export {
  projectOuterResult,
  projectPureOperationInvocationStatus,
} from './capabilityOperationInvocationProjection'

const workerResult = v.union(
  v.object({ kind: v.literal('recorded') }),
  v.object({ kind: v.literal('none') }),
)
const reconciliationScheduledResult = v.object({
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

export const run = internalAction({
  args: { invocationRef: v.string() },
  returns: workerResult,
  handler: async (ctx, args): Promise<WorkerResult> => {
    const prepared = await prepareInvocationRun(ctx, args)
    if (prepared.kind !== 'prepared') return prepared
    return await releaseInvocationRun(ctx, prepared)
  },
})

export const recover = internalAction({
  args: recoveryArgs,
  returns: recoveryResultValue,
  handler: async (ctx, args): Promise<RecoveryResult> => {
    const result = await recoverCapabilityOperationInvocation(ctx, args)
    if ('expiryDisposition' in result) {
      return {
        kind: 'reconciliation_required',
        invocationRef: result.invocationRef,
        operationRef: result.operationRef,
        evidence: result.evidence,
      }
    }
    return result
  },
})

export const reconcileScheduled = internalAction({
  args: { workload: workloadCronSnapshotValue },
  returns: reconciliationScheduledResult,
  handler: async (ctx, args): Promise<Infer<typeof reconciliationScheduledResult>> => {
    const workload: WorkloadCronSnapshot = await ctx.runQuery(internal.workloadCron.reconcile, {
      name: 'reconcile due facilitator invocations',
      snapshot: parseWorkloadCronSnapshot(args.workload),
    })
    const startedAt = Date.now()
    const deadlineAt = startedAt + RECONCILIATION_SWEEP_DEADLINE_MS
    const leaseOwner = `reconciliation-sweep:${crypto.randomUUID()}`
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
    } catch {
      expiredCandidates = []
    }
    const expiredSelected = Math.min(expiredCandidates.length, RECONCILIATION_SWEEP_LIMIT)
    let expiredQueued = 0
    let expiredManualReview = 0
    for (const candidate of expiredCandidates) {
      if (Date.now() >= deadlineAt) break
      let ownerRecovery: { principalId: string; credentialId: string } | null
      try {
        ownerRecovery = await ctx.runQuery(
          internal.capabilityOperationInvocations.readOwnerRecovery,
          { invocationRef: candidate.dispatchRef },
        )
      } catch {
        continue
      }
      if (ownerRecovery === null) continue
      try {
        const result = await recoverCapabilityOperationInvocation(bindWorkloadCronActionContext(ctx, {
          name: 'reconcile due facilitator invocations',
          snapshot: workload,
          resourceInvocationRef: candidate.dispatchRef,
        }), {
          invocationRef: candidate.dispatchRef,
          principalId: ownerRecovery.principalId,
          credentialId: ownerRecovery.credentialId,
          mode: 'expire_authorization',
        })
        if (result.kind !== 'reconciliation_required' || !('expiryDisposition' in result)) continue
        if (result.expiryDisposition === 'manual_review') expiredManualReview += 1
        else expiredQueued += 1
      } catch {
        // A failed expiry candidate must not prevent the remaining candidates from running.
      }
    }
    const remainingCapacity = Math.max(0, RECONCILIATION_SWEEP_LIMIT - expiredSelected)
    const candidates = remainingCapacity === 0 || Date.now() >= deadlineAt
      ? []
      : await ctx.runQuery(
          internal.capabilityOperationInvocations.listDueAutomaticReconciliationCandidates,
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
        resourceInvocationRef: candidate.invocationRef,
      })
      try {
        claim = await invocationContext.runMutation(
          internal.capabilityOperationInvocations.claimAutomaticReconciliationCandidate,
          { invocationRef: candidate.invocationRef, leaseOwner, now: Date.now() },
        )
      } catch {
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
          const result = await recoverCapabilityOperationInvocation(invocationContext, {
            invocationRef: candidate.invocationRef,
            principalId: claim.principalId,
            credentialId: claim.credentialId,
            mode: 'status',
          })
          outcome = isTerminalRecoveryResult(result) ? 'terminal' : 'reconciliation_required'
        } catch {
          outcome = 'error'
          reason = 'recovery_failed'
        }
      }
      try {
        const finished = await invocationContext.runMutation(
          internal.capabilityOperationInvocations.finishAutomaticReconciliation,
          {
            invocationRef: candidate.invocationRef,
            leaseOwner,
            now: Date.now(),
            outcome,
            ...(reason === undefined ? {} : { reason }),
          },
        )
        if (finished.kind === 'completed') completed += 1
        else if (finished.kind === 'retried') retried += 1
        else if (finished.kind === 'manual_review') manualReview += 1
      } catch {
        // A failed finish must not prevent the remaining candidates from running.
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
  },
})
