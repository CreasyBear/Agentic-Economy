import type { MutationCtx } from './_generated/server'
import { internal } from './_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parsePublishedOperationSnapshot } from '@/modules/capability-supply/public'

export async function completeWorkHandler(
  ctx: MutationCtx,
  { context, result }: {
    workId: string
    context: { invocationRef: string }
    result:
      | { kind: 'success'; returnValue: unknown }
      | { kind: 'failed'; error: string }
      | { kind: 'canceled' }
  },
): Promise<null> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', context.invocationRef)).unique()
  if (row === null || row.state !== 'pending') return null
  if (
    result.kind === 'success'
    && typeof result.returnValue === 'object'
    && result.returnValue !== null
    && 'kind' in result.returnValue
    && result.returnValue.kind === 'recorded'
  ) {
    await ctx.db.patch(row._id, { dispatchState: 'completed', updatedAt: Date.now() })
    return null
  }
  const control = await ctx.db.query('actionInvocationControls')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', context.invocationRef)).unique()
  const invocationControl = control?.control.control
  const release = invocationControl?.state === 'leased' ? invocationControl.release : undefined
  const possibleRelease = release === 'possibly_released'
    || invocationControl?.state === 'reconciliation_required'
    || invocationControl?.state === 'terminal'
  if (possibleRelease) {
    const attemptRef = control?.currentAttemptRef ?? `operation-attempt:${context.invocationRef}`
    const effectGeneration = control?.currentEffectGeneration ?? 1
    await ctx.db.patch(row._id, {
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      result: {
        kind: 'reconciliation_required',
        invocationRef: context.invocationRef,
        operationRef: row.operationRef,
        evidence: {
          attemptRef,
          effectGeneration,
          requiredAt: new Date(Date.now() + 1_000).toISOString(),
          retry: 'reconcile_before_retry' as const,
          evidenceSource: `operation:${row.operationRef}`,
        },
      },
      attemptRef,
      updatedAt: Date.now(),
    })
    return null
  }
  const attemptRef = `operation-attempt:${context.invocationRef}:1`
  const transactionRef = `operation-money:${context.invocationRef}:${attemptRef}:1`
  const sourceDigest = parsePublishedOperationSnapshot(row.operationJson ?? '')?.materialDigest
    ?? canonicalDigest({
      format: 'operation-money-source:v1',
      invocationRef: context.invocationRef,
      operationRef: row.operationRef,
      requestDigest: row.requestDigest,
    } as never)
  const reconciliationDigest = canonicalDigest({
    format: 'operation-money-reconciliation:v1',
    invocationRef: context.invocationRef,
    attemptRef,
    operationRef: row.operationRef,
    inputDigest: row.inputDigest,
    transactionRef,
    outcome: 'not_released',
    sourceDigest,
  } as never)
  const refundTransactionRef = `operation-money-refund:${context.invocationRef}:${attemptRef}:1`
  const refundInputDigest = canonicalDigest({
    format: 'operation-money-refund:v1',
    invocationRef: context.invocationRef,
    attemptRef,
    inputDigest: row.inputDigest,
    transactionRef,
    outcome: 'not_released',
  } as never)
  let settlement: { kind: 'none' | 'settled' | 'reconciliation_required' }
  try {
    settlement = await ctx.runMutation(internal.moneyLedger.reconcileInvocationCharge, {
      invocationRef: context.invocationRef,
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
    settlement = { kind: 'reconciliation_required' }
  }
  if (settlement.kind === 'reconciliation_required') {
    const evidenceAttemptRef = control?.currentAttemptRef ?? attemptRef
    const effectGeneration = control?.currentEffectGeneration ?? 1
    await ctx.db.patch(row._id, {
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      result: {
        kind: 'reconciliation_required',
        invocationRef: context.invocationRef,
        operationRef: row.operationRef,
        evidence: {
          attemptRef: evidenceAttemptRef,
          effectGeneration,
          requiredAt: new Date(Date.now() + 1_000).toISOString(),
          retry: 'reconcile_before_retry' as const,
          evidenceSource: `operation:${row.operationRef}`,
        },
      },
      attemptRef: evidenceAttemptRef,
      updatedAt: Date.now(),
    })
    return null
  }
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
  return null
}
