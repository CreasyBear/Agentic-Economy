import type { Infer } from 'convex/values'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { internal } from '../../../_generated/api'
import { env, type ActionCtx } from '../../../_generated/server'
import type { TrustedChatAuthority } from '@/modules/chat/agent-turn.contracts'
import { callResultValue, recoveryResultValue, statusResultValue } from '@/modules/capability-execution/convex'
import { callResultSchema } from '@/modules/capability-execution/call-contracts'
import { inspectLiveX402RequirementRef } from '../liveX402Requirement/requirementRef'
import { cancelCallHandler, listAgentCallsHandler, reconcileCallHandler } from './callRecoveryActions'
import { callHandler, projectCallResult } from './callReservationActions'
import { callSummaryPageValue, type CallPrincipal } from './contracts'
import { canonicalAgentPrincipal } from './agentCallAuthority'
import { authorizeChatCallRef } from './chatCallAuthority'

export function agentRecoveryNotFound(callRef: string): Infer<typeof recoveryResultValue> {
  return { kind: 'refused', callRef, code: 'invocation_not_found', retryable: false }
}

export function agentStatusNotFound(callRef: string): Infer<typeof statusResultValue> {
  return { kind: 'refused', callRef, code: 'invocation_not_found', retryable: false }
}

type CanonicalCallArgs = Readonly<{
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
  principal: CallPrincipal
  quoteRef: string
  idempotencyKey: string
}>

export async function canonicalAgentCallHandler(
  ctx: ActionCtx,
  args: CanonicalCallArgs,
): Promise<Infer<typeof callResultValue>> {
  const sourceAdmitted = await ctx.runMutation(
    internal.capabilityQuotes.admitCall,
    args as never,
  )
  if (!sourceAdmitted) {
    return { kind: 'refused', code: 'invocation_runtime_unavailable', retryable: true }
  }
  return await canonicalAgentCallCore(ctx, args)
}

/** Shared Call body: public admission is upstream; trusted chat rechecks its turn fence. */
export async function canonicalAgentCallCore(
  ctx: ActionCtx,
  args: CanonicalCallArgs,
  trustedChat?: TrustedChatAuthority,
): Promise<Infer<typeof callResultValue>> {
  const material = await ctx.runQuery(internal.capabilityQuotes.readForCall, {
    principal: args.principal,
    quoteRef: args.quoteRef,
    idempotencyKey: args.idempotencyKey,
    now: Date.now(),
  })
  if (material === null) {
    return { kind: 'refused', code: 'operation_not_current', retryable: false }
  }
  const principal = trustedChat === undefined
    ? await canonicalAgentPrincipal(ctx, args.principal,
      'consumedCallRef' in material
        ? { callRef: material.consumedCallRef }
        : { toolRef: material.toolRef })
    : await ctx.runMutation(authorizeChatCallRef, { authority: trustedChat, quoteRef: args.quoteRef })
  if (principal === null) {
    return { kind: 'refused', toolRef: material.toolRef, code: 'grant_not_found', retryable: false }
  }
  if ('consumedCallRef' in material) {
    // Identify the consumed Call by the stable Principal tuple; the credential
    // it was reserved under may since have been replaced.
    const replay = await ctx.runQuery(internal.capabilityCalls.readReplay, {
      callRef: material.consumedCallRef,
      principalId: principal.principalId,
      ownerId: principal.ownerId,
      applicationRef: principal.applicationRef,
      environment: principal.environment,
    })
    if (replay === null) return { kind: 'refused', code: 'operation_not_current', retryable: false }
    if (replay.result !== undefined) return projectCallResult(callResultSchema.parse(replay.result))
    return { kind: 'pending', callRef: material.consumedCallRef, toolRef: material.toolRef, retryAfterMs: 1_000 }
  }
  const deploymentEnvironment = deploymentPaymentEnvironment(env)
  if (deploymentEnvironment === undefined || deploymentEnvironment !== principal.environment) {
    return { kind: 'refused', toolRef: material.toolRef, code: 'environment_mismatch', retryable: false }
  }
  if (material.x402RequirementDigest !== undefined && principal.authorityMode !== 'approval_required') {
    const live = await ctx.runAction(inspectLiveX402RequirementRef, {
      principal,
      toolRef: material.toolRef,
      input: material.input,
    })
    if (live.kind !== 'observed'
      || live.requirement.requirementDigest !== material.x402RequirementDigest) {
      return {
        kind: 'refused',
        toolRef: material.toolRef,
        code: 'operation_not_current',
        retryable: false,
        nextAction: 'operation.inspect',
      }
    }
  }
  const admitted = trustedChat === undefined
    ? principal
    : await ctx.runMutation(authorizeChatCallRef, { authority: trustedChat, quoteRef: args.quoteRef })
  if (admitted === null || admitted.principalId !== principal.principalId
    || admitted.credentialId !== principal.credentialId) {
    return { kind: 'refused', toolRef: material.toolRef, code: 'grant_not_found', retryable: false }
  }
  return await callHandler(ctx, {
    quoteRef: material.quoteRef,
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    principal: admitted,
    toolRef: material.toolRef,
    input: material.input,
    decisionPrice: material.decisionPrice,
    idempotencyKey: args.idempotencyKey,
  }, true, trustedChat?.turnRef)
}

export async function canonicalAgentListHandler(
  ctx: ActionCtx,
  args: Parameters<typeof listAgentCallsHandler>[1],
): Promise<Infer<typeof callSummaryPageValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { receiptList: true })
  if (principal === null) throw new Error('agent_invocation_list_unauthorized')
  return await listAgentCallsHandler(ctx, { ...args, principal })
}


export async function canonicalAgentCancelHandler(
  ctx: ActionCtx,
  args: Parameters<typeof cancelCallHandler>[1],
): Promise<Infer<typeof recoveryResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { callRef: args.callRef })
  if (principal === null) return agentRecoveryNotFound(args.callRef)
  return await cancelCallHandler(ctx, { ...args, principal })
}

export async function canonicalAgentReconcileHandler(
  ctx: ActionCtx,
  args: Parameters<typeof reconcileCallHandler>[1],
): Promise<Infer<typeof recoveryResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { callRef: args.callRef })
  if (principal === null) return agentRecoveryNotFound(args.callRef)
  return await reconcileCallHandler(ctx, { ...args, principal })
}
