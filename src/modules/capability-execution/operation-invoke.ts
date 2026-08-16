import { z } from 'zod'

import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { jsonValueSchema, type JsonValue } from '@/modules/capability-contract/public'
import {
  isPublicOperationRef,
  materializeRuntimePublishedOperation,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type {
  OperationExecuteInput,
  OperationExecuteResult,
} from './operation-execute.functions'
import {
  exactAmountSchema,
  type ExactAmount,
  type MoneyUsageEvent,
} from '@/modules/money/public'
import type {
  ActionInvocationView,
  StandingMandateAuthorityBasis,
  InvocationActor,
} from '@/modules/action-invocation/contracts'
import type { DynamicPublishedInvocationResult } from '@/modules/action-invocation/dynamic-published-contract'
import type { DynamicPublishedActionInvocationAdapter } from '@/modules/action-invocation/dynamic-published-adapter'
import {
  createInvocationApplication,
  type DevelopmentHostSourceCommands,
} from '@/modules/action-invocation/application-service'
import type { OperationInvokePersistedAuthority } from './internal/convex-schema'

export const operationInvokeRefusalCodeValues = [
  'operation_ref_invalid',
  'operation_not_found',
  'operation_not_current',
  'operation_not_ready',
  'operation_unsupported',
  'input_invalid',
  'grant_not_found',
  'grant_revoked',
  'grant_expired',
  'grant_generation_stale',
  'environment_mismatch',
  'rate_limited',
  'concurrency_limited',
  'budget_exceeded',
  'idempotency_conflict',
  'invocation_runtime_unavailable',
  'authority_reader_unavailable',
  'authority_required',
  'authority_denied',
  'provider_refused',
  'pre_release_failed',
  'outcome_unknown',
  'reconciliation_required',
  'invocation_not_found',
  'invocation_cancelled',
  'lease_not_current',
  'result_invalid',
  'source_unavailable',
] as const
export const operationInvokeRefusalCodeSchema = z.enum(operationInvokeRefusalCodeValues)

export const operationInvokeStatusStateValues = [
  'gathering_information',
  'awaiting_authority',
  'authorized',
  'leased',
  'in_progress',
  'retryable',
  'reconciliation_required',
  'terminal',
  'cancelled',
  'invalidated',
] as const
export const operationInvokeStatusStateSchema = z.enum(operationInvokeStatusStateValues)

export const operationInvokeStatusRefusalCodeValues = [
  'invocation_not_found',
  'grant_not_found',
  'grant_revoked',
  'grant_expired',
  'grant_generation_stale',
  'environment_mismatch',
  'invocation_runtime_unavailable',
] as const
export const operationInvokeStatusRefusalCodeSchema = z.enum(operationInvokeStatusRefusalCodeValues)

const operationInvokeChargeStateSchema = z.enum([
  'free_tier',
  'paid',
  'insufficient_credit',
  'outcome_unknown',
  'refunded',
])

export const operationInvokeInputSchema: z.ZodType<OperationInvokeInput> = z.strictObject({
  operationRef: z.string().trim().min(1).max(300),
  input: z.record(z.string(), jsonValueSchema),
  idempotencyKey: z.string().trim().min(1).max(200),
})

const authorityRequestSchema = z.strictObject({
  kind: z.enum(['approve_each', 'bounded_mandate']),
  operationRef: z.string(),
  consequence: z.enum(['read_only', 'communication', 'external_effect']),
  retryClass: z.enum(['replayable', 'attributable_retry', 'reconcile_before_retry']),
  maximumSpend: exactAmountSchema.exactOptional(),
  dataFields: z.array(z.string()),
  expiresAt: z.string().exactOptional(),
})
const reconciliationStateSchema = z.strictObject({
  attemptRef: z.string(),
  effectGeneration: z.number(),
  requiredAt: z.string(),
  retry: z.literal('reconcile_before_retry'),
  evidenceSource: z.string(),
})

export type OperationInvokeInput = Readonly<{
  operationRef: string
  input: Record<string, JsonValue>
  idempotencyKey: string
}>
export type PublicAuthorityRequest = Readonly<{
  kind: 'approve_each' | 'bounded_mandate'
  operationRef: string
  consequence: RuntimePublishedOperationDescriptor['consequenceClass']
  retryClass: RuntimePublishedOperationDescriptor['retryClass']
  maximumSpend?: ExactAmount
  dataFields: readonly string[]
  expiresAt?: string
}>

export type PublicReconciliationState = Readonly<{
  attemptRef: string
  effectGeneration: number
  requiredAt: string
  retry: 'reconcile_before_retry'
  evidenceSource: string
}>


export type OperationInvokeRequest = Readonly<{
  input: OperationInvokeInput
  principal: AgentAccessPrincipal
  correlationId: string
}>

export type OperationInvokeKeylessExecutor = (
  input: OperationExecuteInput & Readonly<{ correlationId?: string }>
) => Promise<OperationExecuteResult>

export type OperationInvokeUsageSummary = Readonly<{
  usageRef: string
  observedAt: number
  chargeState: MoneyUsageEvent['chargeState']
  amount: ExactAmount
  priceDigest: string
  transactionRef?: string
  durationMs?: number
}>

export const operationInvokeUsageSchema: z.ZodType<OperationInvokeUsageSummary> = z.strictObject({
  usageRef: z.string().min(1),
  observedAt: z.number().int().nonnegative(),
  chargeState: operationInvokeChargeStateSchema,
  amount: exactAmountSchema,
  priceDigest: z.string().min(1),
  transactionRef: z.string().min(1).exactOptional(),
  durationMs: z.number().int().nonnegative().exactOptional(),
})

export const operationInvokeResultKindValues = [
  'completed',
  'pending',
  'needs_authority',
  'reconciliation_required',
  'refused',
] as const
export const operationInvokeResultSchema: z.ZodType<OperationInvokeResult> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal(operationInvokeResultKindValues[0]),
    invocationRef: z.string(),
    operationRef: z.string(),
    output: jsonValueSchema,
    evidenceHash: z.string(),
    usage: operationInvokeUsageSchema,
  }),
  z.strictObject({
    kind: z.literal(operationInvokeResultKindValues[1]),
    invocationRef: z.string(),
    operationRef: z.string(),
    retryAfterMs: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal(operationInvokeResultKindValues[2]),
    invocationRef: z.string(),
    operationRef: z.string(),
    authorityRequest: authorityRequestSchema,
  }),
  z.strictObject({
    kind: z.literal(operationInvokeResultKindValues[3]),
    invocationRef: z.string(),
    operationRef: z.string(),
    evidence: reconciliationStateSchema,
  }),
  z.strictObject({
    kind: z.literal(operationInvokeResultKindValues[4]),
    operationRef: z.string().exactOptional(),
    code: operationInvokeRefusalCodeSchema,
    retryable: z.boolean(),
    nextAction: z.string().exactOptional(),
  }),
])

