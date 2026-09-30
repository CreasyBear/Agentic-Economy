import { v, type Infer } from 'convex/values'
import { paginationOptsValidator, type PaginationOptions } from 'convex/server'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import type { ActionCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { OwnerCallContext } from '@/modules/capability-execution/call-recovery-contracts'
import { publicCallRefusalCode } from '@/modules/capability-execution/call-contracts'
import { callState, callSummaryPageValue, principalAndSourceArgs, type ownerCallStatusResultValue } from './contracts'
import {
  reconciliationEvidenceValue,
  recoveryResultValue,
  statusResultValue,
  x402PaymentReconciliationEvidenceValue,
} from '@/modules/capability-execution/convex'
import { sourceWriteAdmissionArg, sourceWriteRequestArg } from '../../security/sourceWrite/contracts'
import type { CallPrincipal } from './admission'
import { callIdentity, callIdentityMatches } from './callIdentity'
import { type RecoveryRow, parseOwnerPreviousInput } from './callRecoveryReads'
export const callReconciliationEvidenceValue = v.union(reconciliationEvidenceValue, x402PaymentReconciliationEvidenceValue)
export const listCallsArgs = {
  ...principalAndSourceArgs,
  state: v.optional(callState),
  paginationOpts: paginationOptsValidator,
} as const
export const cancelCallArgs = { ...principalAndSourceArgs, callRef: v.string(), idempotencyKey: v.string() } as const
export const reconcileCallArgs = { ...cancelCallArgs, evidence: callReconciliationEvidenceValue } as const
export const readOwnerCallStatusArgs = { callRef: v.string() } as const
export const cancelOwnerCallArgs = { callRef: v.string(), idempotencyKey: v.string() } as const
export const reconcileOwnerCallArgs = { ...cancelOwnerCallArgs, evidence: callReconciliationEvidenceValue } as const



type RecoveryAdmission =
  | Readonly<{ kind: 'authorized'; row: RecoveryRow }>
  | Readonly<{ kind: 'not_found' }>

function recoveryNotFound(callRef: string): Infer<typeof recoveryResultValue> {
  return { kind: 'refused', callRef, code: 'invocation_not_found', retryable: false }
}

function projectStatusRecoveryResult(
  result: Infer<typeof recoveryResultValue>,
): Infer<typeof statusResultValue> {
  if (result.kind !== 'reconciliation_required') return result
  return {
    kind: 'found',
    callRef: result.callRef,
    version: Date.now(),
    toolRef: result.toolRef,
    state: 'reconciliation_required',
    attemptRef: result.evidence.attemptRef,
    effectGeneration: result.evidence.effectGeneration,
  }
}

function projectRecordedOwnerTerminalStatus(
  row: RecoveryRow,
): Infer<typeof statusResultValue> | undefined {
  const recordedResult = row.result
  if (recordedResult === undefined) return undefined
  const terminalState = row.state === 'completed' && recordedResult.kind === 'completed'
    ? 'terminal' as const
    : row.state === 'refused' && recordedResult.kind === 'refused' && !recordedResult.retryable
      ? 'terminal' as const
      : row.state === 'cancelled' && recordedResult.kind === 'refused'
        ? 'cancelled' as const
        : undefined
  if (terminalState === undefined) return undefined
  const result = recordedResult.kind === 'refused'
    ? { ...recordedResult, code: publicCallRefusalCode(recordedResult.code) }
    : recordedResult
  const receipt = 'receipt' in result ? result.receipt : undefined
  return {
    kind: 'found',
    callRef: row.callRef,
    version: row.updatedAt,
    toolRef: row.toolRef,
    state: terminalState,
    result,
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    ...(receipt === undefined ? {} : { receipt }),
  }
}

async function attachPurchaseResolutionToStatus(
  ctx: ActionCtx,
  result: Infer<typeof statusResultValue>,
): Promise<Infer<typeof statusResultValue>> {
  if (result.kind !== 'found') return result
  try {
    const purchaseResolution = await ctx.runQuery(internal.capabilityCalls.readPurchaseResolution, {
      callRef: result.callRef,
    })
    return purchaseResolution === null
      ? result
      : { ...result, purchaseResolution }
  } catch (cause) {
    void cause;
    return result
  }
}

async function authorizeRecovery(
  ctx: ActionCtx,
  callRef: string,
  principal: AgentAccessPrincipal,
): Promise<RecoveryAdmission> {
  // The outer authority boundary authenticates the current credential. A Call
  // retains its original credential as effect evidence after replacement.
  const row = await ctx.runQuery(internal.capabilityCalls.readOwnerRecovery, { callRef })
  if (!callIdentityMatches(row, callIdentity(principal))) return { kind: 'not_found' }
  return { kind: 'authorized', row }
}

async function authorizeOwnerRecovery(
  ctx: ActionCtx,
  callRef: string,
  idempotencyKey?: string,
): Promise<RecoveryRow | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (
    identity === null
    || identity.tokenIdentifier.trim().length === 0
    || (idempotencyKey !== undefined && idempotencyKey.trim().length === 0)
  ) return null
  const row = await ctx.runQuery(internal.capabilityCalls.readOwnerRecovery, { callRef })
  return row === null || row.ownerId !== identity.tokenIdentifier ? null : row
}

