import type { ObjectType } from 'convex/values'
import type { ActionCtx } from '../../../../../convex/_generated/server'
import { recoveryNotFound } from '../../../../../convex/capabilityCallProjection'
import { cancelRecovery } from './cancellation'
import { expireAuthorizationRecovery } from './expiry'
import { readRecoveryStatus } from './status'
import { reconcileRecovery } from './reconciliation'
import { reconcilePreSubmissionRecovery } from './preSubmission'
import { reconcileManagedSigningRecovery } from './managedSigning'
import {
  recoveryArgs,
  type InternalRecoveryResult,
} from './contracts'

export {
  cancelRecovery,
  expireAuthorizationRecovery,
  readRecoveryStatus,
  reconcileRecovery,
  reconcilePreSubmissionRecovery,
  reconcileManagedSigningRecovery,
  recoveryArgs,
}
export type {
  RecoveredCall,
  RecoveryResult,
} from './contracts'
export type { RecoveryWorkContext } from './loading'

export async function recoverCapabilityCall(
  ctx: ActionCtx,
  args: Readonly<{
    callRef: string
    principalId: string
    credentialId: string
    mode: 'status' | 'cancel' | 'reconcile' | 'reconcile_pre_submission' | 'reconcile_managed_signing'
    idempotencyKey?: string
    evidence?: ObjectType<typeof recoveryArgs>['evidence']
  }>,
): Promise<InternalRecoveryResult> {
  switch (args.mode) {
    case 'status':
      return recoverStatus(ctx, args)
    case 'cancel':
      return recoverCancellation(ctx, args)
    case 'reconcile':
      return recoverSubmittedReconciliation(ctx, args)
    case 'reconcile_pre_submission':
      return recoverServerPreSubmission(ctx, args)
    case 'reconcile_managed_signing':
      return recoverManagedSigning(ctx, args)
    default: {
      const _exhaustive: never = args.mode
      void _exhaustive
      return recoveryNotFound(args.callRef)
    }
  }
}

async function recoverManagedSigning(
  ctx: ActionCtx,
  args: RecoveryCommand,
): Promise<InternalRecoveryResult> {
  if (args.idempotencyKey !== undefined || args.evidence !== undefined) {
    return recoveryNotFound(args.callRef)
  }
  return reconcileManagedSigningRecovery(ctx, args)
}

type RecoveryCommand = Parameters<typeof recoverCapabilityCall>[1]

async function recoverStatus(ctx: ActionCtx, args: RecoveryCommand): Promise<InternalRecoveryResult> {
  if (args.idempotencyKey !== undefined || args.evidence !== undefined) {
    return recoveryNotFound(args.callRef)
  }
  return readRecoveryStatus(ctx, args)
}

async function recoverCancellation(ctx: ActionCtx, args: RecoveryCommand): Promise<InternalRecoveryResult> {
  if (args.idempotencyKey === undefined || args.evidence !== undefined) {
    return recoveryNotFound(args.callRef)
  }
  return cancelRecovery(ctx, { ...args, idempotencyKey: args.idempotencyKey })
}

async function recoverSubmittedReconciliation(
  ctx: ActionCtx,
  args: RecoveryCommand,
): Promise<InternalRecoveryResult> {
  if (args.idempotencyKey !== undefined || args.evidence === undefined) {
    return recoveryNotFound(args.callRef)
  }
  return reconcileRecovery(ctx, { ...args, evidence: args.evidence })
}

async function recoverServerPreSubmission(
  ctx: ActionCtx,
  args: RecoveryCommand,
): Promise<InternalRecoveryResult> {
  if (args.idempotencyKey !== undefined || args.evidence !== undefined) {
    return recoveryNotFound(args.callRef)
  }
  return reconcilePreSubmissionRecovery(ctx, args)
}
