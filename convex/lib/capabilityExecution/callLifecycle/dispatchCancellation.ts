import { recordCallTerminal } from '@/lib/observability/journey'
import { internal } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { cancellationIdentityMatches, type CancellationArgs } from './callIdentity'
import type { CallDispatchMutationResult } from './contracts'
import { financialStateHasReleaseUncertainty, isBuyerFormanceReservation, refundReconciliation } from './dispatchRefusal'

type CallRow = Doc<'capabilityCalls'>

function cancelledResult(workId?: string): CallDispatchMutationResult {
  return workId === undefined ? { kind: 'cancelled' } : { kind: 'cancelled', workId }
}

async function patchCancelledInvocation(
  ctx: MutationCtx,
  row: CallRow,
  refundBeforeClaim = false,
): Promise<void> {
  const now = Date.now()
  const hasRefundSchedule = row.reconciliation?.reason === 'refund_pending'
  const shouldScheduleRefund = refundBeforeClaim && isBuyerFormanceReservation(row) && !hasRefundSchedule
  recordCallTerminal(row.state, 'cancelled')
  await ctx.db.patch(row._id, {
    state: 'cancelled',
    result: {
      kind: 'refused',
      toolRef: row.toolRef,
      code: 'invocation_cancelled',
      retryable: false,
    },
    workId: undefined,
    attemptRef: undefined,
    dispatchState: 'failed',
    ...(shouldScheduleRefund ? { reconciliation: refundReconciliation(now) } : {}),
    updatedAt: now,
  })
  if (shouldScheduleRefund) {
    await ctx.scheduler.runAfter(0, internal.capabilityCallWorker.reconcilePreClaimRefund, {
      callRef: row.callRef,
    })
  }
}

function cancellationNeedsReconciliation(
  canonical: Doc<'actionExecutionControls'>['control']['control'],
  attemptRef: string | undefined,
): boolean {
  if (attemptRef === undefined) return true
  if (canonical.state === 'reconciliation_required') return true
  return canonical.state === 'leased' && canonical.release === 'possibly_released'
}

async function patchCancellationReconciliation(
  ctx: MutationCtx,
  row: CallRow,
  attemptRef: string,
  effectGeneration: number,
): Promise<void> {
  if (row.state !== 'pending') return
  recordCallTerminal(row.state, 'reconciliation_required')
  await ctx.db.patch(row._id, {
    state: 'reconciliation_required',
    dispatchState: 'reconciliation_required',
    result: {
      kind: 'reconciliation_required',
      callRef: row.callRef,
      toolRef: row.toolRef,
      evidence: {
        attemptRef,
        effectGeneration,
        requiredAt: new Date(Date.now() + 1_000).toISOString(),
        retry: 'reconcile_before_retry',
        evidenceSource: `operation:${row.toolRef}`,
      },
    },
    attemptRef,
    updatedAt: Date.now(),
  })
}

async function markCancellationClaimed(
  ctx: MutationCtx,
  row: CallRow,
  attemptRef: string | undefined,
): Promise<void> {
  if (row.state !== 'pending' || attemptRef === undefined) return
  await ctx.db.patch(row._id, {
    dispatchState: 'running',
    attemptRef,
    updatedAt: Date.now(),
  })
}

export async function cancelBeforeClaimHandler(
  ctx: MutationCtx,
  args: CancellationArgs,
): Promise<CallDispatchMutationResult> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
    .unique()
  if (!cancellationIdentityMatches(row, args)) return { kind: 'refused', code: 'invocation_not_found' }
  if (row.state === 'cancelled') return cancelledResult(row.workId)
  const control = await ctx.db.query('actionExecutionControls')
    .withIndex('by_executionRef', (query) => query.eq('executionRef', args.callRef))
    .unique()
  if (control === null && row.state === 'pending') {
    const attempts = await ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptNumber', (query) => query.eq('executionRef', args.callRef))
      .take(1)
    if (row.attemptRef !== undefined || attempts.length > 0 || financialStateHasReleaseUncertainty(row)) {
      return { kind: 'refused', code: 'invocation_state_refused' }
    }
    const workId = row.workId
    await patchCancelledInvocation(ctx, row, true)
    return cancelledResult(workId)
  }
  if (control === null) return { kind: 'refused', code: 'invocation_state_refused' }
  const canonical = control.control.control
  const attemptRef = control.currentAttemptRef
  const effectGeneration = control.currentEffectGeneration ?? 1
  if (canonical.state === 'cancelled') {
    await patchCancelledInvocation(ctx, row)
    return { kind: 'cancelled' }
  }
  if (cancellationNeedsReconciliation(canonical, attemptRef)) {
    const reconciliationAttemptRef = attemptRef ?? `operation-attempt:${row.callRef}:1`
    await patchCancellationReconciliation(ctx, row, reconciliationAttemptRef, effectGeneration)
    return {
      kind: 'reconciliation_required',
      attemptRef: reconciliationAttemptRef,
      effectGeneration,
    }
  }
  await markCancellationClaimed(ctx, row, attemptRef)
  return { kind: 'claimed' }
}