type RecoveryActionArgs = {
  operationKey: string
  correlationId: string
  sourceWrite?: Infer<typeof sourceWriteAdmissionArg>
  sourceWriteRequest?: Infer<typeof sourceWriteRequestArg>
  principal: CallPrincipal
  callRef: string
  afterVersion?: number
  idempotencyKey?: string
}

export async function listAgentCallsHandler(
  ctx: ActionCtx,
  args: Omit<RecoveryActionArgs, 'callRef'> & Readonly<{ state?: RecoveryRow['state']; paginationOpts: PaginationOptions }>,
): Promise<Infer<typeof callSummaryPageValue>> {
  await ctx.runMutation(internal.capabilityCalls.admit, {
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    ...(args.sourceWrite === undefined ? {} : { sourceWrite: args.sourceWrite }),
    ...(args.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: args.sourceWriteRequest }),
    principal: args.principal,
    toolRef: '',
    input: {},
    idempotencyKey: `list:${args.state ?? 'all'}:${args.paginationOpts.cursor ?? 'start'}:${args.paginationOpts.numItems}`,
  })
  return await ctx.runQuery(internal.capabilityCalls.listAgentCallSummaries, {
    principalId: args.principal.principalId,
    ownerId: args.principal.ownerId,
    credentialId: args.principal.credentialId,
    applicationRef: args.principal.applicationRef,
    environment: args.principal.environment,
    ...(args.state === undefined ? {} : { state: args.state }),
    paginationOpts: args.paginationOpts,
  })
}

type RecoveryEvidence =
  | Infer<typeof reconciliationEvidenceValue>
  | Infer<typeof x402PaymentReconciliationEvidenceValue>


export async function cancelCallHandler(
  ctx: ActionCtx,
  args: RecoveryActionArgs & { idempotencyKey: string },
): Promise<Infer<typeof recoveryResultValue>> {
  await ctx.runMutation(internal.capabilityCalls.admit, {
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    ...(args.sourceWrite === undefined ? {} : { sourceWrite: args.sourceWrite }),
    ...(args.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: args.sourceWriteRequest }),
    principal: args.principal,
    toolRef: '',
    input: {},
    idempotencyKey: `cancel:${args.idempotencyKey}`,
  })
  const admission = await authorizeRecovery(ctx, args.callRef, args.principal)
  if (admission.kind !== 'authorized') return recoveryNotFound(args.callRef)
  return await ctx.runAction(internal.capabilityCallWorker.recover, {
    callRef: args.callRef,
    principalId: admission.row.principalId,
    credentialId: admission.row.credentialId,
    recoveryPrincipal: args.principal,
    mode: 'cancel',
    idempotencyKey: args.idempotencyKey,
  })
}

