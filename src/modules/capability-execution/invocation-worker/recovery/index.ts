import type { ObjectType } from 'convex/values'
import type { ActionCtx } from '../../../../../convex/_generated/server'
import { recoveryNotFound } from '../../../../../convex/capabilityOperationInvocationProjection'
import { cancelRecovery } from './cancellation'
import { expireAuthorizationRecovery } from './expiry'
import { readRecoveryStatus } from './status'
import { reconcileRecovery } from './reconciliation'
import {
  recoveryArgs,
  type InternalRecoveryResult,
} from './contracts'

export {
  cancelRecovery,
  expireAuthorizationRecovery,
  readRecoveryStatus,
  reconcileRecovery,
  recoveryArgs,
}
export type {
  RecoveredInvocation,
  RecoveryResult,
} from './contracts'
export type { RecoveryWorkContext } from './loading'

export async function recoverCapabilityOperationInvocation(
  ctx: ActionCtx,
  args: Readonly<{
    invocationRef: string
    principalId: string
    credentialId: string
    mode: 'status' | 'cancel' | 'reconcile'
    idempotencyKey?: string
    evidence?: ObjectType<typeof recoveryArgs>['evidence']
  }>,
): Promise<InternalRecoveryResult> {
  switch (args.mode) {
    case 'status':
      if (args.idempotencyKey !== undefined || args.evidence !== undefined) {
        return recoveryNotFound(args.invocationRef)
      }
      return readRecoveryStatus(ctx, args)
    case 'cancel':
      if (args.idempotencyKey === undefined || args.evidence !== undefined) {
        return recoveryNotFound(args.invocationRef)
      }
      return cancelRecovery(ctx, { ...args, idempotencyKey: args.idempotencyKey })
    case 'reconcile':
      if (args.idempotencyKey !== undefined || args.evidence === undefined) {
        return recoveryNotFound(args.invocationRef)
      }
      return reconcileRecovery(ctx, { ...args, evidence: args.evidence })
    default: {
      const _exhaustive: never = args.mode
      void _exhaustive
      return recoveryNotFound(args.invocationRef)
    }
  }
}
