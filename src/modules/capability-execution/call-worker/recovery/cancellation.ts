import { cancelPublicExecution } from '@/modules/action-execution/runtime'
import type { WorkId } from '@convex-dev/workpool'
import type { ActionCtx } from '../../../../../convex/_generated/server'
import { internal } from '../../../../../convex/_generated/api'
import { marketDispatchWorkpool } from '../../../../../convex/marketDispatchWorkpool'
import {
  cancelledRecoveryResult,
  projectPersistedRecovery,
  projectPureCallStatus,
  projectRecoveryOuter,
  reconciliationResult,
  recoveryNotFound,
} from '../../../../../convex/capabilityCallProjection'
import {
  loadRecoveredCall,
  loadRecoveryControl,
  loadRecoveryWorkContext,
  type RecoveryWorkContext,
} from './loading'
import { reconcileRecoveryMoney } from './reconciliation'
import type { RecoveredCall, RecoveryIdentity, RecoveryResult } from './contracts'

export async function cancelRecovery(
  ctx: ActionCtx,
  args: RecoveryIdentity & Readonly<{ idempotencyKey: string }>,
): Promise<RecoveryResult> {
  const recovered = await loadRecoveredCall(ctx, args)
  if (recovered === null) return recoveryNotFound(args.callRef)
  const beforeClaim = await cancelBeforeClaim(ctx, args, recovered)
  if (beforeClaim.kind === 'terminal') return beforeClaim.result
  const loaded = await loadRecoveryControl(ctx, recovered)
  if (loaded.kind === 'not_found') return recoveryNotFound(args.callRef)
  if (loaded.kind === 'persisted') return projectPersistedRecovery(recovered)
  const work = await loadRecoveryWorkContext(ctx, recovered, loaded.port, loaded.control)
  if (work === undefined) return recoveryNotFound(args.callRef)
  return await cancelClaimedRecovery(ctx, args, recovered, work)
}

async function cancelBeforeClaim(
  ctx: ActionCtx,
  args: RecoveryIdentity & Readonly<{ idempotencyKey: string }>,
  recovered: RecoveredCall,
): Promise<Readonly<{ kind: 'continue' }> | Readonly<{ kind: 'terminal'; result: RecoveryResult }>> {
  if (recovered.state !== 'pending') {
    const result = recovered.state === 'cancelled'
      ? cancelledRecoveryResult(recovered)
      : projectPersistedRecovery(recovered)
    return { kind: 'terminal', result }
  }
  const decision = await ctx.runMutation(internal.capabilityCalls.cancelBeforeClaim, {
    callRef: recovered.callRef,
    principalId: recovered.principalId,
    credentialId: recovered.credentialId,
    idempotencyKey: args.idempotencyKey,
  })
  if (decision.kind === 'refused') return { kind: 'terminal', result: recoveryNotFound(args.callRef) }
  if (decision.kind === 'cancelled') {
    if (decision.workId !== undefined) {
      await marketDispatchWorkpool.cancel(ctx, decision.workId as WorkId).catch(() => undefined)
    }
    return { kind: 'terminal', result: cancelledRecoveryResult(recovered) }
  }
  if (decision.kind === 'reconciliation_required') {
    return { kind: 'terminal', result: {
      kind: 'reconciliation_required', callRef: recovered.callRef,
      toolRef: recovered.toolRef, evidence: {
        attemptRef: decision.attemptRef,
        effectGeneration: decision.effectGeneration,
        requiredAt: new Date(Date.now() + 1_000).toISOString(),
        retry: 'reconcile_before_retry',
        evidenceSource: `operation:${recovered.toolRef}`,
      },
    } }
  }
  return { kind: 'continue' }
}

async function cancelClaimedRecovery(
  ctx: ActionCtx,
  args: RecoveryIdentity & Readonly<{ idempotencyKey: string }>,
  recovered: RecoveredCall,
  work: RecoveryWorkContext,
): Promise<RecoveryResult> {
  const actor = { callerRef: recovered.credentialId, principalRef: recovered.principalId }
  const origin = { kind: 'standalone' as const, callerRef: recovered.credentialId, principalRef: recovered.principalId }
  const cancellation = await cancelPublicExecution({
    tracer: work.tracer,
    executionRef: recovered.callRef,
    idempotencyKey: args.idempotencyKey,
    actor,
    origin,
  })
  if (cancellation.kind === 'refused') {
    if (cancellation.status === undefined) return recoveryNotFound(args.callRef)
    const result = projectPureCallStatus(recovered, cancellation.status)
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