export async function reconcileCallHandler(
  ctx: ActionCtx,
  args: RecoveryActionArgs & { idempotencyKey: string; evidence: RecoveryEvidence },
): Promise<Infer<typeof recoveryResultValue>> {
  await ctx.runMutation(internal.capabilityCalls.admit, {
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    ...(args.sourceWrite === undefined ? {} : { sourceWrite: args.sourceWrite }),
    ...(args.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: args.sourceWriteRequest }),
    principal: args.principal,
    toolRef: '',
    input: {},
    idempotencyKey: `reconcile:${args.idempotencyKey}`,
  })
  const admission = await authorizeRecovery(ctx, args.callRef, args.principal)
  if (admission.kind !== 'authorized') return recoveryNotFound(args.callRef)
  return await ctx.runAction(internal.capabilityCallWorker.recover, {
    callRef: args.callRef,
    principalId: admission.row.principalId,
    credentialId: admission.row.credentialId,
    recoveryPrincipal: args.principal,
    mode: 'reconcile',
    evidence: args.evidence,
  })
}

export async function readOwnerCallStatusHandler(
  ctx: ActionCtx,
  args: { callRef: string },
): Promise<Infer<typeof ownerCallStatusResultValue>> {
  const row = await authorizeOwnerRecovery(ctx, args.callRef)
  if (row === null) return recoveryNotFound(args.callRef) as Infer<typeof statusResultValue>
  const recordedTerminal = projectRecordedOwnerTerminalStatus(row)
  const projected = recordedTerminal ?? projectStatusRecoveryResult(
    await ctx.runAction(internal.capabilityCallWorker.recover, {
      callRef: args.callRef,
      principalId: row.principalId,
      credentialId: row.credentialId,
      recoverAsOwner: true,
      mode: 'status',
    }),
  )
  if (projected.kind !== 'found') return projected
  const withPurchaseResolution = await attachPurchaseResolutionToStatus(ctx, projected)
  if (withPurchaseResolution.kind !== 'found') return withPurchaseResolution
  const previousInput = parseOwnerPreviousInput(row.inputJson)
  let ownerContext: OwnerCallContext | null
  try {
    ownerContext = await ctx.runQuery(internal.capabilityCalls.readOwnerReceiptContext, {
      callRef: row.callRef, ownerId: row.ownerId, toolRef: projected.toolRef,
    })
  } catch (cause) {
    // Optional identity/capability metadata must not erase a readable receipt.
    ownerContext = degradeBackend(cause, null, { site: 'readOwnerCallStatusHandler', reason: 'source_unavailable' })
  }
  return {
    ...withPurchaseResolution,
    ...(previousInput === undefined ? {} : { previousInput }),
    ownerContext,
  }
}


export async function cancelOwnerCallHandler(
  ctx: ActionCtx,
  args: { callRef: string; idempotencyKey: string },
): Promise<Infer<typeof recoveryResultValue>> {
  const row = await authorizeOwnerRecovery(ctx, args.callRef, args.idempotencyKey)
  if (row === null) return recoveryNotFound(args.callRef)
  return await ctx.runAction(internal.capabilityCallWorker.recover, {
    callRef: args.callRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    recoverAsOwner: true,
    mode: 'cancel',
    idempotencyKey: args.idempotencyKey,
  })
}

export async function reconcileOwnerCallHandler(
  ctx: ActionCtx,
  args: { callRef: string; idempotencyKey: string; evidence: RecoveryEvidence },
): Promise<Infer<typeof recoveryResultValue>> {
  const row = await authorizeOwnerRecovery(ctx, args.callRef, args.idempotencyKey)
  if (row === null) return recoveryNotFound(args.callRef)
  return await ctx.runAction(internal.capabilityCallWorker.recover, {
    callRef: args.callRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    recoverAsOwner: true,
    mode: 'reconcile',
    evidence: args.evidence,
  })
}
