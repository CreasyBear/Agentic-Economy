import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { JsonValue } from '@/modules/capability-contract/public'
import {
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type {
  OperationExecuteInput,
  OperationExecuteResult,
} from './operation-execute.functions'
import type {
  ActionInvocationView,
  InvocationActor,
} from '@/modules/action-invocation/runtime'
import type { DynamicPublishedInvocationResult } from './legacy-dynamic/dynamic-published-contract'
import type { DynamicPublishedActionInvocationAdapter } from './legacy-dynamic/dynamic-published-adapter'
import {
  createInvocationApplication,
  type DevelopmentHostSourceCommands,
} from './legacy-dynamic/application-service'
import type { OperationInvokePersistedAuthority } from './internal/convex-schema'
import {
  type OperationInvokeRefusalCode,
  type OperationInvokeResult,
  type OperationInvokeUsageSummary,
} from './operation-invoke-contracts'
import type {
  OperationInvokeRecoveryResult,
  OperationInvokeStatusResult,
} from './operation-recovery-contracts'
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

export type OperationInvokeKeylessExecutor = (
  input: OperationExecuteInput & Readonly<{ correlationId?: string }>
) => Promise<OperationExecuteResult>

export type OperationInvokeAdapterFactory = (input: Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  principal: AgentAccessPrincipal
  grant: OperationInvokeGrant
  actor: InvocationActor
  origin: Readonly<{ kind: 'standalone'; callerRef: string; principalRef: string }>
  invocationRef: string
  idempotencyKey: string
  correlationId: string
}>) => Promise<DynamicPublishedActionInvocationAdapter>

/**
 * Reject only while enqueue is definitely uncommitted. Once enqueue may have
 * started, resolve `outcome_unknown` so the reservation remains reconcilable.
 */
export type OperationInvokeDispatchResult =
  | Readonly<{ kind: 'enqueued'; retryAfterMs?: number }>
  | Readonly<{ kind: 'outcome_unknown' }>
  | Readonly<{
      kind: 'refused'
      code: OperationInvokeRefusalCode
      retryable: boolean
      nextAction?: string
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
  currentOperation?: OperationInvokeCurrentOperationReader
  policy: OperationInvokePolicyReader
  idempotency: OperationInvokeIdempotencyPort
  /**
   * Production dispatch is the durable path. The adapter is retained only for
   * explicit development/test callers that do not provide dispatch.
   */
  dispatch?: OperationInvokeDispatchPort
  createAdapter?: OperationInvokeAdapterFactory
  sourceCommands?: DevelopmentHostSourceCommands
  recovery?: OperationInvokeRecoveryPort
  executeKeyless?: OperationInvokeKeylessExecutor
  keylessUsage?: OperationInvokeUsageSummary
  now?: () => number
  freshnessMs?: number
  retryAfterMs?: number
}>

export type OperationInvokeContinuation =
  | Readonly<{ kind: 'completed'; view: ActionInvocationView<DynamicPublishedInvocationResult> }>
  | Readonly<{ kind: 'reconciled'; view: ActionInvocationView<DynamicPublishedInvocationResult> }>
  | Readonly<{ kind: 'refused'; code: string; view?: ActionInvocationView<DynamicPublishedInvocationResult> }>

export type OperationInvokeExecutor = Readonly<{
  invokeOperation(input: OperationInvokeRequest): Promise<OperationInvokeResult>
}>

export type OperationInvokeService = OperationInvokeExecutor & Readonly<{
  readInvocationStatus(input: OperationInvokeRecoveryRequest): Promise<OperationInvokeStatusResult>
  cancelInvocation(input: OperationInvokeRecoveryRequest & Readonly<{ idempotencyKey: string }>): Promise<OperationInvokeRecoveryResult>
  reconcileInvocation(input: OperationInvokeRecoveryRequest & Readonly<{ evidence: Record<string, unknown>; idempotencyKey: string }>): Promise<OperationInvokeRecoveryResult>
}>

