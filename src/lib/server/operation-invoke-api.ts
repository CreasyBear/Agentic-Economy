import { bearerChallenge } from '@/lib/http/oauth-challenge'
import { gatewayFailureToProblem } from '@/lib/errors'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import {
  authenticateAgentAccess,
  resolveAgentAccessPrincipal,
  type AgentAccessPrincipal,
  type AgentAccessPrincipalResolver,
} from '@/lib/server/agent-access-auth'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { ConvexSourceError, callPublicSourceAction, sourceAction } from '@/lib/server/convex-source'
import { problem } from '@/lib/server/problem'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { sourceWriteAdmissionFromRequest, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import { response } from '@/lib/server/no-store-response'
import { isRecord } from '@/modules/common/is-record'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { operationInvokeAction } from '@/modules/capability-execution/operation-invoke.actions'
import {
  operationCancelInputSchema,
  operationInvokeRecoveryResultSchema,
  operationStatusInputSchema,
  operationInvokeStatusResultSchema,
  operationReconcileInputSchema,
} from '@/modules/capability-execution/operation-recovery.actions'
import {
  OPERATION_INVOKE_ACTION_ID,
  OPERATION_INVOKE_HTTP_PATH,
  OPERATION_INVOKE_ROUTE_CONTRACT,
  OPERATION_INVOKE_SCOPE,
} from '@/modules/capability-execution/operation-invoke-entry'
import type {
  OperationInvokeRequest,
  OperationInvokeService,
} from '@/modules/capability-execution/operation-invoke'
import type { OperationInvokeResult } from '@/modules/capability-execution/operation-invoke-contracts'
import type { ActionTimingSink } from '@/modules/common/action'
import {
  recordGatewayTelemetry,
  type GatewayTelemetryEvent,
} from '@/lib/server/gateway-telemetry'

export { OPERATION_INVOKE_ACTION_ID, OPERATION_INVOKE_HTTP_PATH, OPERATION_INVOKE_SCOPE }
const operationJsonResponseHeaders = {
  'Content-Type': OPERATION_INVOKE_ROUTE_CONTRACT.media.response,
} as const
const MAX_OPERATION_INVOKE_BODY_BYTES = 256 * 1024
const operationInvokeSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityOperationInvocations:invoke')
const operationStatusSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityOperationInvocations:readInvocationStatus')
const operationCancelSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityOperationInvocations:cancelInvocation')
const operationReconcileSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityOperationInvocations:reconcileInvocation')

type OperationInvokeRecoveryRequest = Parameters<OperationInvokeService['readInvocationStatus']>[0]
type OperationInvokeCancelRequest = Parameters<OperationInvokeService['cancelInvocation']>[0]
type OperationInvokeReconcileRequest = Parameters<OperationInvokeService['reconcileInvocation']>[0]

export type OperationInvokeHandlerOptions = Readonly<{
  authenticate?: NonNullable<Parameters<typeof authenticateAgentAccess>[0]>['authenticate']
  resolvePrincipal?: AgentAccessPrincipalResolver
  operationInvokeService?: OperationInvokeService
  timing?: ActionTimingSink
}>

export function createOperationInvokeService(
  request: Request,
  bodyText: string,
): OperationInvokeService {
  const operationKeyFor = (command: unknown, principalId: string, credentialId: string, applicationRef: string, environment: string) => canonicalDigest({
    contract: OPERATION_INVOKE_ACTION_ID,
    principalId,
    credentialId,
    applicationRef,
    environment,
    command,
  })
  const invokeOperation = async (input: OperationInvokeRequest) => {
    const operationKey = operationKeyFor(input.input, input.principal.principalId, input.principal.credentialId, input.principal.applicationRef, input.principal.environment)
    const command = {
      operationRef: input.input.operationRef,
      input: input.input.input,
      idempotencyKey: input.input.idempotencyKey,
      correlationId: input.correlationId,
      operationKey,
      principal: input.principal,
    }
    const sourceWrite = await sourceWriteAdmissionFromRequest({
      request,
      command,
      body: bodyText,
      scope: 'protected_action',
      operationKey,
      correlationId: input.correlationId,
    })
    const result = await callPublicSourceAction(operationInvokeSourceAction, {
      ...command,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    })
    return operationInvokeAction.outputSchema.parse(result)
  }
  const readInvocationStatus = async (input: OperationInvokeRecoveryRequest) => {
    const operationKey = operationKeyFor(input.invocationRef, input.principal.principalId, input.principal.credentialId, input.principal.applicationRef, input.principal.environment)
    const command = {
      invocationRef: input.invocationRef,
      operationRef: '',
      input: {},
      idempotencyKey: `status:${input.invocationRef}`,
      correlationId: input.correlationId,
      operationKey,
      principal: input.principal,
    }
    const sourceWrite = await sourceWriteAdmissionFromRequest({
      request,
      command,
      body: bodyText,
      scope: 'protected_action',
      operationKey,
      correlationId: input.correlationId,
    })
    const result = await callPublicSourceAction(operationStatusSourceAction, {
      invocationRef: input.invocationRef,
      correlationId: input.correlationId,
      operationKey,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
      principal: input.principal,
    })
    return operationInvokeStatusResultSchema.parse(result)
  }
  const cancelInvocation = async (input: OperationInvokeCancelRequest) => {
    const operationKey = operationKeyFor({ invocationRef: input.invocationRef, idempotencyKey: input.idempotencyKey }, input.principal.principalId, input.principal.credentialId, input.principal.applicationRef, input.principal.environment)
    const command = {
      invocationRef: input.invocationRef,
      idempotencyKey: `cancel:${input.idempotencyKey}`,
      operationRef: '',
      input: {},
      correlationId: input.correlationId,
      operationKey,
      principal: input.principal,
    }
    const sourceWrite = await sourceWriteAdmissionFromRequest({
      request,
      command,
      body: bodyText,
      scope: 'protected_action',
      operationKey,
      correlationId: input.correlationId,
    })
    const result = await callPublicSourceAction(operationCancelSourceAction, {
      invocationRef: input.invocationRef,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      operationKey,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
      principal: input.principal,
    })
    return operationInvokeRecoveryResultSchema.parse(result)
  }
  const reconcileInvocation = async (input: OperationInvokeReconcileRequest) => {
    const operationKey = operationKeyFor({ invocationRef: input.invocationRef, idempotencyKey: input.idempotencyKey, evidence: input.evidence }, input.principal.principalId, input.principal.credentialId, input.principal.applicationRef, input.principal.environment)
    const command = {
      invocationRef: input.invocationRef,
      evidence: input.evidence,
      idempotencyKey: `reconcile:${input.idempotencyKey}`,
      operationRef: '',
      input: {},
      correlationId: input.correlationId,
      operationKey,
      principal: input.principal,
    }
    const sourceWrite = await sourceWriteAdmissionFromRequest({
      request,
      command,
      body: bodyText,
      scope: 'protected_action',
      operationKey,
      correlationId: input.correlationId,
    })
    const result = await callPublicSourceAction(operationReconcileSourceAction, {
      invocationRef: input.invocationRef,
      evidence: input.evidence,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      operationKey,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
      principal: input.principal,
    })
    return operationInvokeRecoveryResultSchema.parse(result)
  }
  return { invokeOperation, readInvocationStatus, cancelInvocation, reconcileInvocation }
}
function gatewayTelemetryForResult(
  result: OperationInvokeResult,
): Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'> {
  if (result.kind === 'completed') {
    return {
      operationRef: result.operationRef,
      pricing: result.usage.chargeState === 'free_tier'
        ? 'free'
        : result.usage.chargeState === 'paid'
          ? 'paid'
          : 'unknown',
      costUnits: result.usage.amount.units,
      outcome: 'completed',
      ...(result.usage.chargeState === 'outcome_unknown' ? { unknown: true } : {}),
    }
  }
  if (result.kind === 'pending') {
    return { operationRef: result.operationRef, outcome: 'pending' }
  }
  if (result.kind === 'needs_authority') {
    return { operationRef: result.operationRef, outcome: 'needs_authority', approval: 'required' }
  }
  if (result.kind === 'reconciliation_required') {
    return { operationRef: result.operationRef, outcome: 'reconciliation_required', unknown: true }
  }
  const code = result.code
  return {
    ...(result.operationRef === undefined ? {} : { operationRef: result.operationRef }),
    outcome: 'refused',
    refusalCode: code,
    retryable: result.retryable,
    ...(code === 'outcome_unknown' ? { unknown: true } : {}),
    ...(code === 'authority_required' ? { approval: 'required' as const } : {}),
    ...(code === 'rate_limited' ? { rateLimited: true } : {}),
    ...(code === 'concurrency_limited' ? { concurrencyLimited: true } : {}),
  }
}

