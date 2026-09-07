import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { canonicalAuthorityBasisMaterial } from '@/modules/action-execution/runtime'
import {
  publishedToolIdentityDigest,
  type PublishedTool,
  type RuntimePublishedToolDescriptor,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { ExactAmount } from '@/modules/money/public'
import type { CallPersistedAuthority } from './internal/convex-schema'
import {
  type CallInput,
  type CallRefusalCode,
  type CallResult,
} from './call-contracts'
import type {
  CallRecoveryResult,
  CallStatusResult,
} from './call-recovery-contracts'
import type { CallListInput, CallListResult } from './call-history.actions'
import type { ToolQuoteInput, ToolQuoteResult } from './quote'
import {
  admitCall,
  reserveCall,
  type CallAdmitted,
  type CallApprovedAuthority,
  type CallAuthorityDecision,
  type CallCurrentToolReader,
  type CallGrant,
  type CallIdempotencyPort,
  type CallPolicyReader,
  type CallRequest,
  type CallReserved,
} from './call-admit'
import {
  bindCallRecovery,
  type CallRecoveryPort,
  type CallRecoveryRequest,
} from './call-recover'

export {
  canonicalCallRef,
} from './call-admit'
export type {
  CallApprovedAuthority,
  CallAuthorityDecision,
  CallCurrentTool,
  CallCurrentToolReader,
  CallGrant,
  CallGrantDecision,
  CallIdempotencyAbandonment,
  CallIdempotencyAbandonmentResult,
  CallIdempotencyPort,
  CallIdempotencyReservation,
  CallPolicyReader,
  CallPortRefusal,
  CallRequest,
} from './call-admit'
export type {
  CallRecoveryPort,
  CallRecoveryRequest,
} from './call-recover'

export type CallDispatchResult =
  | Readonly<{ kind: 'enqueued'; retryAfterMs?: number }>
  | Readonly<{ kind: 'outcome_unknown' }>
  | Readonly<{
      kind: 'refused'
      code: CallRefusalCode
      retryable: boolean
      nextAction?: string
    }>

export type CallServiceRequest = Readonly<{
  input: CallInput
  principal: AgentAccessPrincipal
  correlationId: string
}>

export type CallExecutor = Readonly<{
  callTool(input: CallServiceRequest): Promise<CallResult>
}>

type CallApplication = Readonly<{
  callTool(input: CallRequest): Promise<CallResult>
}>

export type CallDispatchPort = (input: Readonly<{
  operation: PublishedTool
  descriptor: RuntimePublishedToolDescriptor
  principal: AgentAccessPrincipal
  grant: CallGrant
  authority: CallPersistedAuthority
  callRef: string
  idempotencyKey: string
  input: Record<string, unknown>
  correlationId: string
}>) => Promise<CallDispatchResult>

export type CallRuntime = Readonly<{
  currentTool: CallCurrentToolReader
  policy: CallPolicyReader
  idempotency: CallIdempotencyPort
  dispatch: CallDispatchPort
  recovery?: CallRecoveryPort
  now?: () => number
  retryAfterMs?: number
}>

export type CallService = CallExecutor & Readonly<{
  quoteTool?(input: Readonly<{ input: ToolQuoteInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<ToolQuoteResult>
  listCalls?(input: Readonly<{ input: CallListInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<CallListResult>
  readCallStatus(input: CallRecoveryRequest): Promise<CallStatusResult>
  cancelCall(input: CallRecoveryRequest & Readonly<{ idempotencyKey: string }>): Promise<CallRecoveryResult>
  reconcileCall(input: CallRecoveryRequest & Readonly<{ evidence: Record<string, unknown>; idempotencyKey: string }>): Promise<CallRecoveryResult>
}>

export function createCallApplication(
  runtime: CallRuntime,
): CallApplication {
  const now = runtime.now ?? Date.now
  const retryAfterMs = runtime.retryAfterMs ?? 1_000

  const callTool = async (
    request: CallRequest,
  ): Promise<CallResult> => {
    const admitted = await admitCall({
      request,
      policy: runtime.policy,
      currentTool: runtime.currentTool,
      now,
    })
    if (admitted.kind === 'refused') return admitted.result
    const reserved = await reserveCall({
      request,
      admitted,
      idempotency: runtime.idempotency,
    })
    if (reserved.kind === 'terminal') return reserved.result
    return await callReservedTool({
      runtime,
      request,
      admitted,
      reserved,
      now,
      retryAfterMs,
    })
  }

  return Object.freeze({
    callTool,
    ...bindCallRecovery({ recovery: runtime.recovery }),
  })
}

async function callReservedTool(input: Readonly<{
  runtime: CallRuntime
  request: CallRequest
  admitted: CallAdmitted
  reserved: CallReserved
  now: () => number
  retryAfterMs: number
}>): Promise<CallResult> {
  const { runtime, request, admitted, reserved, now, retryAfterMs } = input
  const { command, grant, hasCurrentToolReader, current, descriptor, preflightRefusal, inputDigest } = admitted
  const { reservation, reservationMayBeAbandoned } = reserved

  const refuseBeforeDispatch = async (
    refusal: Extract<CallResult, { kind: 'refused' }>,
  ): Promise<CallResult> => {
    if (!reservationMayBeAbandoned) return refusal
    try {
      const abandoned = await runtime.idempotency.abandon({
        ...reservation,
        ownerId: request.principal.ownerId,
      })
      if (abandoned.kind === 'abandoned') return refusal
      if (abandoned.kind === 'dispatch_started') return reconciliationRequiredAfterDispatch()
    } catch {
      // A failed cleanup must remain visible as runtime unavailability.
    }
    return {
      kind: 'refused',
      toolRef: command.toolRef,
      code: 'invocation_runtime_unavailable',
      retryable: true,
      nextAction: 'Retry after the invocation store is available.',
    }
  }
  const reconciliationRequiredAfterDispatch = (): CallResult => {
    const attemptRef = `operation-attempt:${reservation.callRef}:1`
    return {
      kind: 'reconciliation_required',
      callRef: reservation.callRef,
      toolRef: command.toolRef,
      evidence: {
        attemptRef,
        effectGeneration: 1,
        requiredAt: new Date(now()).toISOString(),
        retry: 'reconcile_before_retry',
        evidenceSource: `operation:${command.toolRef}`,
      },
    }
  }

  if (preflightRefusal !== undefined) {
    return await refuseBeforeDispatch(preflightRefusal)
  }

  if (!hasCurrentToolReader || current === undefined || descriptor === undefined) {
    return await refuseBeforeDispatch({
      kind: 'refused',
      toolRef: command.toolRef,
      code: 'invocation_runtime_unavailable',
      retryable: true,
    })
  }

  let authority: CallAuthorityDecision
  try {
    authority = await runtime.policy.evaluateAuthority({
      principal: request.principal,
      grant,
      operation: current.operation,
      descriptor,
      input: command.input,
      toolRef: command.toolRef,
      callRef: reservation.callRef,
      idempotencyKey: command.idempotencyKey,
      correlationId: request.correlationId,
    })
  } catch {
    return await refuseBeforeDispatch({
      kind: 'refused',
      toolRef: command.toolRef,
      code: 'authority_reader_unavailable',
      retryable: true,
    })
  }
  authority = normalizeCallAuthority({
    authority,
    principal: request.principal,
    grant,
    callRef: reservation.callRef,
  })
  if (authority.kind === 'needs_authority') {
    return {
      kind: 'needs_authority',
      callRef: reservation.callRef,
      toolRef: command.toolRef,
      authorityRequest: authority.authorityRequest,
    }
  }
  if (authority.kind === 'refused') {
    return await refuseBeforeDispatch({
      kind: 'refused',
      toolRef: command.toolRef,
      code: authority.code,
      retryable: authority.retryable,
      ...(authority.nextAction === undefined ? {} : { nextAction: authority.nextAction }),
    })
  }
  const persistedAuthority = buildCallAuthority({
    authority,
    grant,
    operation: current.operation,
    descriptor,
    toolRef: command.toolRef,
    callRef: reservation.callRef,
    inputDigest,
    ...(command.decisionPrice === undefined ? {} : { decisionPrice: command.decisionPrice }),
    now: now(),
  })
  if (persistedAuthority === undefined) {
    return await refuseBeforeDispatch({
      kind: 'refused',
      toolRef: command.toolRef,
      code: 'authority_required',
      retryable: false,
    })
  }
  let dispatched: CallDispatchResult
  try {
    dispatched = await runtime.dispatch({
      operation: current.operation,
      descriptor,
      principal: request.principal,
      grant,
      authority: persistedAuthority,
      callRef: reservation.callRef,
      idempotencyKey: command.idempotencyKey,
      input: command.input,
      correlationId: request.correlationId,
    })
  } catch {
    return await refuseBeforeDispatch({
      kind: 'refused',
      toolRef: command.toolRef,
      code: 'invocation_runtime_unavailable',
      retryable: true,
    })
  }
  if (dispatched.kind === 'outcome_unknown') return reconciliationRequiredAfterDispatch()
  if (dispatched.kind === 'refused') {
    return await refuseBeforeDispatch({
      kind: 'refused',
      toolRef: command.toolRef,
      code: dispatched.code,
      retryable: dispatched.retryable,
      ...(dispatched.nextAction === undefined ? {} : { nextAction: dispatched.nextAction }),
    })
  }
  return {
    kind: 'pending',
    callRef: reservation.callRef,
    toolRef: command.toolRef,
    retryAfterMs: dispatched.retryAfterMs ?? retryAfterMs,
  }
}

function normalizeCallAuthority(input: Readonly<{
  authority: CallAuthorityDecision
  principal: AgentAccessPrincipal
  grant: CallGrant
  callRef: string
}>): CallAuthorityDecision {
  if (
    input.authority.kind !== 'approved'
    || input.principal.authorityMode !== 'unrestricted_test_only'
    || input.authority.basis.kind !== 'approval_required'
  ) return input.authority
  return {
    kind: 'approved',
    basis: {
      kind: 'spending_policy_use',
      spendingPolicyRef: `agent-access-grant:${input.grant.grantRef}`,
      spendingPolicyVersion: 1,
      spendingPolicyGeneration: input.grant.generation,
      authorityUseRef: `operation-authority-use:${input.callRef}`,
      grantEvidenceRef: `agent-access-grant-evidence:${input.grant.policyDigest}`,
    },
    expiresAt: input.authority.expiresAt,
  }
}

export function buildCallAuthority(input: Readonly<{
  authority: CallApprovedAuthority
  grant: CallGrant
  operation: PublishedTool
  descriptor: RuntimePublishedToolDescriptor
  toolRef: string
  callRef: string
  inputDigest: string
  decisionPrice?: ExactAmount
  now: number
}>): CallPersistedAuthority | undefined {
  const decisionPrice = input.descriptor.price.kind === 'fixed'
    ? input.descriptor.price.amount
    : input.decisionPrice
  if (decisionPrice === undefined) return undefined
  const authorityExpiresAt = Date.parse(input.authority.expiresAt)
  const grantExpiresAt = input.grant.expiresAt
  const readinessExpiresAt = input.operation.readiness.validUntil
  const effectiveExpiresAt = Math.min(authorityExpiresAt, grantExpiresAt, readinessExpiresAt)
  if (
    !Number.isFinite(authorityExpiresAt)
    || !Number.isFinite(grantExpiresAt)
    || !Number.isFinite(readinessExpiresAt)
    || !Number.isFinite(effectiveExpiresAt)
    || effectiveExpiresAt <= input.now
  ) return undefined
  const expiresAt = effectiveExpiresAt === authorityExpiresAt
    ? input.authority.expiresAt
    : new Date(effectiveExpiresAt).toISOString()
  const targetDigest = publishedToolIdentityDigest(input.operation.identity)
  const limits = { amount: decisionPrice }
  const reference = input.authority.basis.kind === 'approval_required'
    ? input.authority.basis.authorityRef
    : `operation-authority:${input.callRef}`
  if (reference.trim().length === 0) return undefined
  const material = {
    format: 'operation-invoke-authority:v1',
    callRef: input.callRef,
    toolRef: input.toolRef,
    inputDigest: input.inputDigest,
    grantRef: input.grant.grantRef,
    grantGeneration: input.grant.generation,
    grantDigest: input.grant.policyDigest,
    reference,
    targetDigest,
    consequence: input.descriptor.consequenceClass,
    limits,
    expiresAt,
    acceptedBasis: input.authority.basis,
  } as const
  const canonicalMaterial = {
    format: 'operation-invoke-authority:v1',
    invocationRef: input.callRef,
    operationRef: input.toolRef,
    inputDigest: input.inputDigest,
    grantRef: input.grant.grantRef,
    grantGeneration: input.grant.generation,
    grantDigest: input.grant.policyDigest,
    reference,
    targetDigest,
    consequence: input.descriptor.consequenceClass,
    limits,
    expiresAt,
    acceptedBasis: canonicalAuthorityBasisMaterial(input.authority.basis),
  } as const
  return {
    ...material,
    decisionDigest: canonicalDigest(canonicalMaterial as StableHashValue),
  }
}

export async function executeCall(
  input: CallServiceRequest,
  executor: CallExecutor,
): Promise<CallResult> {
  return await executor.callTool(input)
}
