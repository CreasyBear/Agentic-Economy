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
  handler: recoverCapabilityOperationInvocation,
})

export const reconcileScheduled = internalAction({
  args: {},
  returns: reconciliationScheduledResult,
  handler: async (ctx): Promise<Infer<typeof reconciliationScheduledResult>> => {
    const startedAt = Date.now()
    const deadlineAt = startedAt + RECONCILIATION_SWEEP_DEADLINE_MS
    const leaseOwner = `reconciliation-sweep:${crypto.randomUUID()}`
    const candidates = await ctx.runQuery(
      internal.capabilityOperationInvocations.listDueAutomaticReconciliationCandidates,
      { now: startedAt, limit: RECONCILIATION_SWEEP_LIMIT },
    )
    let claimed = 0
    let completed = 0
    let retried = 0
    let manualReview = 0
    for (const candidate of candidates) {
      if (Date.now() >= deadlineAt) break
      let claim: { kind: string; principalId?: string; credentialId?: string }
      try {
        claim = await ctx.runMutation(
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
          const result = await recoverCapabilityOperationInvocation(ctx, {
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
        const finished = await ctx.runMutation(
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
      selected: Math.min(candidates.length, RECONCILIATION_SWEEP_LIMIT),
      claimed: Math.min(claimed, RECONCILIATION_SWEEP_LIMIT),
      completed: Math.min(completed, RECONCILIATION_SWEEP_LIMIT),
      retried: Math.min(retried, RECONCILIATION_SWEEP_LIMIT),
      manualReview: Math.min(manualReview, RECONCILIATION_SWEEP_LIMIT),
    }
  },
})