type GatewayPrincipalRef = AgentAccessPrincipal

function principalTelemetry(principal: GatewayPrincipalRef): Pick<GatewayTelemetryEvent, 'credentialId' | 'principalId' | 'applicationRef'> {
  return {
    credentialId: principal.credentialId,
    principalId: principal.principalId,
    applicationRef: principal.applicationRef,
  }
}

function recoveryTelemetryForResult(
  result: unknown,
  invocationRef: string,
): Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'> {
  if (!isRecord(result)) return { invocationRef, outcome: 'failed', refusalCode: 'result_invalid' }
  const operationRef = typeof result.operationRef === 'string' ? result.operationRef : undefined
  if (result.kind === 'reconciliation_required') {
    return {
      invocationRef,
      ...(operationRef === undefined ? {} : { operationRef }),
      outcome: 'reconciliation_required',
      unknown: true,
    }
  }
  if (result.kind === 'refused') {
    const code = typeof result.code === 'string' ? result.code : 'operation_invoke_failed'
    return {
      invocationRef,
      ...(operationRef === undefined ? {} : { operationRef }),
      outcome: 'refused',
      refusalCode: code,
      ...(typeof result.retryable === 'boolean' ? { retryable: result.retryable } : {}),
      ...(code === 'outcome_unknown' ? { unknown: true } : {}),
    }
  }
  if (result.kind === 'found') {
    const state = result.state
    return {
      invocationRef,
      ...(operationRef === undefined ? {} : { operationRef }),
      outcome: state === 'cancelled'
        ? 'cancelled'
        : state === 'reconciliation_required'
          ? 'reconciliation_required'
          : state === 'terminal'
            ? 'completed'
            : 'pending',
    }
  }
  return { invocationRef, outcome: 'failed', refusalCode: 'result_invalid' }
}

