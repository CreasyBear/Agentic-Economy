import type { Infer } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { requireSourceRead } from '../../../lib/security/sourceWrite/admission'
import type { SourceWriteArgs } from '../../../lib/security/sourceWrite/contracts'
import { readPublicExecutionStatus } from '@/modules/action-execution/runtime'
import { statusResultValue, projectPersistedRecovery, projectPureCallStatus } from '@/modules/capability-execution/convex'
import { callIdentity, callIdentityMatches } from './callIdentity'
import { resolveCallAgentAuthorityHandler } from './agentCallAuthority'
import { recoveryControlMatchesCall, recoveryControlUsesPersistedResult } from './statusControl'
import { readRecoveryHandler } from './callRecoveryReads'
import { readPurchaseResolutionByCallRef } from './purchaseResolutionMaterialize'
import type { CallPrincipal } from './contracts'
import { readControlHandler, readAttemptsHandler, readHistoryHandler } from '../../actionExecution/control/reads'

type StatusArgs = SourceWriteArgs & Readonly<{
  operationKey: string
  correlationId: string
  principal: CallPrincipal
  callRef: string
  afterVersion?: number
}>

type StatusResult = Infer<typeof statusResultValue>

const notFound = (callRef: string): StatusResult => ({
  kind: 'refused', callRef, code: 'invocation_not_found', retryable: false,
})

/** Verify a current delegation, then read the recorded Call and execution state without a write. */
export async function readCallStatusQueryHandler(ctx: QueryCtx, args: StatusArgs): Promise<StatusResult> {
  const admission = await requireSourceRead(args, 'protected_action')
  if (admission.kind === 'rejected') throw new Error(`operation_invoke_source_write_rejected:${admission.reason}`)
  const principal = await resolveCallAgentAuthorityHandler(ctx, { principal: args.principal, callRef: args.callRef })
  if (principal === null) return notFound(args.callRef)
  const row = await readRecoveryHandler(ctx, { callRef: args.callRef, principalId: principal.principalId })
  if (row === null || !callIdentityMatches(row, callIdentity(principal))) return notFound(args.callRef)

  const control = await readControlHandler(ctx, { executionRef: args.callRef })
  if (control !== null && !recoveryControlMatchesCall(row, control)) return notFound(args.callRef)

  const persisted = recoveryControlUsesPersistedResult(row, control ?? undefined)
  let result: StatusResult = projectPersistedRecovery(row)
  if (!persisted) {
    const status = await readPublicExecutionStatus({
      port: {
        readControl: async () => control ?? undefined,
        readAttempts: async (executionRef, limit) => await readAttemptsHandler(ctx, { executionRef, limit }),
        readHistory: async (executionRef, afterVersion, limit) => await readHistoryHandler(ctx, { executionRef, afterVersion, limit }),
      },
      executionRef: row.callRef,
      actor: { callerRef: row.credentialId, principalRef: row.principalId },
    })
    if (status.kind === 'refused') return notFound(args.callRef)
    result = projectPureCallStatus(row, status)
  }
  if (result.kind !== 'found') return result
  try {
    const purchaseResolution = await readPurchaseResolutionByCallRef(ctx, result.callRef)
    if (purchaseResolution !== null) result = { ...result, purchaseResolution }
  } catch (cause) {
    void cause
  }
  return args.afterVersion !== undefined && result.version <= args.afterVersion
    ? { kind: 'unchanged', callRef: result.callRef, version: result.version, retryAfterMs: 1_000 }
    : result
}
