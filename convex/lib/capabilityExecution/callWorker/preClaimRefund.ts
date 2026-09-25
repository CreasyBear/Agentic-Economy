"use node";

import * as crypto from 'node:crypto'
import { v } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'

type PreClaimRefundResult = { kind: 'settled' | 'retried' | 'manual_review' | 'not_claimed' }

export const reconcilePreClaimRefundArgs = { callRef: v.string() }
export const reconcilePreClaimRefundResult = v.object({
  kind: v.union(v.literal('settled'), v.literal('retried'), v.literal('manual_review'), v.literal('not_claimed')),
})

export async function reconcilePreClaimRefundHandler(
  ctx: ActionCtx,
  args: { callRef: string },
): Promise<PreClaimRefundResult> {
  if (!await ctx.runQuery(internal.capabilityCalls.readPreClaimRefund, args)) return { kind: 'not_claimed' }
  const leaseOwner = `pre-claim-refund:${crypto.randomUUID()}`
  const claim = await ctx.runMutation(internal.capabilityCalls.claimAutomaticReconciliationCandidate, {
    ...args, leaseOwner, now: Date.now(),
  })
  if (claim.kind !== 'claimed') return { kind: 'not_claimed' }
  let outcome: 'success' | 'reconciliation_required' | 'error' = 'reconciliation_required'
  try {
    // The persisted refusal or cancellation excludes claim atomically. Recheck that exact proof
    // after the lease; cleanup returns a hold and grants no purchase authority.
    if (!await ctx.runQuery(internal.capabilityCalls.readPreClaimRefund, args)) {
      throw new Error('pre_claim_refund_proof_changed')
    }
    const released = await ctx.runAction(internal.moneyManagedCallLifecycle.releaseBeforeSubmission, {
      ...args, now: Date.now(),
    })
    if (released.kind === 'accepted' && released.state === 'released') outcome = 'success'
  } catch (cause) {
    degradeBackend(cause, undefined, { site: 'reconcilePreClaimRefund', reason: 'source_unavailable' })
    outcome = 'error'
  }
  const finished = await ctx.runMutation(internal.capabilityCalls.finishAutomaticReconciliation, {
    ...args, leaseOwner, now: Date.now(), outcome, reason: 'refund_pending',
  })
  return { kind: finished.kind === 'completed' ? 'settled'
    : finished.kind === 'manual_review' ? 'manual_review' : 'retried' }
}