function gatewayDetail(code: string): string {
  switch (code) {
    case 'authentication_required':
      return 'Authentication required.'
    case 'authority_denied':
      return 'The operation was declined by the owner.'
    case 'scope_required':
      return 'The provided API key does not carry the required scope.'
    case 'source_unavailable':
    case 'invocation_runtime_unavailable':
    case 'operation_invoke_unavailable':
      return 'The operation service is temporarily unavailable.'
    case 'result_invalid':
    case 'operation_invoke_result_invalid':
      return 'The operation service returned an invalid result.'
    case 'invocation_not_found':
      return 'The operation invocation was not found.'
    default:
      return 'The operation request could not be completed.'
  }
}

function gatewayErrorCode(
  error: unknown,
  fallback: 'operation_invoke_unavailable' | 'invocation_runtime_unavailable' | 'source_unavailable',
): {
  code: string
  retryable: boolean
  status?: number
} {
  if (error instanceof ConvexSourceError) {
    return {
      code: error.code === 'missing_auth' ? 'authentication_required' : 'source_unavailable',
      retryable: error.status >= 500 || error.status === 429,
      status: error.status,
    }
  }
  return { code: fallback, retryable: true }
}

function gatewayErrorResponse(
  error: unknown,
  fallback: 'operation_invoke_unavailable' | 'invocation_runtime_unavailable' | 'source_unavailable',
  correlationId: string,
): Response {
  const mapped = gatewayErrorCode(error, fallback)
  const failure = gatewayFailureToProblem({ code: mapped.code, retryable: mapped.retryable, kind: 'error' })
  return withRequestCorrelationHeader(problem({
    ...failure,
    ...(mapped.status === undefined ? {} : { status: mapped.status }),
    detail: gatewayDetail(failure.code),
  }), correlationId)
}