export type OperationInvokeRefusalCode = (typeof operationInvokeRefusalCodeValues)[number]

export type OperationInvokeResult =
  | Readonly<{
      kind: 'completed'
      invocationRef: string
      operationRef: string
      output: JsonValue
      evidenceHash: string
      usage: OperationInvokeUsageSummary
    }>
  | Readonly<{
      kind: 'pending'
      invocationRef: string
      operationRef: string
      retryAfterMs: number
    }>
  | Readonly<{
      kind: 'needs_authority'
      invocationRef: string
      operationRef: string
      authorityRequest: PublicAuthorityRequest
    }>
  | Readonly<{
      kind: 'reconciliation_required'
      invocationRef: string
      operationRef: string
      evidence: PublicReconciliationState
    }>
  | Readonly<{
      kind: 'refused'
      operationRef?: string
      code: OperationInvokeRefusalCode
      retryable: boolean
      nextAction?: string
    }>



export type OperationInvokeGrant = Readonly<{
  grantRef: string
  principalId: string
  ownerId: string
  applicationRef: string
  credentialId: string
  environment: AgentAccessPrincipal['environment']
  generation: number
  policyDigest: string
  expiresAt: number
  lifecycle: 'active'
  operationAccess: 'all_admitted'
}>

export type OperationInvokeGrantDecision =
  | Readonly<{ kind: 'granted'; grant: OperationInvokeGrant }>
  | Readonly<{
      kind: 'refused'
      code: Extract<OperationInvokeRefusalCode, 'grant_not_found' | 'grant_revoked' | 'grant_expired' | 'grant_generation_stale' | 'environment_mismatch' | 'rate_limited' | 'concurrency_limited' | 'budget_exceeded'>
      retryable: boolean
      nextAction?: string
    }>

