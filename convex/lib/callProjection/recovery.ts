import type { ActionCtx } from '../../_generated/server'
import { internal } from '../../_generated/api'
import { recoveryOuterState } from '@/modules/capability-execution/convex'
import type { OpenDispatch, RecoveryOuterProjectionOptions, RecoveryRow, WorkerRecoveryResult } from '@/modules/capability-execution/convex'

export async function projectRecoveryOuter(
  ctx: ActionCtx,
  row: RecoveryRow,
  result: WorkerRecoveryResult,
  stateOverride: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled' | undefined,
  options: RecoveryOuterProjectionOptions = {},
): Promise<void> {
  const state = stateOverride ?? (
    result.kind === 'found' && typeof result.state === 'string'
      ? recoveryOuterState(row, { state: result.state })
      : row.state
  )
  const clearResult = options.clearResult === true
    || (
      state === 'cancelled'
      && result.kind === 'found'
      && result.result === undefined
      && row.result?.kind === 'pending'
    )
  const clearWorkId = options.clearWorkId === true
  const clearAttemptRef = options.clearAttemptRef === true
  const clearEvidenceHash = options.clearEvidenceHash === true
  const clearDispatchState = options.clearDispatchState === true
  const projectedResult = clearResult
    ? undefined
    : result.kind === 'found' && result.result !== undefined
      ? result.result
      : result.kind === 'reconciliation_required'
      ? {
            kind: 'reconciliation_required' as const,

            callRef: result.callRef,
            toolRef: result.toolRef,
            evidence: result.evidence,
            ...(result.receipt === undefined ? {} : { receipt: result.receipt }),
          }
        : undefined
  const projectedDispatchState = clearDispatchState
    ? undefined
    : state === 'cancelled' || state === 'refused'
      ? 'failed' as const
      : state === 'reconciliation_required'
        ? 'reconciliation_required' as const
        : state === 'completed'
          ? 'completed' as const
          : 'running' as const
  await ctx.runMutation(internal.capabilityCalls.projectRecovery, {
    callRef: row.callRef,
    principalId: row.principalId,
    state,
    ...(projectedResult === undefined ? {} : { result: projectedResult }),
    ...(clearAttemptRef ? {} : result.kind === 'found' && typeof result.attemptRef === 'string' ? { attemptRef: result.attemptRef } : {}),
    ...(projectedDispatchState === undefined ? {} : { dispatchState: projectedDispatchState }),
    clearResult,
    clearWorkId,
    clearAttemptRef,
    clearEvidenceHash,
    clearDispatchState,
    now: Date.now(),
  })
}

export async function projectReconciliationRequired(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  attemptRef: string,
  recordedAt: string,
  effectGeneration = 1,
): Promise<void> {
  await ctx.runMutation(internal.capabilityCalls.record, {
    callRef: dispatch.callRef,
    principalId: dispatch.principalId,
    state: 'reconciliation_required',
    result: {
      kind: 'reconciliation_required',
      callRef: dispatch.callRef,
      toolRef: dispatch.toolRef,
      evidence: {
        attemptRef,
        effectGeneration,
        requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
        retry: 'reconcile_before_retry',
        evidenceSource: `operation:${dispatch.toolRef}`,
      },
    },
    attemptRef,
    dispatchState: 'reconciliation_required',
    now: Date.now(),
  })
}
