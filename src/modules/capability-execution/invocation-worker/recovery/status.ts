import { readPublicInvocationStatus } from '@/modules/action-invocation/runtime'
import type { ActionCtx } from '../../../../../convex/_generated/server'
import {
  projectPersistedRecovery,
  projectPureOperationInvocationStatus,
  recoveryNotFound,
} from '../../../../../convex/capabilityOperationInvocationProjection'
import {
  loadRecoveredInvocation,
  loadRecoveryControl,
} from './loading'
import type { RecoveryIdentity, RecoveryResult } from './contracts'

export async function readRecoveryStatus(
  ctx: ActionCtx,
  args: RecoveryIdentity,
): Promise<RecoveryResult> {
  const recovered = await loadRecoveredInvocation(ctx, args)
  if (recovered === null) return recoveryNotFound(args.invocationRef)
  const loaded = await loadRecoveryControl(ctx, recovered)
  if (loaded.kind === 'not_found') return recoveryNotFound(args.invocationRef)
  if (loaded.kind === 'persisted') return projectPersistedRecovery(recovered)
  const status = await readPublicInvocationStatus({
    port: loaded.port,
    invocationRef: recovered.invocationRef,
    actor: { callerRef: recovered.credentialId, principalRef: recovered.principalId },
  })
  if (status.kind === 'refused') return recoveryNotFound(args.invocationRef)
  return projectPureOperationInvocationStatus(recovered, status)
}
