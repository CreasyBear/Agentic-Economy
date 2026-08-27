import type { MutationCtx } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import { internal } from '../../_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { parsePublishedOperationSnapshot } from '@/modules/capability-supply/public'

type InvocationRow = Doc<'capabilityOperationInvocations'>
type InvocationControlRow = Doc<'actionInvocationControls'>
type WorkResult =
  | { kind: 'success'; returnValue: unknown }
  | { kind: 'failed'; error: string }
  | { kind: 'canceled' }

function isRecordedSuccess(result: WorkResult): boolean {
  return result.kind === 'success'
    && isRecord(result.returnValue)
    && result.returnValue.kind === 'recorded'
}

function effectMayHaveBeenReleased(control: InvocationControlRow | null): boolean {
  if (control === null) return false
  const invocationControl = control.control.control
  if (invocationControl.state === 'reconciliation_required') return true
  if (invocationControl.state === 'terminal') return true
  return invocationControl.state === 'leased' && invocationControl.release === 'possibly_released'
}

function controlAttempt(
  control: InvocationControlRow | null,
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
  row: InvocationRow,
  invocationRef: string,
): Promise<ChargeSettlement> {
  const attemptRef = `operation-attempt:${invocationRef}:1`
  const transactionRef = `operation-money:${invocationRef}:${attemptRef}:1`
  const sourceDigest = parsePublishedOperationSnapshot(row.operationJson ?? '')?.materialDigest
    ?? canonicalDigest({
      format: 'operation-money-source:v1',
      invocationRef,
      operationRef: row.operationRef,
      requestDigest: row.requestDigest,
    } as never)
  const reconciliationDigest = canonicalDigest({
    format: 'operation-money-reconciliation:v1',
    invocationRef,
    attemptRef,
    operationRef: row.operationRef,
    inputDigest: row.inputDigest,
    transactionRef,
    outcome: 'not_released',
    sourceDigest,
  } as never)
  const refundTransactionRef = `operation-money-refund:${invocationRef}:${attemptRef}:1`
  const refundInputDigest = canonicalDigest({
    format: 'operation-money-refund:v1',
    invocationRef,
    attemptRef,
    inputDigest: row.inputDigest,
    transactionRef,
    outcome: 'not_released',
  } as never)
  try {
    return await ctx.runMutation(internal.moneyLedger.reconcileInvocationCharge, {
      invocationRef,
      principalId: row.principalId,
      credentialId: row.credentialId,
      attemptRef,
      transactionRef,
      inputDigest: row.inputDigest,
      outcome: 'not_released',
      refundTransactionRef,
      refundIdempotencyKey: refundTransactionRef,
      refundInputDigest,
      sourceDigest,
      evidenceRefs: [`operation-money-reconciliation:${reconciliationDigest}`],
      observedAt: Date.now(),
    })
  } catch {
    return { kind: 'reconciliation_required' }
  }
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
  { context, result }: {
    workId: string
    context: { invocationRef: string }
    result: WorkResult
  },
): Promise<null> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', context.invocationRef)).unique()
  if (row === null || row.state !== 'pending') return null
  if (isRecordedSuccess(result)) {
    await ctx.db.patch(row._id, { dispatchState: 'completed', updatedAt: Date.now() })
    return null
  }
  const control = await ctx.db.query('actionInvocationControls')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', context.invocationRef)).unique()
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
  const settlement = await reconcilePreReleaseFailure(ctx, row, context.invocationRef)
  if (settlement.kind === 'reconciliation_required') {
    await patchReconciliationRequired(ctx, row, context.invocationRef, controlAttempt(control, attemptRef))
    return null
  }
  await patchPreReleaseRefusal(ctx, row)
  return null
}
