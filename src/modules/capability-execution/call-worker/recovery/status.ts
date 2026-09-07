import { readPublicExecutionStatus } from '@/modules/action-execution/runtime'
import type { ActionCtx } from '../../../../../convex/_generated/server'
import {
  projectPersistedRecovery,
  projectPureCallStatus,
  recoveryNotFound,
} from '../../../../../convex/capabilityCallProjection'
import {
  loadRecoveredCall,
  loadRecoveryControl,
} from './loading'
import type { RecoveryIdentity, RecoveryResult } from './contracts'

export async function readRecoveryStatus(
  ctx: ActionCtx,
  args: RecoveryIdentity,
): Promise<RecoveryResult> {
  const recovered = await loadRecoveredCall(ctx, args)
  if (recovered === null) return recoveryNotFound(args.callRef)
  const loaded = await loadRecoveryControl(ctx, recovered)
  if (loaded.kind === 'not_found') return recoveryNotFound(args.callRef)
  if (loaded.kind === 'persisted') return projectPersistedRecovery(recovered)
  const status = await readPublicExecutionStatus({
    port: loaded.port,
    executionRef: recovered.callRef,
    actor: { callerRef: recovered.credentialId, principalRef: recovered.principalId },
  })
  if (status.kind === 'refused') return recoveryNotFound(args.callRef)
  return projectPureCallStatus(recovered, status)
}
