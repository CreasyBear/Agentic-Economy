import { type ObjectType } from 'convex/values'
import {
  reconcilePublicExecution,
  type ReconciliationEvidence,
} from '@/modules/action-execution/runtime'
import type { CallReceipt } from '@/modules/capability-execution/call-contracts'
import type { ActionCtx } from '../../../../../convex/_generated/server'
import { internal } from '../../../../../convex/_generated/api'
import { projectPersistedRecovery, projectPureCallStatus, reconciliationResult, recoveryNotFound, retryableRecoveryResult } from '@/modules/capability-execution/call-projection/recovery'
import { projectRecoveryOuter } from '../../../../../convex/lib/capabilityExecution/callProjection/recovery'
import { parseContractOutput } from '@/modules/capability-execution/call-projection/contract-output'
import { prepareX402RecoveryEvidence } from './x402'
import {
  loadReadyRecoveryWork,
  type RecoveryWorkContext,
} from './loading'
import {
  recoveryArgs,
  type RecoveredCall,
  type RecoveryIdentity,
  type RecoveryResult,
} from './contracts'

export async function reconcileRecoveryMoney(
  ctx: ActionCtx,
  work: RecoveryWorkContext,
  outcome: 'not_released' | 'released',
): Promise<{ kind: 'none' | 'settled' | 'reconciliation_required' }> {
  const { recovered, managedReservation } = work
  if (managedReservation !== null) {
    if (outcome !== 'not_released' || managedReservation.state !== 'reserved') {
      return { kind: 'reconciliation_required' }
    }
    const released = await ctx.runAction(
      internal.moneyManagedCallLifecycle.releaseBeforeSubmission,
      { callRef: recovered.callRef, now: Date.now() },
    )
    return released.kind === 'accepted'
      ? { kind: 'settled' }
      : { kind: 'reconciliation_required' }
  }
  // Seller-onboarding canaries carry no customer balance or Provider payable.
  // If no managed buyer reservation exists, there is no internal money state
  // to reconstruct here; x402 evidence is reconciled separately below.
  return { kind: 'settled' }
}

async function prepareSubmittedRecoveryEvidence(
  ctx: ActionCtx,
  work: RecoveryWorkContext,
  submittedEvidence: NonNullable<ObjectType<typeof recoveryArgs>['evidence']>,
) {
  if (submittedEvidence.kind !== 'x402_payment_reconciliation') {
    return {
      kind: 'prepared' as const,
      evidence: submittedEvidence,
      x402MoneyReconciled: false,
      brokeredReconciliationReceipt: undefined,
      brokeredOutcomeReceipt: undefined,
    }
  }
  const prepared = await prepareX402RecoveryEvidence(ctx, work, submittedEvidence)
  if (prepared.kind !== 'prepared') return prepared
  return {
    kind: 'prepared' as const,
    evidence: prepared.evidence,
    x402MoneyReconciled: true,
    brokeredReconciliationReceipt: undefined,
    brokeredOutcomeReceipt: prepared.outcomeReceipt,
  }
}

export async function reconcileRecovery(
  ctx: ActionCtx,
  args: RecoveryIdentity & Readonly<{ evidence: ObjectType<typeof recoveryArgs>['evidence'] }>,
): Promise<RecoveryResult> {
  const submittedEvidence = args.evidence
  if (submittedEvidence === undefined) return recoveryNotFound(args.callRef)
  const loaded = await loadReadyRecoveryWork(ctx, args)
  if (loaded.kind === 'not_found') return recoveryNotFound(args.callRef)
  if (loaded.kind === 'persisted') return projectPersistedRecovery(loaded.recovered)
  const { work } = loaded
  const { recovered, operation, tracer, attemptRows } = work
  const actor = { callerRef: recovered.credentialId, principalRef: recovered.principalId }
  const origin = { kind: 'standalone' as const, callerRef: recovered.credentialId, principalRef: recovered.principalId }
  const prepared = await prepareSubmittedRecoveryEvidence(ctx, work, submittedEvidence)
  if (prepared.kind === 'not_found') return recoveryNotFound(args.callRef)
  if (prepared.kind === 'required') {
    const required = reconciliationResult(
      recovered,
      prepared.status,
      attemptRows,
      operation.operationId,
      prepared.receipt,
    )
    await projectRecoveryOuter(ctx, recovered, required, 'reconciliation_required')
    return required
  }
  const {
    evidence,
    x402MoneyReconciled,
    brokeredReconciliationReceipt,
    brokeredOutcomeReceipt,
  } = prepared
  const reconciliation = await reconcilePublicExecution({
    tracer,
    executionRef: recovered.callRef,
    attemptRef: evidence.attemptRef,
    actor,
    origin,
    evidence,
  })
  if (reconciliation.kind === 'refused') {
    // A crash can leave the canonical effect reconciled before the buyer result
    // is projected. Replay the verified same-payment completion without effects.
    if (x402MoneyReconciled && evidence.resolution === 'released'
      && reconciliation.status !== undefined
      && work.control.control.control.state === 'terminal'
      && work.attemptRows.some(attempt => attempt.attemptRef === evidence.attemptRef
        && attempt.effectGeneration === evidence.effectGeneration
        && attempt.outcome.state === 'reconciled_released')) {
      return await projectAcceptedReconciliation(ctx, work, reconciliation.status,
        evidence.resolution, brokeredOutcomeReceipt)
    }
    return await projectRefusedReconciliation(
      ctx,
      recovered,
      reconciliation.status,
      brokeredOutcomeReceipt,
      args.callRef,
    )
  }
  if (operation.identity.adapterId === 'x402-fetch:v2' && !x402MoneyReconciled) {
    return await projectRequiredRecovery(ctx, work, reconciliation.status, brokeredReconciliationReceipt)
  }
  const money = await settleRecoveryMoney(ctx, work, evidence.resolution)
  if (money.kind === 'reconciliation_required') {
    return await projectRequiredRecovery(ctx, work, reconciliation.status, brokeredReconciliationReceipt)
  }
  return await projectAcceptedReconciliation(
    ctx,
    work,
    reconciliation.status,
    evidence.resolution,
    brokeredOutcomeReceipt,
  )
}

