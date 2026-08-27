import { type ObjectType } from 'convex/values'
import {
  reconcilePublicInvocation,
  type ReconciliationEvidence,
} from '@/modules/action-invocation/runtime'
import type { OperationInvokeReceipt } from '@/modules/capability-execution/operation-invoke-contracts'
import type { ActionCtx } from '../../../../../convex/_generated/server'
import {
  projectPersistedRecovery,
  projectPureOperationInvocationStatus,
  projectRecoveryOuter,
  reconciliationResult,
  recoveryNotFound,
  retryableRecoveryResult,
} from '../../../../../convex/capabilityOperationInvocationProjection'
import {
  reconcileAcceptedCharge,
  releaseBrokeredInvocationCharge,
} from '../charge'
import { prepareX402RecoveryEvidence } from './x402'
import {
  loadReadyRecoveryWork,
  type RecoveryWorkContext,
} from './loading'
import {
  recoveryArgs,
  type RecoveredInvocation,
  type RecoveryIdentity,
  type RecoveryResult,
} from './contracts'

export async function reconcileRecoveryMoney(
  ctx: ActionCtx,
  work: RecoveryWorkContext,
  outcome: 'not_released' | 'released',
): Promise<{ kind: 'none' | 'settled' | 'reconciliation_required' }> {
  const { recovered, control, operation, brokeredReservation } = work
  const attemptRef = control.currentAttemptRef
    ?? recovered.attemptRef
    ?? `operation-attempt:${recovered.invocationRef}:1`
  // Check the deterministic buyer transaction before reconstructing the
  // brokered reservation. A claimed invocation can be cancelled in the
  // window before the buyer reservation is written; in that case the
  // canonical reconciliation mutation returns `none`, which is a safe
  // no-effect outcome rather than a reason to manufacture a reservation.
  const deterministicBuyerSettlement = await reconcileAcceptedCharge(
    ctx,
    recovered,
    operation,
    {
      chargeState: 'paid',
      transactionRef: `operation-money:${recovered.invocationRef}:${attemptRef}:1`,
    },
    attemptRef,
    outcome,
  )
  if (deterministicBuyerSettlement.kind === 'settled') return { kind: 'settled' }
  if (brokeredReservation !== undefined) {
    const settlement = outcome === 'not_released'
      ? await releaseBrokeredInvocationCharge(ctx, brokeredReservation)
      : { kind: 'reconciliation_required' as const }
    return settlement.kind === 'reconciliation_required'
      ? { kind: 'reconciliation_required' }
      : { kind: 'settled' }
  }
  return { kind: 'reconciliation_required' }
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
  if (submittedEvidence === undefined) return recoveryNotFound(args.invocationRef)
  const loaded = await loadReadyRecoveryWork(ctx, args, true)
  if (loaded.kind === 'not_found') return recoveryNotFound(args.invocationRef)
  if (loaded.kind === 'persisted') return projectPersistedRecovery(loaded.recovered)
  const { work } = loaded
  const { recovered, operation, tracer, attemptRows } = work
  const actor = { callerRef: recovered.credentialId, principalRef: recovered.principalId }
  const origin = { kind: 'standalone' as const, callerRef: recovered.credentialId, principalRef: recovered.principalId }
  const prepared = await prepareSubmittedRecoveryEvidence(ctx, work, submittedEvidence)
  if (prepared.kind === 'not_found') return recoveryNotFound(args.invocationRef)
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
  const reconciliation = await reconcilePublicInvocation({
    tracer,
    invocationRef: recovered.invocationRef,
    attemptRef: evidence.attemptRef,
    actor,
    origin,
    evidence,
  })
  if (reconciliation.kind === 'refused') {
    return await projectRefusedReconciliation(
      ctx,
      recovered,
      reconciliation.status,
      brokeredOutcomeReceipt,
      args.invocationRef,
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
  recovered: RecoveredInvocation,
  status: Parameters<typeof projectPureOperationInvocationStatus>[1] | undefined,
  receipt: OperationInvokeReceipt | undefined,
  invocationRef: string,
): Promise<RecoveryResult> {
  if (status === undefined) return recoveryNotFound(invocationRef)
  const result = projectPureOperationInvocationStatus(recovered, status)
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
  receipt: OperationInvokeReceipt | undefined,
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
  receipt: OperationInvokeReceipt | undefined,
): Promise<RecoveryResult> {
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