export type OperationInvokeAuthorityDecision =
  | Readonly<{
      kind: 'approved'
      basis: Readonly<{ kind: 'approve_each'; authorityRef: string }> | StandingMandateAuthorityBasis
      expiresAt: string
    }>
  | Readonly<{
      kind: 'needs_authority'
      authorityRequest: PublicAuthorityRequest
    }>
  | Readonly<{
      kind: 'refused'
      code: Extract<OperationInvokeRefusalCode, 'authority_reader_unavailable' | 'authority_required' | 'budget_exceeded' | 'rate_limited' | 'concurrency_limited'>
      retryable: boolean
      nextAction?: string
    }>

export type OperationInvokeCurrentOperation = Readonly<{
  operation: PublishedOperation
  operationRef?: string
  descriptor?: RuntimePublishedOperationDescriptor
}>
export const operationEnvironmentMismatchNextAction =
  'Use a grant issued for the operation runtime environment.'

export function isPrincipalEnvironmentCompatibleWithOperation(
  principalEnvironment: AgentAccessPrincipal['environment'],
  operation: Pick<PublishedOperation, 'runtimeEnvironment'>,
): boolean {
  return principalEnvironment === operation.runtimeEnvironment
}


export type OperationInvokeCurrentOperationReader = (input: Readonly<{
  operationRef: string
  principal: AgentAccessPrincipal
  correlationId: string
  now: number
}>) => Promise<OperationInvokeCurrentOperation | undefined>

export type OperationInvokePolicyReader = Readonly<{
  readGrant(input: Readonly<{
    principal: AgentAccessPrincipal
    operationRef: string
    correlationId: string
  }>): Promise<OperationInvokeGrantDecision>
  evaluateAuthority(input: Readonly<{
    principal: AgentAccessPrincipal
    grant: OperationInvokeGrant
    operation: PublishedOperation
    descriptor: RuntimePublishedOperationDescriptor
    input: Record<string, unknown>
    operationRef: string
    invocationRef: string
    idempotencyKey: string
    correlationId: string
  }>): Promise<OperationInvokeAuthorityDecision>
}>

export type OperationInvokeIdempotencyReservation = Readonly<{
  principalId: string
  credentialId: string
  applicationRef: string
  grantRef: string
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  environment: AgentAccessPrincipal['environment']
  operationRef: string
  idempotencyKey: string
  inputDigest: string
  requestDigest: string
  invocationRef: string
}>

export type OperationInvokePortRefusal = Readonly<{
  kind: 'refused'
  code: Extract<OperationInvokeRefusalCode, 'grant_not_found' | 'grant_revoked' | 'grant_expired' | 'grant_generation_stale' | 'environment_mismatch' | 'rate_limited' | 'concurrency_limited'>
  retryable: boolean
  nextAction?: string
}>

export type OperationInvokeIdempotencyAbandonment = OperationInvokeIdempotencyReservation & Readonly<{
  ownerId: string
}>

export type OperationInvokeIdempotencyAbandonmentResult =
  | Readonly<{ kind: 'abandoned' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'dispatch_started' }>

export type OperationInvokeIdempotencyPort = Readonly<{
  reserve(input: OperationInvokeIdempotencyReservation): Promise<
    | Readonly<{ kind: 'reserved'; reservation: OperationInvokeIdempotencyReservation }>
    | Readonly<{ kind: 'replayed'; reservation: OperationInvokeIdempotencyReservation }>
    | Readonly<{ kind: 'conflict' }>
    | OperationInvokePortRefusal
  >
  abandon(input: OperationInvokeIdempotencyAbandonment): Promise<OperationInvokeIdempotencyAbandonmentResult>
  readReplay?(input: Readonly<{
    invocationRef: string
    principal: AgentAccessPrincipal
    correlationId: string
  }>): Promise<OperationInvokeResult | undefined>
}>



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