export function createOperationInvokeApplication(
  runtime: OperationInvokeRuntime,
): OperationInvokeService {
  const now = runtime.now ?? Date.now
  const freshnessMs = runtime.freshnessMs ?? 30_000
  const retryAfterMs = runtime.retryAfterMs ?? 1_000

  const invokeOperation = async (
    request: OperationInvokeRequest,
  ): Promise<OperationInvokeResult> => {
    const admitted = await admitOperationInvoke({
      request,
      policy: runtime.policy,
      currentOperation: runtime.currentOperation,
      executeKeylessAvailable: runtime.executeKeyless !== undefined,
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
      freshnessMs,
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
  freshnessMs: number
  retryAfterMs: number
}>): Promise<OperationInvokeResult> {
  const { runtime, request, admitted, reserved, now, freshnessMs, retryAfterMs } = input
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
  const reconciliationRequiredAfterDispatch = (
    view?: ActionInvocationView<DynamicPublishedInvocationResult>,
  ): OperationInvokeResult => {
    const defaultAttemptRef = `operation-attempt:${reservation.invocationRef}:1`
    const viewAttemptRef = view !== undefined
      && (view.control.state === 'leased' || view.control.state === 'reconciliation_required')
      ? view.control.attemptRef
      : undefined
    const attemptRef = viewAttemptRef ?? view?.attempts.at(-1)?.attemptRef ?? defaultAttemptRef
    const attempt = view?.attempts.find(({ attemptRef: candidate }) => candidate === attemptRef)
    const effectGeneration = attempt?.effectGeneration
      ?? (view !== undefined && view.control.state === 'leased' ? view.control.effectGeneration : 1)
    const requiredAt = attempt !== undefined
      && (attempt.outcome.state === 'uncertain' || attempt.outcome.state === 'timed_out')
      ? attempt.outcome.reconciliationRequiredAt
      : new Date(now()).toISOString()
    return {
      kind: 'reconciliation_required',
      invocationRef: reservation.invocationRef,
      operationRef: command.operationRef,
      evidence: {
        attemptRef,
        effectGeneration,
        requiredAt,
        retry: 'reconcile_before_retry',
        evidenceSource: `operation:${command.operationRef}`,
      },
    }
  }

  if (preflightRefusal !== undefined) {
    return await refuseBeforeDispatch(preflightRefusal)
  }
  if (runtime.currentOperation === undefined && runtime.executeKeyless !== undefined) {
    try {
      const result = await runtime.executeKeyless({
        operationRef: command.operationRef,
        input: command.input,
        correlationId: request.correlationId,
      })
      if (result.kind === 'ok') {
        if (runtime.keylessUsage === undefined) {
          return await refuseBeforeDispatch({
            kind: 'refused',
            operationRef: command.operationRef,
            code: 'operation_unsupported',
            retryable: false,
          })
        }
        const output = result.output as JsonValue
        try {
          canonicalDigest(output)
        } catch {
          return await refuseBeforeDispatch({
            kind: 'refused',
            operationRef: command.operationRef,
            code: 'result_invalid',
            retryable: false,
          })
        }
        return {
          kind: 'completed',
          invocationRef: reservation.invocationRef,
          operationRef: command.operationRef,
          output,
          evidenceHash: result.evidenceHash,
          usage: runtime.keylessUsage,
        }
      }
      if (result.kind === 'refused') {
        return await refuseBeforeDispatch({
          kind: 'refused',
          operationRef: command.operationRef,
          code: result.reason === 'input_invalid' ? 'input_invalid' : 'provider_refused',
          retryable: false,
        })
      }
      return await refuseBeforeDispatch({
        kind: 'refused',
        operationRef: command.operationRef,
        code: result.code === 'source_unavailable' ? 'source_unavailable' : 'provider_refused',
        retryable: result.retryable,
      })
    } catch {
      return await refuseBeforeDispatch({
        kind: 'refused',
        operationRef: command.operationRef,
        code: 'provider_refused',
        retryable: true,
      })
    }
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
  if (runtime.dispatch !== undefined) {
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

  if (runtime.createAdapter === undefined || runtime.sourceCommands === undefined) {
    return await refuseBeforeDispatch({
      kind: 'refused',
      operationRef: command.operationRef,
      code: 'invocation_runtime_unavailable',
      retryable: true,
    })
  }

  let adapter: DynamicPublishedActionInvocationAdapter
  try {
    adapter = await runtime.createAdapter({
      operation: current.operation,
      descriptor,
      principal: request.principal,
      grant,
      actor: {
        callerRef: request.principal.credentialId,
        principalRef: request.principal.principalId,
      },
      origin: {
        kind: 'standalone',
        callerRef: request.principal.credentialId,
        principalRef: request.principal.principalId,
      },
      invocationRef: reservation.invocationRef,
      idempotencyKey: command.idempotencyKey,
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

  const actor: InvocationActor = {
    callerRef: request.principal.credentialId,
    principalRef: request.principal.principalId,
  }
  const host = createInvocationApplication({
    adapter,
    sourceCommands: runtime.sourceCommands,
  }).bindStandalone({ actor })
  let prepared: ActionInvocationView<DynamicPublishedInvocationResult>
  try {
    prepared = await host.prepare(
      command.input,
      freshnessMs,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const code: OperationInvokeRefusalCode = message.includes('input_invalid')
      ? 'input_invalid'
      : message.includes('not_current')
        ? 'operation_not_current'
        : message.includes('price_not_fixed')
          ? 'operation_unsupported'
          : 'invocation_runtime_unavailable'
    return await refuseBeforeDispatch({
      kind: 'refused',
      operationRef: command.operationRef,
      code,
      retryable: code === 'invocation_runtime_unavailable',
    })
  }
  if (prepared.authority === undefined) {
    return await refuseBeforeDispatch({
      kind: 'refused',
      operationRef: command.operationRef,
      code: 'authority_required',
      retryable: false,
    })
  }

  let continuation: OperationInvokeContinuation
  let continuationStarted = false
  const continueInvocation = async (): Promise<OperationInvokeContinuation> => {
    continuationStarted = true
    return await host.continue(prepared.invocationRef)
  }
  try {
    if (authority.basis.kind === 'standing_mandate_use') {
      const authorized = await adapter.authorizeStandingMandateUse({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: prepared.invocationVersion,
        authorityRef: prepared.authority.reference,
        actor,
        origin: {
          kind: 'standalone',
          callerRef: actor.callerRef,
          principalRef: actor.principalRef,
        },
        basis: authority.basis,
      })
      continuation = authorized.kind === 'refused'
        ? authorized
        : await continueInvocation()
    } else {
      const decided = await host.decide(prepared.invocationRef, true)
      continuation = decided.kind === 'refused'
        ? decided
        : await continueInvocation()
    }
  } catch {
    if (continuationStarted) {
      let view: ActionInvocationView<DynamicPublishedInvocationResult> | undefined
      try {
        view = host.inspect(prepared.invocationRef)
      } catch {
        view = undefined
      }
      return reconciliationRequiredAfterDispatch(view)
    }
    return await refuseBeforeDispatch({
      kind: 'refused',
      operationRef: command.operationRef,
      code: 'invocation_runtime_unavailable',
      retryable: true,
    })
  }
  if (continuation.kind === 'refused') {
    const code = continuation.code === 'reconcile_before_retry'
      ? 'reconciliation_required'
      : continuation.code === 'pre_execute_preparation_failed'
        ? 'pre_release_failed'
        : continuation.code === 'invocation_not_found'
          ? 'invocation_not_found'
          : 'provider_refused'
    const refusal: Extract<OperationInvokeResult, { kind: 'refused' }> = {
      kind: 'refused',
      operationRef: command.operationRef,
      code,
      retryable: code === 'pre_release_failed',
      ...(code === 'reconciliation_required'
        ? { nextAction: 'Reconcile the invocation before retrying.' }
        : {}),
    }
    const workStarted = continuation.view?.control.state === 'leased'
      || continuation.view?.control.state === 'in_progress'
      || continuation.view?.control.state === 'reconciliation_required'
      || continuation.view?.control.state === 'terminal'
    return workStarted ? refusal : await refuseBeforeDispatch(refusal)
  }
  const projected = projectDynamicInvocation({
    operationRef: command.operationRef,
    invocationRef: prepared.invocationRef,
    view: continuation.view,
    now: now(),
    retryAfterMs,
  })
  if (projected.kind === 'refused') {
    const workStarted = continuation.view.control.state === 'leased'
      || continuation.view.control.state === 'in_progress'
      || continuation.view.control.state === 'reconciliation_required'
      || continuation.view.control.state === 'terminal'
    return workStarted ? projected : await refuseBeforeDispatch(projected)
  }
  return projected
}

function projectDynamicInvocation(input: Readonly<{
  operationRef: string
  invocationRef: string
  view: ActionInvocationView<DynamicPublishedInvocationResult>
  now: number
  retryAfterMs: number
}>): OperationInvokeResult {
  const observed = input.view.observedResolution
  if (observed.state === 'returned') {
    const result = observed.result
    if (result.kind === 'published_operation_succeeded' && result.output !== undefined) {
      let evidenceHash = result.responseDigest
      try {
        evidenceHash = evidenceHash ?? canonicalDigest(result.output)
      } catch {
        return {
          kind: 'refused',
          operationRef: input.operationRef,
          code: 'result_invalid',
          retryable: false,
        }
      }
      const usage = result.usage
      return usage === undefined
        ? {
            kind: 'refused',
            operationRef: input.operationRef,
            code: 'operation_unsupported',
            retryable: false,
          }
        : {
            kind: 'completed',
            invocationRef: input.invocationRef,
            operationRef: input.operationRef,
            output: result.output as JsonValue,
            evidenceHash,
            usage: { ...usage, durationMs: Math.max(0, input.now - Date.parse(input.view.prepared?.preparedAt ?? new Date(input.now).toISOString())) },
          }
    }
    return {
      kind: 'refused',
      operationRef: input.operationRef,
      code: result.kind === 'published_operation_invalid_evidence' ? 'result_invalid' : 'provider_refused',
      retryable: false,
    }
  }
  if (
    input.view.control.state === 'reconciliation_required'
    || observed.state === 'timed_out'
    || input.view.attempts.some((attempt) => attempt.outcome.state === 'uncertain' || attempt.outcome.state === 'timed_out')
  ) {
    const attemptRef = input.view.control.state === 'reconciliation_required'
      ? input.view.control.attemptRef
      : input.view.attempts.at(-1)?.attemptRef
    if (attemptRef === undefined) {
      return {
        kind: 'refused',
        operationRef: input.operationRef,
        code: 'outcome_unknown',
        retryable: false,
        nextAction: 'Read invocation status for reconciliation details.',
      }
    }
    const attempt = input.view.attempts.find(({ attemptRef: candidate }) => candidate === attemptRef)
    const requiredAt = attempt !== undefined
      && (attempt.outcome.state === 'uncertain' || attempt.outcome.state === 'timed_out')
      ? attempt.outcome.reconciliationRequiredAt
      : new Date(input.now).toISOString()
    return {
      kind: 'reconciliation_required',
      invocationRef: input.invocationRef,
      operationRef: input.operationRef,
      evidence: {
        attemptRef,
        effectGeneration: attempt?.effectGeneration ?? 1,
        requiredAt,
        retry: 'reconcile_before_retry',
        evidenceSource: `published-operation:${input.operationRef}`,
      },
    }
  }
  if (input.view.control.state === 'terminal' && observed.state === 'threw') {
    return {
      kind: 'refused',
      operationRef: input.operationRef,
      code: 'provider_refused',
      retryable: false,
    }
  }
  return {
    kind: 'pending',
    invocationRef: input.invocationRef,
    operationRef: input.operationRef,
    retryAfterMs: input.retryAfterMs,
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

export type OperationInvokeInternalResult = Readonly<{
  result: OperationInvokeResult
  dynamicResult?: DynamicPublishedInvocationResult
}>