export async function authenticateOperationGateway(
  request: Request,
  correlationId: string,
  options: OperationInvokeHandlerOptions,
  body: string | Uint8Array,
): Promise<Readonly<{ kind: 'authenticated'; principal: GatewayPrincipalRef }> | Response> {
  const resolvePrincipal = options.resolvePrincipal
    ?? (options.authenticate === undefined ? resolveAgentAccessPrincipal(request, body, correlationId) : undefined)
  const admitted = await authenticateAgentAccess({
    ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
    ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
    consequenceResource: 'surface:http:operations-call',
    requiredScope: OPERATION_INVOKE_SCOPE,
  })
  if (admitted.kind === 'authenticated') return { kind: admitted.kind, principal: admitted.principal }
  const challenge = bearerChallenge(resolveCanonicalBaseUrl(request).baseUrl, OPERATION_INVOKE_SCOPE)
  const failure = gatewayFailureToProblem({ code: admitted.reason, kind: 'refused', retryable: false })
  return withRequestCorrelationHeader(problem({
    ...failure,
    status: admitted.status,
    detail: gatewayDetail(admitted.reason),
  }, { Vary: 'Authorization', 'WWW-Authenticate': challenge }), correlationId)
}


export async function handleOperationInvokePost(
  request: Request,
  options: OperationInvokeHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const startedAt = Date.now()
    const bounded = await readBoundedRequestText(request, MAX_OPERATION_INVOKE_BODY_BYTES)
    if (!bounded.ok) {
      return withRequestCorrelationHeader(problem({
        status: 413,
        kind: 'PAYLOAD_TOO_LARGE',
        code: bounded.code,
        detail: 'The operation invocation body is too large.',
      }), correlationId)
    }
    const admitted = await authenticateOperationGateway(request, correlationId, options, bounded.text)
    if (admitted instanceof Response) return admitted
    const principal = admitted.principal
    const telemetry = (event: Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'>): void => {
      recordGatewayTelemetry(options.timing, {
        ...principalTelemetry(principal),
        ...event,
        correlationId,
        durationMs: Date.now() - startedAt,
      })
    }
    let rawBody: unknown
    try {
      rawBody = JSON.parse(bounded.text) as unknown
    } catch {
      telemetry({ outcome: 'failed', refusalCode: 'invalid_json' })
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_json',
        detail: 'The request body must be valid JSON.',
      }), correlationId)
    }
    const parsed = operationInvokeAction.schema.safeParse(rawBody)
    if (!parsed.success) {
      telemetry({ outcome: 'failed', refusalCode: 'invalid_request' })
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_request',
        detail: 'The request did not match operation.invoke:v1.',
      }), correlationId)
    }
    try {
      const service = options.operationInvokeService ?? createOperationInvokeService(request, bounded.text)
      const result = await service.invokeOperation({ input: parsed.data, principal: admitted.principal, correlationId })
      const projected = operationInvokeAction.outputSchema.safeParse(result)
      if (!projected.success) {
        telemetry({ outcome: 'failed', refusalCode: 'operation_invoke_result_invalid' })
        const failure = gatewayFailureToProblem({ kind: 'error', code: 'operation_invoke_result_invalid' })
        return withRequestCorrelationHeader(problem({
          ...failure,
          detail: gatewayDetail(failure.code),
        }), correlationId)
      }
      telemetry(gatewayTelemetryForResult(projected.data))
      return withRequestCorrelationHeader(response(projected.data, 200, operationJsonResponseHeaders), correlationId)
    } catch (error) {
      const mapped = gatewayErrorCode(error, 'operation_invoke_unavailable')
      telemetry({
        outcome: mapped.code === 'source_unavailable' ? 'failed' : 'unknown',
        refusalCode: mapped.code,
        ...(mapped.code === 'operation_invoke_unavailable' ? { unknown: true } : {}),
      })
      return gatewayErrorResponse(error, 'operation_invoke_unavailable', correlationId)
    }
  })
}
type RecoveryBodyKind = 'cancel' | 'reconcile'

type ParsedRecoveryBody =
  | Readonly<{ ok: true; bodyText: string; input: unknown }>
  | Readonly<{ ok: false; response: Response }>