export type OperationInvokeApprovedAuthority = Extract<OperationInvokeAuthorityDecision, { kind: 'approved' }>

export type OperationInvokeRecoveryRequest = Readonly<{
  invocationRef: string
  principal: AgentAccessPrincipal
  correlationId: string
}>

export type OperationInvokeStatusState = z.infer<typeof operationInvokeStatusStateSchema>

export type OperationInvokeStatusResult =
  | Readonly<{
      kind: 'found'
      invocationRef: string
      operationRef: string
      state: OperationInvokeStatusState
      usage?: OperationInvokeUsageSummary
      evidenceHash?: string
      attemptRef?: string
      effectGeneration?: number
      result?: OperationInvokeResult
    }>
  | Readonly<{
      kind: 'refused'
      invocationRef: string
      code: Extract<OperationInvokeRefusalCode, 'invocation_not_found' | 'grant_not_found' | 'grant_revoked' | 'grant_expired' | 'grant_generation_stale' | 'environment_mismatch' | 'invocation_runtime_unavailable'>
      retryable: boolean
      nextAction?: string
    }>
export type OperationInvokeRecoveryResult =
  | OperationInvokeStatusResult
  | Readonly<{
      kind: 'reconciliation_required'
      invocationRef: string
      operationRef: string
      evidence: PublicReconciliationState
    }>

export type OperationInvokeRecoveryPort = Readonly<{
  read(input: OperationInvokeRecoveryRequest): Promise<OperationInvokeStatusResult>
  cancel(input: OperationInvokeRecoveryRequest & Readonly<{ idempotencyKey: string }>): Promise<OperationInvokeRecoveryResult>
  reconcile(input: OperationInvokeRecoveryRequest & Readonly<{ evidence: Record<string, unknown>; idempotencyKey: string }>): Promise<OperationInvokeRecoveryResult>
}>
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

export type OperationInvokeService = OperationInvokeExecutor & Readonly<{
  readInvocationStatus(input: OperationInvokeRecoveryRequest): Promise<OperationInvokeStatusResult>
  cancelInvocation(input: OperationInvokeRecoveryRequest & Readonly<{ idempotencyKey: string }>): Promise<OperationInvokeRecoveryResult>
  reconcileInvocation(input: OperationInvokeRecoveryRequest & Readonly<{ evidence: Record<string, unknown>; idempotencyKey: string }>): Promise<OperationInvokeRecoveryResult>
}>

