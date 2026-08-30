import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import {
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { OperationInvokePersistedAuthority } from './internal/convex-schema'
import {
  type OperationInvokeRefusalCode,
  type OperationInvokeResult,
} from './operation-invoke-contracts'
import type {
  OperationInvokeRecoveryResult,
  OperationInvokeStatusResult,
} from './operation-recovery-contracts'
import type { OperationListInput, OperationListResult } from './operation-history.actions'
import {
  admitOperationInvoke,
  reserveOperationInvoke,
  type OperationInvokeAdmitted,
  type OperationInvokeApprovedAuthority,
  type OperationInvokeAuthorityDecision,
  type OperationInvokeCurrentOperationReader,
  type OperationInvokeGrant,
  type OperationInvokeIdempotencyPort,
  type OperationInvokePolicyReader,
  type OperationInvokeRequest,
  type OperationInvokeReserved,
} from './operation-invoke-admit'
import {
  bindOperationInvokeRecovery,
  type OperationInvokeRecoveryPort,
  type OperationInvokeRecoveryRequest,
} from './operation-invoke-recover'

export {
  canonicalOperationInvocationRef,
} from './operation-invoke-admit'
export type {
  OperationInvokeApprovedAuthority,
  OperationInvokeAuthorityDecision,
  OperationInvokeCurrentOperation,
  OperationInvokeCurrentOperationReader,
  OperationInvokeGrant,
  OperationInvokeGrantDecision,
  OperationInvokeIdempotencyAbandonment,
  OperationInvokeIdempotencyAbandonmentResult,
  OperationInvokeIdempotencyPort,
  OperationInvokeIdempotencyReservation,
  OperationInvokePolicyReader,
  OperationInvokePortRefusal,
  OperationInvokeRequest,
} from './operation-invoke-admit'
export type {
  OperationInvokeRecoveryPort,
  OperationInvokeRecoveryRequest,
} from './operation-invoke-recover'

export type OperationInvokeDispatchResult =
  | Readonly<{ kind: 'enqueued'; retryAfterMs?: number }>
  | Readonly<{ kind: 'outcome_unknown' }>
  | Readonly<{
      kind: 'refused'
      code: OperationInvokeRefusalCode
      retryable: boolean
      nextAction?: string
    }>

export type OperationInvokeExecutor = Readonly<{
  invokeOperation(input: OperationInvokeRequest): Promise<OperationInvokeResult>
}>

export type OperationInvokeDispatchPort = (input: Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  principal: AgentAccessPrincipal
  grant: OperationInvokeGrant
  authority: OperationInvokePersistedAuthority
  invocationRef: string
  idempotencyKey: string
  input: Record<string, unknown>
  correlationId: string
}>) => Promise<OperationInvokeDispatchResult>

export type OperationInvokeRuntime = Readonly<{
  currentOperation: OperationInvokeCurrentOperationReader
  policy: OperationInvokePolicyReader
  idempotency: OperationInvokeIdempotencyPort
  dispatch: OperationInvokeDispatchPort
  recovery?: OperationInvokeRecoveryPort
  now?: () => number
  retryAfterMs?: number
}>