async function parseRecoveryBody(
  request: Request,
  invocationRef: string,
  bodyKind: RecoveryBodyKind,
  correlationId: string,
): Promise<ParsedRecoveryBody> {
  const bounded = await readBoundedRequestText(request, 64 * 1024)
  if (!bounded.ok) {
    return {
      ok: false,
      response: withRequestCorrelationHeader(problem({
        status: 413,
        kind: 'PAYLOAD_TOO_LARGE',
        code: bounded.code,
        detail: 'The operation recovery body is too large.',
      }), correlationId),
    }
  }
  let rawBody: unknown = {}
  if (bounded.text.trim().length > 0) {
    try {
      rawBody = JSON.parse(bounded.text) as unknown
    } catch {
      return {
        ok: false,
        response: withRequestCorrelationHeader(problem({
          status: 400,
          kind: 'INVALID_ARGUMENT',
          code: 'invalid_json',
          detail: 'The recovery request body must be valid JSON.',
        }), correlationId),
      }
    }
  }
  if (!isRecord(rawBody)) {
    return {
      ok: false,
      response: withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_request',
        detail: 'The recovery request body must be a JSON object.',
      }), correlationId),
    }
  }
  const bodyInvocationRef = rawBody.invocationRef
  if (bodyInvocationRef !== undefined && bodyInvocationRef !== invocationRef) {
    return {
      ok: false,
      response: withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invocation_ref_mismatch',
        detail: 'The invocation reference must match the request path.',
      }), correlationId),
    }
  }
  const candidate = {
    ...rawBody,
    invocationRef,
  }
  const parsed = bodyKind === 'cancel'
    ? operationCancelInputSchema.safeParse(candidate)
    : operationReconcileInputSchema.safeParse(candidate)
  if (!parsed.success) {
    return {
      ok: false,
      response: withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_request',
        detail: bodyKind === 'cancel'
          ? 'The request did not match operation.cancel:v1.'
          : 'The request did not match operation.reconcile:v1.',
      }), correlationId),
    }
  }
  return { ok: true, bodyText: bounded.text, input: parsed.data }
}

export async function handleOperationInvokeStatusGet(
  request: Request,
  invocationRef: string,
  options: OperationInvokeHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const startedAt = Date.now()
    const admitted = await authenticateOperationGateway(request, correlationId, options, '')
    if (admitted instanceof Response) return admitted
    const principal = admitted.principal
    const telemetry = (event: Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'>): void => {
      recordGatewayTelemetry(options.timing, {
        ...principalTelemetry(principal),
        ...event,
        correlationId,
        durationMs: Date.now() - startedAt,
      })
    }
    const parsed = operationStatusInputSchema.safeParse({ invocationRef })
    if (!parsed.success) {
      telemetry({ outcome: 'failed', refusalCode: 'invalid_invocation_ref' })
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_invocation_ref',
        detail: 'The invocation reference is invalid.',
      }), correlationId)
    }
    try {
      const service = options.operationInvokeService ?? createOperationInvokeService(request, '')
      const result = await service.readInvocationStatus({
        invocationRef: parsed.data.invocationRef,
        principal: admitted.principal,
        correlationId,
      })
      const projected = operationInvokeStatusResultSchema.safeParse(result)
      if (!projected.success) {
        telemetry({ outcome: 'failed', refusalCode: 'operation_invoke_result_invalid' })
        const failure = gatewayFailureToProblem({ kind: 'error', code: 'operation_invoke_result_invalid' })
        return withRequestCorrelationHeader(problem({
          ...failure,
          detail: gatewayDetail(failure.code),
        }), correlationId)
      }
      telemetry(recoveryTelemetryForResult(projected.data, parsed.data.invocationRef))
      return withRequestCorrelationHeader(response(projected.data, 200, operationJsonResponseHeaders), correlationId)
    } catch (error) {
      const mapped = gatewayErrorCode(error, 'invocation_runtime_unavailable')
      telemetry({
        outcome: 'unknown',
        refusalCode: mapped.code,
        unknown: true,
      })
      return gatewayErrorResponse(error, 'invocation_runtime_unavailable', correlationId)
    }
  })
}