export type OperationInvokeExecutor = Readonly<{
  invokeOperation(input: OperationInvokeRequest): Promise<OperationInvokeResult>
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
    const parsedInput = operationInvokeInputSchema.safeParse(request.input)
    if (!parsedInput.success || !isPublicOperationRef(parsedInput.data.operationRef)) {
      return { kind: 'refused', code: 'operation_ref_invalid', retryable: false }
    }
    const command = parsedInput.data
    let inputDigest: string
    let requestDigest: string
    try {
      inputDigest = canonicalDigest(command.input)
      requestDigest = canonicalDigest({
        operationRef: command.operationRef,
        input: command.input,
      })
    } catch {
      return {
        kind: 'refused',
        operationRef: command.operationRef,
        code: 'input_invalid',
        retryable: false,
      }
    }

    let grantDecision: OperationInvokeGrantDecision
    try {
      grantDecision = await runtime.policy.readGrant({
        principal: request.principal,
        operationRef: command.operationRef,
        correlationId: request.correlationId,
      })
    } catch {
      return {
        kind: 'refused',
        operationRef: command.operationRef,
        code: 'grant_not_found',
        retryable: true,
        nextAction: 'Refresh the agent grant and retry.',
      }
    }
    if (grantDecision.kind === 'refused') {
      return {
        operationRef: command.operationRef,
        kind: 'refused',
        code: grantDecision.code,
        retryable: grantDecision.retryable,
        ...(grantDecision.nextAction === undefined ? {} : { nextAction: grantDecision.nextAction }),
      }
    }
    const grant = grantDecision.grant
    const invocationRef = canonicalOperationInvocationRef({
      principalId: request.principal.principalId,
      credentialId: request.principal.credentialId,
      applicationRef: request.principal.applicationRef,
      grantGeneration: grant.generation,
      environment: request.principal.environment,
      operationRef: command.operationRef,
      idempotencyKey: command.idempotencyKey,
    })
    const hasCurrentOperationReader = runtime.currentOperation !== undefined
    let current: OperationInvokeCurrentOperation | undefined
    let descriptor: RuntimePublishedOperationDescriptor | undefined
    let preflightRefusal: Extract<OperationInvokeResult, { kind: 'refused' }> | undefined
    if (hasCurrentOperationReader) {
      try {
        current = await runtime.currentOperation!({
          operationRef: command.operationRef,
          principal: request.principal,
          correlationId: request.correlationId,
          now: now(),
        })
      } catch (error) {
        const unsupported = error instanceof Error && error.message === 'operation_unsupported'
        preflightRefusal = {
          kind: 'refused',
          operationRef: command.operationRef,
          code: unsupported ? 'operation_unsupported' : 'source_unavailable',
          retryable: !unsupported,
        }
      }
      if (preflightRefusal === undefined && (current === undefined
        || (current.operationRef !== undefined && current.operationRef !== command.operationRef))) {
        preflightRefusal = {
          kind: 'refused',
          operationRef: command.operationRef,
          code: 'operation_not_current',
          retryable: false,
        }
      }
      if (preflightRefusal === undefined && current !== undefined) {
        try {
          descriptor = current.descriptor ?? materializeRuntimePublishedOperation(current.operation)
        } catch {
          preflightRefusal = {
            kind: 'refused',
            operationRef: command.operationRef,
            code: 'operation_unsupported',
            retryable: false,
          }
        }
      }
      if (preflightRefusal === undefined && current !== undefined && descriptor !== undefined) {
        let inputValid = false
        try {
          inputValid = descriptor.validateInput(command.input)
        } catch {
          preflightRefusal = {
            kind: 'refused',
            operationRef: command.operationRef,
            code: 'operation_unsupported',
            retryable: false,
          }
        }
        if (preflightRefusal === undefined && (
          descriptor.target.publicationRef !== current.operation.identity.publicationRef
          || descriptor.target.publicationRevision !== current.operation.identity.publicationRevision
          || descriptor.target.contractDigest !== current.operation.identity.contractDigest
          || descriptor.target.transportConfigDigest !== current.operation.identity.transportConfigDigest
          || !inputValid
        )) {
          preflightRefusal = {
            kind: 'refused',
            operationRef: command.operationRef,
            code: inputValid ? 'operation_not_current' : 'input_invalid',
            retryable: false,
          }
        }
        if (preflightRefusal === undefined && !isPrincipalEnvironmentCompatibleWithOperation(request.principal.environment, current.operation)) {
          preflightRefusal = {
            kind: 'refused',
            operationRef: command.operationRef,
            code: 'environment_mismatch',
            retryable: false,
            nextAction: operationEnvironmentMismatchNextAction,
          }
        }
      }
    } else if (runtime.executeKeyless === undefined) {
      preflightRefusal = {
        kind: 'refused',
        operationRef: command.operationRef,
        code: 'invocation_runtime_unavailable',
        retryable: true,
      }
    }
    // Keep preflight before new reservation work, but reserve to resolve an existing idempotent replay.
    let reservationMayBeAbandoned = false
    let reservation: OperationInvokeIdempotencyReservation
    try {
      const reserved = await runtime.idempotency.reserve({
        principalId: request.principal.principalId,
        credentialId: request.principal.credentialId,
        applicationRef: request.principal.applicationRef,
        grantRef: grant.grantRef,
        grantGeneration: grant.generation,
        policyDigest: grant.policyDigest,
        grantExpiresAt: grant.expiresAt,
        environment: request.principal.environment,
        operationRef: command.operationRef,
        idempotencyKey: command.idempotencyKey,
        inputDigest,
        requestDigest,
        invocationRef,
      })
      if (reserved.kind === 'conflict') {
        return {
          kind: 'refused',
          operationRef: command.operationRef,
          code: 'idempotency_conflict',
          retryable: false,
          nextAction: 'Use a new idempotency key for changed input.',
        }
      }
      if (reserved.kind === 'refused') {
        return {
          kind: 'refused',
          operationRef: command.operationRef,
          code: reserved.code,
          retryable: reserved.retryable,
          ...(reserved.nextAction === undefined ? {} : { nextAction: reserved.nextAction }),
        }
      }
      reservation = reserved.reservation
      if (reserved.kind === 'reserved') reservationMayBeAbandoned = true
      if (reserved.kind === 'replayed') {
        const readReplay = runtime.idempotency.readReplay
        if (readReplay === undefined) {
          return {
            kind: 'refused',
            operationRef: command.operationRef,
            code: 'invocation_runtime_unavailable',
            retryable: true,
            nextAction: 'Retry after the invocation store is available.',
          }
        }
        let replay: OperationInvokeResult | undefined
        try {
          replay = await readReplay({
            invocationRef: reservation.invocationRef,
            principal: request.principal,
            correlationId: request.correlationId,
          })
        } catch {
          return {
            kind: 'refused',
            operationRef: command.operationRef,
            code: 'invocation_runtime_unavailable',
            retryable: true,
            nextAction: 'Retry after the invocation store is available.',
          }
        }
        if (replay !== undefined) return replay
        reservationMayBeAbandoned = true
      }
    } catch {
      return {
        kind: 'refused',
        operationRef: command.operationRef,
        code: 'invocation_runtime_unavailable',
        retryable: true,
        nextAction: 'Retry after the invocation store is available.',
      }
    }
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
      const fallbackAttemptRef = `operation-attempt:${reservation.invocationRef}:1`
      const viewAttemptRef = view !== undefined
        && (view.control.state === 'leased' || view.control.state === 'reconciliation_required')
        ? view.control.attemptRef
        : undefined
      const attemptRef = viewAttemptRef ?? view?.attempts.at(-1)?.attemptRef ?? fallbackAttemptRef
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

  const unavailableRecovery = (invocationRef: string): OperationInvokeStatusResult => ({
    kind: 'refused',
    invocationRef,
    code: 'invocation_runtime_unavailable',
    retryable: true,
    nextAction: 'Retry after the invocation store is available.',
  })

  return Object.freeze({
    invokeOperation,
    readInvocationStatus: async (input) => (
      runtime.recovery === undefined
        ? unavailableRecovery(input.invocationRef)
        : await runtime.recovery.read(input)
    ),
    cancelInvocation: async (input) => (
      runtime.recovery === undefined
        ? unavailableRecovery(input.invocationRef)
        : await runtime.recovery.cancel(input)
    ),
    reconcileInvocation: async (input) => (
      runtime.recovery === undefined
        ? unavailableRecovery(input.invocationRef)
        : await runtime.recovery.reconcile(input)
    ),
  })
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
  if (
    !Number.isFinite(authorityExpiresAt)
    || !Number.isFinite(grantExpiresAt)
    || authorityExpiresAt <= input.now
    || grantExpiresAt <= input.now
  ) return undefined
  const effectiveExpiresAt = Math.min(authorityExpiresAt, grantExpiresAt)
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

export function canonicalOperationInvocationRef(input: Readonly<{
  principalId: string
  credentialId: string
  applicationRef: string
  grantGeneration: number
  environment: AgentAccessPrincipal['environment']
  operationRef: string
  idempotencyKey: string
}>): string {
  return `operation-invocation:v1:${canonicalDigest(input).slice(7)}`
}

export type OperationInvokeInternalResult = Readonly<{
  result: OperationInvokeResult
  dynamicResult?: DynamicPublishedInvocationResult
}>
