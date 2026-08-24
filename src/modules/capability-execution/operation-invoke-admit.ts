import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import {
  isPublicOperationRef,
  materializeRuntimePublishedOperation,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StandingMandateAuthorityBasis } from '@/modules/action-invocation/runtime'
import { currentOperationDigest } from './current-operation-commitment'
import {
  operationEnvironmentMismatchNextAction,
  operationInvokeInputSchema,
  isPrincipalEnvironmentCompatibleWithOperation,
  type OperationInvokeInput,
  type OperationInvokeRefusalCode,
  type OperationInvokeResult,
  type PublicAuthorityRequest,
} from './operation-invoke-contracts'

export type OperationInvokeRequest = Readonly<{
  input: OperationInvokeInput
  principal: AgentAccessPrincipal
  correlationId: string
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

export type OperationInvokeApprovedAuthority = Extract<OperationInvokeAuthorityDecision, { kind: 'approved' }>

export type OperationInvokeCurrentOperation = Readonly<{
  operation: PublishedOperation
  operationRef?: string
  descriptor?: RuntimePublishedOperationDescriptor
}>

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

export type OperationInvokeAdmitted = Readonly<{
  command: OperationInvokeInput
  inputDigest: string
  requestDigest: string
  grant: OperationInvokeGrant
  invocationRef: string
  hasCurrentOperationReader: boolean
  current: OperationInvokeCurrentOperation | undefined
  descriptor: RuntimePublishedOperationDescriptor | undefined
  preflightRefusal: Extract<OperationInvokeResult, { kind: 'refused' }> | undefined
}>

export type OperationInvokeAdmitOutcome =
  | Readonly<{ kind: 'refused'; result: Extract<OperationInvokeResult, { kind: 'refused' }> }>
  | Readonly<{ kind: 'admitted' } & OperationInvokeAdmitted>

export type OperationInvokeReserved = Readonly<{
  reservation: OperationInvokeIdempotencyReservation
  reservationMayBeAbandoned: boolean
}>

export type OperationInvokeReserveOutcome =
  | Readonly<{ kind: 'terminal'; result: OperationInvokeResult }>
  | Readonly<{ kind: 'reserved' } & OperationInvokeReserved>

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

export async function admitOperationInvoke(input: Readonly<{
  request: OperationInvokeRequest
  policy: OperationInvokePolicyReader
  currentOperation: OperationInvokeCurrentOperationReader | undefined
  executeKeylessAvailable: boolean
  now: () => number
}>): Promise<OperationInvokeAdmitOutcome> {
  const parsedInput = operationInvokeInputSchema.safeParse(input.request.input)
  if (!parsedInput.success || !isPublicOperationRef(parsedInput.data.operationRef)) {
    return { kind: 'refused', result: { kind: 'refused', code: 'operation_ref_invalid', retryable: false } }
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
      result: {
        kind: 'refused',
        operationRef: command.operationRef,
        code: 'input_invalid',
        retryable: false,
      },
    }
  }

  let grantDecision: OperationInvokeGrantDecision
  try {
    grantDecision = await input.policy.readGrant({
      principal: input.request.principal,
      operationRef: command.operationRef,
      correlationId: input.request.correlationId,
    })
  } catch {
    return {
      kind: 'refused',
      result: {
        kind: 'refused',
        operationRef: command.operationRef,
        code: 'grant_not_found',
        retryable: true,
        nextAction: 'Refresh the agent grant and retry.',
      },
    }
  }
  if (grantDecision.kind === 'refused') {
    return {
      kind: 'refused',
      result: {
        operationRef: command.operationRef,
        kind: 'refused',
        code: grantDecision.code,
        retryable: grantDecision.retryable,
        ...(grantDecision.nextAction === undefined ? {} : { nextAction: grantDecision.nextAction }),
      },
    }
  }
  const grant = grantDecision.grant
  const invocationRef = canonicalOperationInvocationRef({
    principalId: input.request.principal.principalId,
    credentialId: input.request.principal.credentialId,
    applicationRef: input.request.principal.applicationRef,
    grantGeneration: grant.generation,
    environment: input.request.principal.environment,
    operationRef: command.operationRef,
    idempotencyKey: command.idempotencyKey,
  })
  const readCurrentOperation = input.currentOperation
  const hasCurrentOperationReader = readCurrentOperation !== undefined
  let current: OperationInvokeCurrentOperation | undefined
  let descriptor: RuntimePublishedOperationDescriptor | undefined
  let preflightRefusal: Extract<OperationInvokeResult, { kind: 'refused' }> | undefined
  if (readCurrentOperation !== undefined) {
    try {
      current = await readCurrentOperation({
        operationRef: command.operationRef,
        principal: input.request.principal,
        correlationId: input.request.correlationId,
        now: input.now(),
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
        if (currentOperationDigest({
          operationRef: command.operationRef,
          operation: current.operation,
        }) === undefined) throw new Error('operation_not_current')
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
      if (preflightRefusal === undefined && !isPrincipalEnvironmentCompatibleWithOperation(input.request.principal.environment, current.operation)) {
        preflightRefusal = {
          kind: 'refused',
          operationRef: command.operationRef,
          code: 'environment_mismatch',
          retryable: false,
          nextAction: operationEnvironmentMismatchNextAction,
        }
      }
    }
  } else if (!input.executeKeylessAvailable) {
    preflightRefusal = {
      kind: 'refused',
      operationRef: command.operationRef,
      code: 'invocation_runtime_unavailable',
      retryable: true,
    }
  }
  return {
    kind: 'admitted',
    command,
    inputDigest,
    requestDigest,
    grant,
    invocationRef,
    hasCurrentOperationReader,
    current,
    descriptor,
    preflightRefusal,
  }
}

export async function reserveOperationInvoke(input: Readonly<{
  request: OperationInvokeRequest
  admitted: OperationInvokeAdmitted
  idempotency: OperationInvokeIdempotencyPort
}>): Promise<OperationInvokeReserveOutcome> {
  const { command, grant, invocationRef, inputDigest, requestDigest } = input.admitted
  // Keep preflight before new reservation work, but reserve to resolve an existing idempotent replay.
  let reservationMayBeAbandoned = false
  let reservation: OperationInvokeIdempotencyReservation
  try {
    const reserved = await input.idempotency.reserve({
      principalId: input.request.principal.principalId,
      credentialId: input.request.principal.credentialId,
      applicationRef: input.request.principal.applicationRef,
      grantRef: grant.grantRef,
      grantGeneration: grant.generation,
      policyDigest: grant.policyDigest,
      grantExpiresAt: grant.expiresAt,
      environment: input.request.principal.environment,
      operationRef: command.operationRef,
      idempotencyKey: command.idempotencyKey,
      inputDigest,
      requestDigest,
      invocationRef,
    })
    if (reserved.kind === 'conflict') {
      return {
        kind: 'terminal',
        result: {
          kind: 'refused',
          operationRef: command.operationRef,
          code: 'idempotency_conflict',
          retryable: false,
          nextAction: 'Use a new idempotency key for changed input.',
        },
      }
    }
    if (reserved.kind === 'refused') {
      return {
        kind: 'terminal',
        result: {
          kind: 'refused',
          operationRef: command.operationRef,
          code: reserved.code,
          retryable: reserved.retryable,
          ...(reserved.nextAction === undefined ? {} : { nextAction: reserved.nextAction }),
        },
      }
    }
    reservation = reserved.reservation
    if (reserved.kind === 'reserved') reservationMayBeAbandoned = true
    if (reserved.kind === 'replayed') {
      const readReplay = input.idempotency.readReplay
      if (readReplay === undefined) {
        return {
          kind: 'terminal',
          result: {
            kind: 'refused',
            operationRef: command.operationRef,
            code: 'invocation_runtime_unavailable',
            retryable: true,
            nextAction: 'Retry after the invocation store is available.',
          },
        }
      }
      let replay: OperationInvokeResult | undefined
      try {
        replay = await readReplay({
          invocationRef: reservation.invocationRef,
          principal: input.request.principal,
          correlationId: input.request.correlationId,
        })
      } catch {
        return {
          kind: 'terminal',
          result: {
            kind: 'refused',
            operationRef: command.operationRef,
            code: 'invocation_runtime_unavailable',
            retryable: true,
            nextAction: 'Retry after the invocation store is available.',
          },
        }
      }
      if (replay !== undefined) return { kind: 'terminal', result: replay }
      reservationMayBeAbandoned = true
    }
  } catch {
    return {
      kind: 'terminal',
      result: {
        kind: 'refused',
        operationRef: command.operationRef,
        code: 'invocation_runtime_unavailable',
        retryable: true,
        nextAction: 'Retry after the invocation store is available.',
      },
    }
  }
  return {
    kind: 'reserved',
    reservation,
    reservationMayBeAbandoned,
  }
}