export async function handleOperationInvokeCancelPost(
  request: Request,
  invocationRef: string,
  options: OperationInvokeHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const startedAt = Date.now()
    const parsed = await parseRecoveryBody(request, invocationRef, 'cancel', correlationId)
    if (!parsed.ok) return parsed.response
    const admitted = await authenticateOperationGateway(request, correlationId, options, parsed.bodyText)
    if (admitted instanceof Response) return admitted
    const principal = admitted.principal
    const telemetry = (event: Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'>): void => {
      recordGatewayTelemetry(options.timing, {
        ...principalTelemetry(principal),
        ...event,
        correlationId,
        durationMs: Date.now() - startedAt,
      })
    }
    const command = operationCancelInputSchema.parse(parsed.input)
    try {
      const service = options.operationInvokeService ?? createOperationInvokeService(request, parsed.bodyText)
      const result = await service.cancelInvocation({
        invocationRef: command.invocationRef,
        idempotencyKey: command.idempotencyKey,
        principal: admitted.principal,
        correlationId,
      })
      const projected = operationInvokeRecoveryResultSchema.safeParse(result)
      if (!projected.success) {
        telemetry({ outcome: 'failed', refusalCode: 'operation_invoke_result_invalid' })
        const failure = gatewayFailureToProblem({ kind: 'error', code: 'operation_invoke_result_invalid' })
        return withRequestCorrelationHeader(problem({
          ...failure,
          detail: gatewayDetail(failure.code),
        }), correlationId)
      }
      telemetry(recoveryTelemetryForResult(projected.data, command.invocationRef))
      return withRequestCorrelationHeader(response(projected.data, 200, operationJsonResponseHeaders), correlationId)
    } catch (error) {
      const mapped = gatewayErrorCode(error, 'invocation_runtime_unavailable')
      telemetry({
        outcome: 'unknown',
        refusalCode: mapped.code,
        unknown: true,
      })
      return gatewayErrorResponse(error, 'invocation_runtime_unavailable', correlationId)
    }
  })
}

export async function handleOperationInvokeReconcilePost(
  request: Request,
  invocationRef: string,
  options: OperationInvokeHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const startedAt = Date.now()
    const parsed = await parseRecoveryBody(request, invocationRef, 'reconcile', correlationId)
    if (!parsed.ok) return parsed.response
    const admitted = await authenticateOperationGateway(request, correlationId, options, parsed.bodyText)
    if (admitted instanceof Response) return admitted
    const principal = admitted.principal
    const telemetry = (event: Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'>): void => {
      recordGatewayTelemetry(options.timing, {
        ...principalTelemetry(principal),
        ...event,
        correlationId,
        durationMs: Date.now() - startedAt,
      })
    }
    const command = operationReconcileInputSchema.parse(parsed.input)
    try {
      const service = options.operationInvokeService ?? createOperationInvokeService(request, parsed.bodyText)
      const result = await service.reconcileInvocation({
        invocationRef: command.invocationRef,
        evidence: command.evidence,
        idempotencyKey: command.idempotencyKey,
        principal: admitted.principal,
        correlationId,
      })
      const projected = operationInvokeRecoveryResultSchema.safeParse(result)
      if (!projected.success) {
        telemetry({ outcome: 'failed', refusalCode: 'operation_invoke_result_invalid' })
        const failure = gatewayFailureToProblem({ kind: 'error', code: 'operation_invoke_result_invalid' })
        return withRequestCorrelationHeader(problem({
          ...failure,
          detail: gatewayDetail(failure.code),
        }), correlationId)
      }
      telemetry(recoveryTelemetryForResult(projected.data, command.invocationRef))
      return withRequestCorrelationHeader(response(projected.data, 200, operationJsonResponseHeaders), correlationId)
    } catch (error) {
      const mapped = gatewayErrorCode(error, 'invocation_runtime_unavailable')
      telemetry({
        outcome: 'unknown',
        refusalCode: mapped.code,
        unknown: true,
      })
      return gatewayErrorResponse(error, 'invocation_runtime_unavailable', correlationId)
    }
  })
}