async function projectRefusedReconciliation(
  ctx: ActionCtx,
  recovered: RecoveredCall,
  status: Parameters<typeof projectPureCallStatus>[1] | undefined,
  receipt: CallReceipt | undefined,
  callRef: string,
): Promise<RecoveryResult> {
  if (status === undefined) return recoveryNotFound(callRef)
  const result = projectPureCallStatus(recovered, status)
  await projectRecoveryOuter(ctx, recovered, result, undefined)
  return result.kind === 'found' && receipt !== undefined ? { ...result, receipt } : result
}

async function settleRecoveryMoney(
  ctx: ActionCtx,
  work: RecoveryWorkContext,
  resolution: ReconciliationEvidence['resolution'],
) {
  return work.operation.identity.adapterId === 'x402-fetch:v2'
    ? { kind: 'settled' as const, outcome: resolution }
    : await reconcileRecoveryMoney(ctx, work, resolution)
}

async function projectRequiredRecovery(
  ctx: ActionCtx,
  work: RecoveryWorkContext,
  status: Parameters<typeof reconciliationResult>[1],
  receipt: CallReceipt | undefined,
): Promise<RecoveryResult> {
  const required = reconciliationResult(
    work.recovered,
    status,
    work.attemptRows,
    work.operation.operationId,
    receipt,
  )
  await projectRecoveryOuter(ctx, work.recovered, required, 'reconciliation_required')
  return required
}

async function projectAcceptedReconciliation(
  ctx: ActionCtx,
  work: RecoveryWorkContext,
  status: Parameters<typeof reconciliationResult>[1],
  resolution: ReconciliationEvidence['resolution'],
  receipt: CallReceipt | undefined,
): Promise<RecoveryResult> {
  const attempt = work.x402Attempt
  // Settlement with a retained 2xx closes the financial outcome. Usable delivery
  // still requires the original journalled output to satisfy the Tool contract.
  if (resolution === 'released' && receipt?.state === 'settled'
    && work.operation.identity.adapterId === 'x402-fetch:v2'
    && attempt?.responseStatus !== undefined && Number.isInteger(attempt.responseStatus)
    && attempt.responseStatus >= 200 && attempt.responseStatus < 300) {
    const output = parseContractOutput({
      transport: 'x402', disposition: 'succeeded', releaseStarted: true,
      requestDigest: attempt.transportRequestDigest ?? '',
      ...(attempt.quarantinedOutputJson === undefined ? {} : { outputJson: attempt.quarantinedOutputJson }),
      ...(attempt.quarantinedResponseDigest === undefined ? {} : { responseDigest: attempt.quarantinedResponseDigest }),
    }, work.descriptor)
    const evidenceHash = attempt.quarantinedResponseDigest ?? attempt.transportObservationDigest
    if (evidenceHash !== undefined) {
      const result = output.valid ? {
        kind: 'completed' as const, callRef: work.recovered.callRef,
        toolRef: work.recovered.toolRef, output: output.output,
        evidenceHash, receipt,
      } : {
        kind: 'refused' as const, toolRef: work.recovered.toolRef,
        code: 'provider_output_invalid', retryable: false,
        receipt: { ...receipt, evidenceHash, lossState: 'provider_output_invalid' as const },
      }
      await projectRecoveryOuter(ctx, work.recovered, {
        kind: 'found', callRef: work.recovered.callRef, toolRef: result.toolRef,
        version: work.recovered.updatedAt, state: 'terminal', result, receipt,
        attemptRef: attempt.attemptRef,
      }, output.valid ? 'completed' : 'refused')
      const persisted = await ctx.runQuery(internal.capabilityCalls.readRecovery, {
        callRef: work.recovered.callRef, principalId: work.recovered.principalId,
      })
      return persisted === null ? recoveryNotFound(work.recovered.callRef) : projectPersistedRecovery(persisted)
    }
  }
  if (resolution === 'released' || status.control !== 'retryable') {
    return await projectRequiredRecovery(ctx, work, status, receipt)
  }
  const retryable = retryableRecoveryResult(work.recovered, receipt)
  await projectRecoveryOuter(ctx, work.recovered, retryable, 'pending', {
    clearResult: true,
    clearWorkId: true,
    clearAttemptRef: true,
    clearEvidenceHash: true,
    clearDispatchState: true,
  })
  return retryable
}
