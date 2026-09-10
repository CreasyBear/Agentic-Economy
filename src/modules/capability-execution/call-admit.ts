import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { AgentAccessToolAccess } from '@/modules/agent-access/policy'
import {
  isPublicToolRef,
  materializeRuntimePublishedTool,
  type PublishedTool,
  type RuntimePublishedToolDescriptor,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { SpendingPolicyAuthorityBasis } from '@/modules/action-execution/runtime'
import { currentToolDigest } from './current-tool-quote'
import {
  toolEnvironmentMismatchNextAction,
  resolvedCallInputSchema,
  isPrincipalEnvironmentCompatibleWithTool,
  type ResolvedCallInput,
  type CallRefusalCode,
  type CallResult,
  type PublicAuthorityRequest,
} from './call-contracts'

export type CallRequest = Readonly<{
  input: ResolvedCallInput
  principal: AgentAccessPrincipal
  correlationId: string
}>

export type CallGrant = Readonly<{
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
  toolAccess: AgentAccessToolAccess
  toolRefs: readonly string[]
}>

export type CallGrantDecision =
  | Readonly<{ kind: 'granted'; grant: CallGrant }>
  | Readonly<{
      kind: 'refused'
      code: Extract<CallRefusalCode, 'grant_not_found' | 'grant_revoked' | 'grant_expired' | 'grant_generation_stale' | 'environment_mismatch' | 'rate_limited' | 'concurrency_limited' | 'budget_exceeded'>
      retryable: boolean
      nextAction?: string
    }>

export type CallAuthorityDecision =
  | Readonly<{
      kind: 'approved'
      basis: Readonly<{ kind: 'approval_required'; authorityRef: string }> | SpendingPolicyAuthorityBasis
      expiresAt: string
    }>
  | Readonly<{
      kind: 'needs_authority'
      authorityRequest: PublicAuthorityRequest
    }>
  | Readonly<{
      kind: 'refused'
      code: Extract<CallRefusalCode, 'authority_reader_unavailable' | 'authority_required' | 'budget_exceeded' | 'rate_limited' | 'concurrency_limited'>
      retryable: boolean
      nextAction?: string
    }>

export type CallApprovedAuthority = Extract<CallAuthorityDecision, { kind: 'approved' }>

export type CallCurrentTool = Readonly<{
  operation: PublishedTool
  toolRef?: string
  descriptor?: RuntimePublishedToolDescriptor
}>

export type CallCurrentToolReader = (input: Readonly<{
  toolRef: string
  principal: AgentAccessPrincipal
  correlationId: string
  now: number
}>) => Promise<CallCurrentTool | undefined>

export type CallPolicyReader = Readonly<{
  readGrant(input: Readonly<{
    principal: AgentAccessPrincipal
    toolRef: string
    correlationId: string
  }>): Promise<CallGrantDecision>
  evaluateAuthority(input: Readonly<{
    principal: AgentAccessPrincipal
    grant: CallGrant
    operation: PublishedTool
    descriptor: RuntimePublishedToolDescriptor
    input: Record<string, unknown>
    toolRef: string
    callRef: string
    idempotencyKey: string
    correlationId: string
  }>): Promise<CallAuthorityDecision>
}>

export type CallIdempotencyReservation = Readonly<{
  quoteRef: string
  principalId: string
  credentialId: string
  applicationRef: string
  grantRef: string
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  environment: AgentAccessPrincipal['environment']
  toolRef: string
  idempotencyKey: string
  inputDigest: string
  requestDigest: string
  callRef: string
}>

export type CallPortRefusal = Readonly<{
  kind: 'refused'
  code: Extract<CallRefusalCode, 'operation_not_ready' | 'grant_not_found' | 'grant_revoked' | 'grant_expired' | 'grant_generation_stale' | 'environment_mismatch' | 'rate_limited' | 'concurrency_limited' | 'budget_exceeded' | 'insufficient_balance' | 'treasury_capacity_unavailable' | 'commercial_policy_unavailable'>
  retryable: boolean
  nextAction?: string
}>

export type CallIdempotencyAbandonment = CallIdempotencyReservation & Readonly<{
  ownerId: string
}>

export type CallIdempotencyAbandonmentResult =
  | Readonly<{ kind: 'abandoned' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'dispatch_started' }>

export type CallIdempotencyPort = Readonly<{
  reserve(input: CallIdempotencyReservation): Promise<
    | Readonly<{ kind: 'reserved'; reservation: CallIdempotencyReservation }>
    | Readonly<{ kind: 'replayed'; reservation: CallIdempotencyReservation }>
    | Readonly<{ kind: 'conflict' }>
    | CallPortRefusal
  >
  abandon(input: CallIdempotencyAbandonment): Promise<CallIdempotencyAbandonmentResult>
  readReplay?(input: Readonly<{
    callRef: string
    principal: AgentAccessPrincipal
    correlationId: string
  }>): Promise<CallResult | undefined>
}>

export type CallAdmitted = Readonly<{
  command: ResolvedCallInput
  inputDigest: string
  requestDigest: string
  grant: CallGrant
  callRef: string
  hasCurrentToolReader: boolean
  current: CallCurrentTool | undefined
  descriptor: RuntimePublishedToolDescriptor | undefined
  preflightRefusal: Extract<CallResult, { kind: 'refused' }> | undefined
}>

export type CallAdmitOutcome =
  | Readonly<{ kind: 'refused'; result: Extract<CallResult, { kind: 'refused' }> }>
  | Readonly<{ kind: 'admitted' } & CallAdmitted>

export type CallReserved = Readonly<{
  reservation: CallIdempotencyReservation
  reservationMayBeAbandoned: boolean
}>

export type CallReserveOutcome =
  | Readonly<{ kind: 'terminal'; result: CallResult }>
  | Readonly<{ kind: 'reserved' } & CallReserved>

function callIdentityMaterial(input: Readonly<{
  principalId: string
  credentialId: string
  applicationRef: string
  environment: AgentAccessPrincipal['environment']
  toolRef: string
  idempotencyKey: string
}>): Readonly<{
  principalId: string
  credentialId: string
  applicationRef: string
  environment: AgentAccessPrincipal['environment']
  operationRef: string
  idempotencyKey: string
}> {
  return {
    principalId: input.principalId,
    credentialId: input.credentialId,
    applicationRef: input.applicationRef,
    environment: input.environment,
    operationRef: input.toolRef,
    idempotencyKey: input.idempotencyKey,
  }
}

function callRefFromIdentityAndGeneration(
  identity: ReturnType<typeof callIdentityMaterial>,
  grantGeneration: number,
): string {
  return `operation-invocation:v1:${canonicalDigest({ ...identity, grantGeneration }).slice(7)}`
}

// credentialId is the admitted effect identity and grantGeneration binds the authorising grant;
// replay lookup instead uses the Principal-keyed idempotency index (Wells 1+2).
export function canonicalCallRef(input: Readonly<{
  principalId: string
  credentialId: string
  applicationRef: string
  grantGeneration: number
  environment: AgentAccessPrincipal['environment']
  toolRef: string
  idempotencyKey: string
}>): string {
  return callRefFromIdentityAndGeneration(callIdentityMaterial(input), input.grantGeneration)
}

export async function admitCall(input: Readonly<{
  request: CallRequest
  policy: CallPolicyReader
  currentTool: CallCurrentToolReader | undefined
  now: () => number
}>): Promise<CallAdmitOutcome> {
  const parsedInput = resolvedCallInputSchema.safeParse(input.request.input)
  if (!parsedInput.success || !isPublicToolRef(parsedInput.data.toolRef)) {
    return { kind: 'refused', result: { kind: 'refused', code: 'operation_ref_invalid', retryable: false } }
  }
  const command = parsedInput.data
  let inputDigest: string
  let requestDigest: string
  try {
    inputDigest = canonicalDigest(command.input)
    requestDigest = canonicalDigest({
      operationRef: command.toolRef,
      input: command.input,
    })
  } catch {
    return {
      kind: 'refused',
      result: {
        kind: 'refused',
        toolRef: command.toolRef,
        code: 'input_invalid',
        retryable: false,
      },
    }
  }

  let grantDecision: CallGrantDecision
  try {
    grantDecision = await input.policy.readGrant({
      principal: input.request.principal,
      toolRef: command.toolRef,
      correlationId: input.request.correlationId,
    })
  } catch {
    return {
      kind: 'refused',
      result: {
        kind: 'refused',
        toolRef: command.toolRef,
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
        toolRef: command.toolRef,
        kind: 'refused',
        code: grantDecision.code,
        retryable: grantDecision.retryable,
        ...(grantDecision.nextAction === undefined ? {} : { nextAction: grantDecision.nextAction }),
      },
    }
  }
  const grant = grantDecision.grant
  const callRef = canonicalCallRef({
    principalId: input.request.principal.principalId,
    credentialId: input.request.principal.credentialId,
    applicationRef: input.request.principal.applicationRef,
    grantGeneration: grant.generation,
    environment: input.request.principal.environment,
    toolRef: command.toolRef,
    idempotencyKey: command.idempotencyKey,
  })
  const readCurrentTool = input.currentTool
  const hasCurrentToolReader = readCurrentTool !== undefined
  let current: CallCurrentTool | undefined
  let descriptor: RuntimePublishedToolDescriptor | undefined
  let preflightRefusal: Extract<CallResult, { kind: 'refused' }> | undefined
  if (readCurrentTool !== undefined) {
    try {
      current = await readCurrentTool({
        toolRef: command.toolRef,
        principal: input.request.principal,
        correlationId: input.request.correlationId,
        now: input.now(),
      })
    } catch (error) {
      const unsupported = error instanceof Error && error.message === 'operation_unsupported'
      preflightRefusal = {
        kind: 'refused',
        toolRef: command.toolRef,
        code: unsupported ? 'operation_unsupported' : 'source_unavailable',
        retryable: !unsupported,
      }
    }
    if (preflightRefusal === undefined && (current === undefined
      || (current.toolRef !== undefined && current.toolRef !== command.toolRef))) {
      preflightRefusal = {
        kind: 'refused',
        toolRef: command.toolRef,
        code: 'operation_not_current',
        retryable: false,
      }
    }
    if (preflightRefusal === undefined && current !== undefined) {
      try {
        descriptor = current.descriptor ?? materializeRuntimePublishedTool(current.operation)
        if (currentToolDigest({
          toolRef: command.toolRef,
          tool: current.operation,
        }) === undefined) throw new Error('operation_not_current')
      } catch {
        preflightRefusal = {
          kind: 'refused',
          toolRef: command.toolRef,
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
          toolRef: command.toolRef,
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
          toolRef: command.toolRef,
          code: inputValid ? 'operation_not_current' : 'input_invalid',
          retryable: false,
        }
      }
      if (preflightRefusal === undefined && !isPrincipalEnvironmentCompatibleWithTool(input.request.principal.environment, current.operation)) {
        preflightRefusal = {
          kind: 'refused',
          toolRef: command.toolRef,
          code: 'environment_mismatch',
          retryable: false,
          nextAction: toolEnvironmentMismatchNextAction,
        }
      }
    }
  }
  return {
    kind: 'admitted',
    command,
    inputDigest,
    requestDigest,
    grant,
    callRef,
    hasCurrentToolReader,
    current,
    descriptor,
    preflightRefusal,
  }
}

export async function reserveCall(input: Readonly<{
  request: CallRequest
  admitted: CallAdmitted
  idempotency: CallIdempotencyPort
}>): Promise<CallReserveOutcome> {
  const { command, grant, callRef, inputDigest, requestDigest } = input.admitted
  // Keep preflight before new reservation work, but reserve to resolve an existing idempotent replay.
  let reservationMayBeAbandoned = false
  let reservation: CallIdempotencyReservation
  try {
    const reserved = await input.idempotency.reserve({
      quoteRef: command.quoteRef,
      principalId: input.request.principal.principalId,
      credentialId: input.request.principal.credentialId,
      applicationRef: input.request.principal.applicationRef,
      grantRef: grant.grantRef,
      grantGeneration: grant.generation,
      policyDigest: grant.policyDigest,
      grantExpiresAt: grant.expiresAt,
      environment: input.request.principal.environment,
      toolRef: command.toolRef,
      idempotencyKey: command.idempotencyKey,
      inputDigest,
      requestDigest,
      callRef,
    })
    if (reserved.kind === 'conflict') {
      return {
        kind: 'terminal',
        result: {
          kind: 'refused',
          toolRef: command.toolRef,
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
          toolRef: command.toolRef,
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
            toolRef: command.toolRef,
            code: 'invocation_runtime_unavailable',
            retryable: true,
            nextAction: 'Retry after the invocation store is available.',
          },
        }
      }
      let replay: CallResult | undefined
      try {
        replay = await readReplay({
          callRef: reservation.callRef,
          principal: input.request.principal,
          correlationId: input.request.correlationId,
        })
      } catch {
        return {
          kind: 'terminal',
          result: {
            kind: 'refused',
            toolRef: command.toolRef,
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
        toolRef: command.toolRef,
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
