import type { MutationCtx } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import { isRecord } from '@/modules/common/is-record'

type InvocationRow = Doc<'capabilityOperationInvocations'>
type ExecutionControlRow = Doc<'actionExecutionControls'>
type WorkResult =
  | { kind: 'success'; returnValue: unknown }
  | { kind: 'failed'; error: string }
  | { kind: 'canceled' }

function isRecordedSuccess(result: WorkResult): boolean {
  return result.kind === 'success'
    && isRecord(result.returnValue)
    && result.returnValue.kind === 'recorded'
}

function effectMayHaveBeenReleased(control: ExecutionControlRow | null): boolean {
  if (control === null) return false
  const executionControl = control.control.control
  if (executionControl.state === 'reconciliation_required') return true
  if (executionControl.state === 'terminal') return true
  return executionControl.state === 'leased' && executionControl.release === 'possibly_released'
}

function controlAttempt(
  control: ExecutionControlRow | null,
  fallbackAttemptRef: string,
): Readonly<{ attemptRef: string; effectGeneration: number }> {
  return {
    attemptRef: control?.currentAttemptRef ?? fallbackAttemptRef,
    effectGeneration: control?.currentEffectGeneration ?? 1,
  }
}

async function patchReconciliationRequired(
  ctx: MutationCtx,
  row: InvocationRow,
  invocationRef: string,
  attempt: Readonly<{ attemptRef: string; effectGeneration: number }>,
): Promise<void> {
  await ctx.db.patch(row._id, {
    state: 'reconciliation_required',
    dispatchState: 'reconciliation_required',
    result: {
      kind: 'reconciliation_required',
      invocationRef,
      operationRef: row.operationRef,
      evidence: {
        attemptRef: attempt.attemptRef,
        effectGeneration: attempt.effectGeneration,
        requiredAt: new Date(Date.now() + 1_000).toISOString(),
        retry: 'reconcile_before_retry' as const,
        evidenceSource: `operation:${row.operationRef}`,
      },
    },
    attemptRef: attempt.attemptRef,
    updatedAt: Date.now(),
  })
}

type ChargeSettlement = { kind: 'none' | 'settled' | 'reconciliation_required' }

async function reconcilePreReleaseFailure(
  ctx: MutationCtx,
  invocationRef: string,
): Promise<ChargeSettlement> {
  const invocation = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
    .unique()
  if (invocation?.formanceReservationRefs === undefined
    || invocation.formanceFinancialState === 'released') return { kind: 'none' }
  // A mutation callback cannot perform the external Formance release. Keep the
  // durable reservation and let the existing recovery Action prove and release
  // it by exact reference before a fresh invocation can be offered.
  return { kind: 'reconciliation_required' }
}

async function patchPreReleaseRefusal(ctx: MutationCtx, row: InvocationRow): Promise<void> {
  await ctx.db.patch(row._id, {
    state: 'refused',
    dispatchState: 'failed',
    result: {
      kind: 'refused',
      operationRef: row.operationRef,
      code: 'pre_release_failed',
      retryable: true,
      nextAction: 'Retry with a new idempotency key.',
    },
    updatedAt: Date.now(),
  })
}

export async function completeWorkHandler(
  ctx: MutationCtx,
  { workId, context, result }: {
    workId: string
    context: { invocationRef: string }
    result: WorkResult
  },
): Promise<null> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', context.invocationRef)).unique()
  // workId is the persisted work generation. A late callback from the prior
  // generation must never finalize or refuse a newly re-armed invocation.
  if (row === null || row.state !== 'pending' || row.workId !== workId) return null
  if (isRecordedSuccess(result)) {
    await ctx.db.patch(row._id, { dispatchState: 'completed', updatedAt: Date.now() })
    return null
  }
  const control = await ctx.db.query('actionExecutionControls')
    .withIndex('by_executionRef', (query) => query.eq('executionRef', context.invocationRef)).unique()
  if (effectMayHaveBeenReleased(control)) {
    await patchReconciliationRequired(
      ctx,
      row,
      context.invocationRef,
      controlAttempt(control, `operation-attempt:${context.invocationRef}`),
    )
    return null
  }
  const attemptRef = `operation-attempt:${context.invocationRef}:1`
  const settlement = await reconcilePreReleaseFailure(ctx, context.invocationRef)
  if (settlement.kind === 'reconciliation_required') {
    await patchReconciliationRequired(ctx, row, context.invocationRef, controlAttempt(control, attemptRef))
    return null
  }
  await patchPreReleaseRefusal(ctx, row)
  return null
}
