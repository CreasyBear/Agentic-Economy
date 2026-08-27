import { cancelPublicInvocation } from '@/modules/action-invocation/runtime'
import type { WorkId } from '@convex-dev/workpool'
import type { ActionCtx } from '../../../../../convex/_generated/server'
import { internal } from '../../../../../convex/_generated/api'
import { marketDispatchWorkpool } from '../../../../../convex/marketDispatchWorkpool'
import {
  cancelledRecoveryResult,
  projectPersistedRecovery,
  projectPureOperationInvocationStatus,
  projectRecoveryOuter,
  reconciliationResult,
  recoveryNotFound,
} from '../../../../../convex/capabilityOperationInvocationProjection'
import {
  loadRecoveredInvocation,
  loadRecoveryControl,
  loadRecoveryWorkContext,
  type RecoveryWorkContext,
} from './loading'
import { reconcileRecoveryMoney } from './reconciliation'
import type { RecoveredInvocation, RecoveryIdentity, RecoveryResult } from './contracts'

export async function cancelRecovery(
  ctx: ActionCtx,
  args: RecoveryIdentity & Readonly<{ idempotencyKey: string }>,
): Promise<RecoveryResult> {
  const recovered = await loadRecoveredInvocation(ctx, args)
  if (recovered === null) return recoveryNotFound(args.invocationRef)
  const beforeClaim = await cancelBeforeClaim(ctx, args, recovered)
  if (beforeClaim.kind === 'terminal') return beforeClaim.result
  const loaded = await loadRecoveryControl(ctx, recovered)
  if (loaded.kind === 'not_found') return recoveryNotFound(args.invocationRef)
  if (loaded.kind === 'persisted') return projectPersistedRecovery(recovered)
  const work = await loadRecoveryWorkContext(ctx, recovered, loaded.port, loaded.control, true)
  if (work === undefined) return recoveryNotFound(args.invocationRef)
  return await cancelClaimedRecovery(ctx, args, recovered, work)
}

async function cancelBeforeClaim(
  ctx: ActionCtx,
  args: RecoveryIdentity & Readonly<{ idempotencyKey: string }>,
  recovered: RecoveredInvocation,
): Promise<Readonly<{ kind: 'continue' }> | Readonly<{ kind: 'terminal'; result: RecoveryResult }>> {
  if (recovered.state !== 'pending') {
    const result = recovered.state === 'cancelled'
      ? cancelledRecoveryResult(recovered)
      : projectPersistedRecovery(recovered)
    return { kind: 'terminal', result }
  }
  const decision = await ctx.runMutation(internal.capabilityOperationInvocations.cancelBeforeClaim, {
    invocationRef: recovered.invocationRef,
    principalId: recovered.principalId,
    credentialId: recovered.credentialId,
    idempotencyKey: args.idempotencyKey,
  })
  if (decision.kind === 'refused') return { kind: 'terminal', result: recoveryNotFound(args.invocationRef) }
  if (decision.kind === 'cancelled') {
    if (decision.workId !== undefined) {
      await marketDispatchWorkpool.cancel(ctx, decision.workId as WorkId).catch(() => undefined)
    }
    return { kind: 'terminal', result: cancelledRecoveryResult(recovered) }
  }
  if (decision.kind === 'reconciliation_required') {
    return { kind: 'terminal', result: {
      kind: 'reconciliation_required', invocationRef: recovered.invocationRef,
      operationRef: recovered.operationRef, evidence: {
        attemptRef: decision.attemptRef,
        effectGeneration: decision.effectGeneration,
        requiredAt: new Date(Date.now() + 1_000).toISOString(),
        retry: 'reconcile_before_retry',
        evidenceSource: `operation:${recovered.operationRef}`,
      },
    } }
  }
  return { kind: 'continue' }
}

async function cancelClaimedRecovery(
  ctx: ActionCtx,
  args: RecoveryIdentity & Readonly<{ idempotencyKey: string }>,
  recovered: RecoveredInvocation,
  work: RecoveryWorkContext,
): Promise<RecoveryResult> {
  const actor = { callerRef: recovered.credentialId, principalRef: recovered.principalId }
  const origin = { kind: 'standalone' as const, callerRef: recovered.credentialId, principalRef: recovered.principalId }
  const cancellation = await cancelPublicInvocation({
    tracer: work.tracer,
    invocationRef: recovered.invocationRef,
    idempotencyKey: args.idempotencyKey,
    actor,
    origin,
  })
  if (cancellation.kind === 'refused') {
    if (cancellation.status === undefined) return recoveryNotFound(args.invocationRef)
    const result = projectPureOperationInvocationStatus(recovered, cancellation.status)
    await projectRecoveryOuter(ctx, recovered, result, undefined)
    return result
  }
  if (cancellation.kind === 'cancelled') {
    const money = await reconcileRecoveryMoney(ctx, work, 'not_released')
    if (money.kind === 'reconciliation_required') {
      const reconciliation = reconciliationResult(recovered, cancellation.status, work.attemptRows, work.operation.operationId)
      await projectRecoveryOuter(ctx, recovered, reconciliation, 'reconciliation_required')
      return reconciliation
    }
    const cancelled = cancelledRecoveryResult(recovered)
    await projectRecoveryOuter(ctx, recovered, cancelled, 'cancelled', {
      clearResult: true,
      clearWorkId: true,
      clearAttemptRef: true,
      clearEvidenceHash: true,
    })
    return cancelled
  }
  const reconciliation = reconciliationResult(recovered, cancellation.status, work.attemptRows, work.operation.operationId)
  await projectRecoveryOuter(ctx, recovered, reconciliation, 'reconciliation_required')
  return reconciliation
}