export type OperationInvokeService = OperationInvokeExecutor & Readonly<{
  listInvocations?(input: Readonly<{ input: OperationListInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<OperationListResult>
  readInvocationStatus(input: OperationInvokeRecoveryRequest): Promise<OperationInvokeStatusResult>
  cancelInvocation(input: OperationInvokeRecoveryRequest & Readonly<{ idempotencyKey: string }>): Promise<OperationInvokeRecoveryResult>
  reconcileInvocation(input: OperationInvokeRecoveryRequest & Readonly<{ evidence: Record<string, unknown>; idempotencyKey: string }>): Promise<OperationInvokeRecoveryResult>
}>

export function createOperationInvokeApplication(
  runtime: OperationInvokeRuntime,
): OperationInvokeService {
  const now = runtime.now ?? Date.now
  const retryAfterMs = runtime.retryAfterMs ?? 1_000

  const invokeOperation = async (
    request: OperationInvokeRequest,
  ): Promise<OperationInvokeResult> => {
    const admitted = await admitOperationInvoke({
      request,
      policy: runtime.policy,
      currentOperation: runtime.currentOperation,
      now,
    })
    if (admitted.kind === 'refused') return admitted.result
    const reserved = await reserveOperationInvoke({
      request,
      admitted,
      idempotency: runtime.idempotency,
    })
    if (reserved.kind === 'terminal') return reserved.result
    return await invokeReservedOperation({
      runtime,
      request,
      admitted,
      reserved,
      now,
      retryAfterMs,
    })
  }

  return Object.freeze({
    invokeOperation,
    ...bindOperationInvokeRecovery({ recovery: runtime.recovery }),
  })
}

async function invokeReservedOperation(input: Readonly<{
  runtime: OperationInvokeRuntime
  request: OperationInvokeRequest
  admitted: OperationInvokeAdmitted
  reserved: OperationInvokeReserved
  now: () => number
  retryAfterMs: number
}>): Promise<OperationInvokeResult> {
  const { runtime, request, admitted, reserved, now, retryAfterMs } = input
  const { command, grant, hasCurrentOperationReader, current, descriptor, preflightRefusal, inputDigest } = admitted
  const { reservation, reservationMayBeAbandoned } = reserved

  const refuseBeforeDispatch = async (
    refusal: Extract<OperationInvokeResult, { kind: 'refused' }>,
  ): Promise<OperationInvokeResult> => {
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
      operationRef: command.operationRef,
      code: 'invocation_runtime_unavailable',
      retryable: true,
      nextAction: 'Retry after the invocation store is available.',
    }
  }
  const reconciliationRequiredAfterDispatch = (): OperationInvokeResult => {
    const attemptRef = `operation-attempt:${reservation.invocationRef}:1`
    return {
      kind: 'reconciliation_required',
      invocationRef: reservation.invocationRef,
      operationRef: command.operationRef,
      evidence: {
        attemptRef,
        effectGeneration: 1,
        requiredAt: new Date(now()).toISOString(),
        retry: 'reconcile_before_retry',
        evidenceSource: `operation:${command.operationRef}`,
      },
    }
  }

  if (preflightRefusal !== undefined) {
    return await refuseBeforeDispatch(preflightRefusal)
  }

  if (!hasCurrentOperationReader || current === undefined || descriptor === undefined) {
    return await refuseBeforeDispatch({
      kind: 'refused',
      operationRef: command.operationRef,
      code: 'invocation_runtime_unavailable',
      retryable: true,
    })
  }

  let authority: OperationInvokeAuthorityDecision
  try {
    authority = await runtime.policy.evaluateAuthority({
      principal: request.principal,
      grant,
      operation: current.operation,
      descriptor,
      input: command.input,
      operationRef: command.operationRef,
      invocationRef: reservation.invocationRef,
      idempotencyKey: command.idempotencyKey,
      correlationId: request.correlationId,
    })
  } catch {
    return await refuseBeforeDispatch({
      kind: 'refused',
      operationRef: command.operationRef,
      code: 'authority_reader_unavailable',
      retryable: true,
    })
  }
  authority = normalizeOperationInvokeAuthority({
    authority,
    principal: request.principal,
    grant,
    invocationRef: reservation.invocationRef,
  })
  if (authority.kind === 'needs_authority') {
    return {
      kind: 'needs_authority',
      invocationRef: reservation.invocationRef,
      operationRef: command.operationRef,
      authorityRequest: authority.authorityRequest,
    }
  }
  if (authority.kind === 'refused') {
    return await refuseBeforeDispatch({
      kind: 'refused',
      operationRef: command.operationRef,
      code: authority.code,
      retryable: authority.retryable,
      ...(authority.nextAction === undefined ? {} : { nextAction: authority.nextAction }),
    })
  }
  const persistedAuthority = buildOperationInvokeAuthority({
    authority,
    grant,
    operation: current.operation,
    descriptor,
    operationRef: command.operationRef,
    invocationRef: reservation.invocationRef,
    inputDigest,
    now: now(),
  })
  if (persistedAuthority === undefined) {
    return await refuseBeforeDispatch({
      kind: 'refused',
      operationRef: command.operationRef,
      code: 'authority_required',
      retryable: false,
    })
  }
  let dispatched: OperationInvokeDispatchResult
  try {
    dispatched = await runtime.dispatch({
      operation: current.operation,
      descriptor,
      principal: request.principal,
      grant,
      authority: persistedAuthority,
      invocationRef: reservation.invocationRef,
      idempotencyKey: command.idempotencyKey,
      input: command.input,
      correlationId: request.correlationId,
    })
  } catch {
    return await refuseBeforeDispatch({
      kind: 'refused',
      operationRef: command.operationRef,
      code: 'invocation_runtime_unavailable',
      retryable: true,
    })
  }
  if (dispatched.kind === 'outcome_unknown') return reconciliationRequiredAfterDispatch()
  if (dispatched.kind === 'refused') {
    return await refuseBeforeDispatch({
      kind: 'refused',
      operationRef: command.operationRef,
      code: dispatched.code,
      retryable: dispatched.retryable,
      ...(dispatched.nextAction === undefined ? {} : { nextAction: dispatched.nextAction }),
    })
  }
  return {
    kind: 'pending',
    invocationRef: reservation.invocationRef,
    operationRef: command.operationRef,
    retryAfterMs: dispatched.retryAfterMs ?? retryAfterMs,
  }
}

function normalizeOperationInvokeAuthority(input: Readonly<{
  authority: OperationInvokeAuthorityDecision
  principal: AgentAccessPrincipal
  grant: OperationInvokeGrant
  invocationRef: string
}>): OperationInvokeAuthorityDecision {
  if (
    input.authority.kind !== 'approved'
    || input.principal.authorityMode !== 'full_yolo'
    || input.authority.basis.kind !== 'approve_each'
  ) return input.authority
  return {
    kind: 'approved',
    basis: {
      kind: 'standing_mandate_use',
      mandateRef: `agent-access-grant:${input.grant.grantRef}`,
      mandateVersion: 1,
      mandateGeneration: input.grant.generation,
      authorityUseRef: `operation-authority-use:${input.invocationRef}`,
      grantEvidenceRef: `agent-access-grant-evidence:${input.grant.policyDigest}`,
    },
    expiresAt: input.authority.expiresAt,
  }
}

export function buildOperationInvokeAuthority(input: Readonly<{
  authority: OperationInvokeApprovedAuthority
  grant: OperationInvokeGrant
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  operationRef: string
  invocationRef: string
  inputDigest: string
  now: number
}>): OperationInvokePersistedAuthority | undefined {
  if (input.descriptor.price.kind !== 'fixed') return undefined
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
  const targetDigest = canonicalDigest(input.operation.identity as StableHashValue)
  const limits = { amount: input.descriptor.price.amount }
  const reference = input.authority.basis.kind === 'approve_each'
    ? input.authority.basis.authorityRef
    : `operation-authority:${input.invocationRef}`
  if (reference.trim().length === 0) return undefined
  const material = {
    format: 'operation-invoke-authority:v1',
    invocationRef: input.invocationRef,
    operationRef: input.operationRef,
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
  return {
    ...material,
    decisionDigest: canonicalDigest(material as StableHashValue),
  }
}

export async function executeOperationInvoke(
  input: OperationInvokeRequest,
  executor: OperationInvokeExecutor,
): Promise<OperationInvokeResult> {
  return await executor.invokeOperation(input)
}
