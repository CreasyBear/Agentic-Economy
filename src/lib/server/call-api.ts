import { bearerChallenge } from '@/lib/http/oauth-challenge'
import { gatewayFailureToProblem } from '@/lib/errors'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { isJsonContentType } from '@/lib/server/json-content-type'
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
import { callAction } from '@/modules/capability-execution/call.actions'
import {
  toolQuoteAction,
} from '@/modules/capability-execution/quote.actions'
import {
  callListInputSchema,
  callListResultSchema,
} from '@/modules/capability-execution/call-history.actions'
import {
  callCancelInputSchema,
  callRecoveryResultSchema,
  callStatusInputSchema,
  callStatusResultSchema,
  callReconcileInputSchema,
} from '@/modules/capability-execution/call-recovery.actions'
import {
  CALL_ACTION_ID,
  CALL_HTTP_PATH,
  CALL_ROUTE_CONTRACT,
  CALL_SCOPE,
} from '@/modules/capability-execution/call-entry'
import type {
  CallServiceRequest,
  CallService,
} from '@/modules/capability-execution/call-authority'
import {
  callResultSchema,
  projectCallMachineResult,
  type CallMachineResult,
} from '@/modules/capability-execution/call-contracts'
import type { ActionTimingSink } from '@/modules/common/action'
import {
  recordGatewayTelemetry,
  type GatewayTelemetryEvent,
} from '@/lib/server/gateway-telemetry'

export { CALL_ACTION_ID, CALL_HTTP_PATH, CALL_SCOPE }
const callJsonResponseHeaders = {
  'Content-Type': CALL_ROUTE_CONTRACT.media.response,
} as const
const MAX_CALL_BODY_BYTES = 256 * 1024
const callSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityCalls:call')
const toolQuoteSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityQuotes:quote')
const callListSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityCalls:listCalls')
const callStatusSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityCalls:readCallStatus')
const callCancelSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityCalls:cancelCall')
const callReconcileSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityCalls:reconcileCall')

type CallRecoveryRequest = Parameters<CallService['readCallStatus']>[0]
type CallCancelRequest = Parameters<CallService['cancelCall']>[0]
type CallReconcileRequest = Parameters<CallService['reconcileCall']>[0]

export type CallHandlerOptions = Readonly<{
  authenticate?: NonNullable<Parameters<typeof authenticateAgentAccess>[0]>['authenticate']
  resolvePrincipal?: AgentAccessPrincipalResolver
  callService?: CallService
  timing?: ActionTimingSink
}>

export function createCallService(
  request: Request,
  bodyText: string,
): CallService {
  const operationKeyFor = (command: unknown, principalId: string, credentialId: string, applicationRef: string, environment: string) => canonicalDigest({
    contract: 'operation.invoke',
    principalId,
    credentialId,
    applicationRef,
    environment,
    command,
  })
  const callTool = async (input: CallServiceRequest) => {
    const operationKey = operationKeyFor({
      commitmentRef: input.input.quoteRef,
      idempotencyKey: input.input.idempotencyKey,
    }, input.principal.principalId, input.principal.credentialId, input.principal.applicationRef, input.principal.environment)
    const command = {
      quoteRef: input.input.quoteRef,
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
    const result = await callPublicSourceAction(callSourceAction, {
      ...command,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    })
    return callResultSchema.parse(result)
  }
  const quoteTool: NonNullable<CallService['quoteTool']> = async (input) => {
    const operationKey = operationKeyFor(
      {
        operationRef: input.input.toolRef,
        input: input.input.input,
      },
      input.principal.principalId,
      input.principal.credentialId,
      input.principal.applicationRef,
      input.principal.environment,
    )
    const command = {
      toolRef: input.input.toolRef,
      input: input.input.input,
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
    const result = await callPublicSourceAction(toolQuoteSourceAction, {
      ...command,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    })
    return toolQuoteAction.outputSchema.parse(result)
  }
  const listCalls: NonNullable<CallService['listCalls']> = async (input) => {
    const operationKey = operationKeyFor(input.input, input.principal.principalId, input.principal.credentialId, input.principal.applicationRef, input.principal.environment)
    const command = {
      toolRef: '',
      input: {},
      idempotencyKey: `list:${input.input.state ?? 'all'}:${input.input.cursor ?? 'start'}:${input.input.limit}`,
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
    const result = await callPublicSourceAction(callListSourceAction, {
      correlationId: input.correlationId,
      operationKey,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
      principal: input.principal,
      ...(input.input.state === undefined ? {} : { state: input.input.state }),
      paginationOpts: {
        numItems: input.input.limit,
        cursor: input.input.cursor ?? null,
      },
    })
    if (!isRecord(result) || !Array.isArray(result.page) || typeof result.isDone !== 'boolean' || typeof result.continueCursor !== 'string') {
      throw new Error('call_list_invalid')
    }
    return callListResultSchema.parse({
      kind: 'available',
      items: result.page,
      hasMore: !result.isDone,
      ...(!result.isDone && result.continueCursor.length > 0 ? { nextCursor: result.continueCursor } : {}),
    })
  }
  const readCallStatus = async (input: CallRecoveryRequest) => {
    const operationKey = operationKeyFor(input.callRef, input.principal.principalId, input.principal.credentialId, input.principal.applicationRef, input.principal.environment)
    const command = {
      toolRef: '',
      input: {},
      idempotencyKey: `status:${input.callRef}`,
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
    const result = await callPublicSourceAction(callStatusSourceAction, {
      callRef: input.callRef,
      ...(input.afterVersion === undefined ? {} : { afterVersion: input.afterVersion }),
      correlationId: input.correlationId,
      operationKey,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
      principal: input.principal,
    })
    return callStatusResultSchema.parse(result)
  }
  const cancelCall = async (input: CallCancelRequest) => {
    const operationKey = operationKeyFor({ invocationRef: input.callRef, idempotencyKey: input.idempotencyKey }, input.principal.principalId, input.principal.credentialId, input.principal.applicationRef, input.principal.environment)
    const command = {
      idempotencyKey: `cancel:${input.idempotencyKey}`,
      toolRef: '',
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
    const result = await callPublicSourceAction(callCancelSourceAction, {
      callRef: input.callRef,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      operationKey,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
      principal: input.principal,
    })
    return callRecoveryResultSchema.parse(result)
  }
  const reconcileCall = async (input: CallReconcileRequest) => {
    const operationKey = operationKeyFor({ invocationRef: input.callRef, idempotencyKey: input.idempotencyKey, evidence: input.evidence }, input.principal.principalId, input.principal.credentialId, input.principal.applicationRef, input.principal.environment)
    const command = {
      idempotencyKey: `reconcile:${input.idempotencyKey}`,
      toolRef: '',
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
    const result = await callPublicSourceAction(callReconcileSourceAction, {
      callRef: input.callRef,
      evidence: input.evidence,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      operationKey,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
      principal: input.principal,
    })
    return callRecoveryResultSchema.parse(result)
  }
  return { callTool, quoteTool, listCalls, readCallStatus, cancelCall, reconcileCall }
}
function gatewayTelemetryForResult(
  result: CallMachineResult,
): Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'> {
  if (result.kind === 'completed') {
    return {
      // Keep the telemetry sink's existing operation field stable while the
      // paid result envelope uses the target Tool vocabulary.
      operationRef: result.toolRef,
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
    return { operationRef: result.toolRef, outcome: 'pending' }
  }
  if (result.kind === 'outcome_unknown') {
    return { operationRef: result.toolRef, outcome: 'reconciliation_required', unknown: true }
  }
  const code = result.code
  return {
    ...(result.toolRef === undefined ? {} : { operationRef: result.toolRef }),
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
  callRef: string,
): Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'> {
  if (!isRecord(result)) return { invocationRef: callRef, outcome: 'failed', refusalCode: 'result_invalid' }
  const operationRef = typeof result.toolRef === 'string' ? result.toolRef : undefined
  if (result.kind === 'reconciliation_required') {
    return {
      invocationRef: callRef,
      ...(operationRef === undefined ? {} : { operationRef }),
      outcome: 'reconciliation_required',
      unknown: true,
    }
  }
  if (result.kind === 'refused') {
    const code = typeof result.code === 'string' ? result.code : 'call_failed'
    return {
      invocationRef: callRef,
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
      invocationRef: callRef,
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
  return { invocationRef: callRef, outcome: 'failed', refusalCode: 'result_invalid' }
}

function gatewayDetail(code: string): string {
  switch (code) {
    case 'authentication_required':
      return 'Authentication required.'
    case 'authority_denied':
      return 'The tool was declined by the owner.'
    case 'scope_required':
      return 'The provided API key does not carry the required scope.'
    case 'source_unavailable':
    case 'call_runtime_unavailable':
    case 'call_unavailable':
    case 'tool_quote_unavailable':
      return 'The Call service is temporarily unavailable.'
    case 'result_invalid':
    case 'call_result_invalid':
      return 'The Call service returned an invalid result.'
    case 'call_not_found':
      return 'The Call was not found.'
    default:
      return 'The Call request could not be completed.'
  }
}

function gatewayErrorCode(
  error: unknown,
  fallback: 'call_unavailable' | 'tool_quote_unavailable' | 'call_runtime_unavailable' | 'source_unavailable',
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
  fallback: 'call_unavailable' | 'tool_quote_unavailable' | 'call_runtime_unavailable' | 'source_unavailable',
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

function invalidContentTypeResponse(correlationId: string): Response {
  return withRequestCorrelationHeader(problem({
    status: 415,
    kind: 'UNSUPPORTED_MEDIA_TYPE',
    code: 'invalid_content_type',
  }), correlationId)
}

export async function authenticateCallGateway(
  request: Request,
  correlationId: string,
  options: CallHandlerOptions,
  body: string | Uint8Array,
): Promise<Readonly<{ kind: 'authenticated'; principal: GatewayPrincipalRef }> | Response> {
  const resolvePrincipal = options.resolvePrincipal
    ?? (options.authenticate === undefined ? resolveAgentAccessPrincipal(request, body, correlationId) : undefined)
  const admitted = await authenticateAgentAccess({
    ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
    ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
    consequenceResource: 'surface:http:tools-call',
    requiredScope: CALL_SCOPE,
  })
  if (admitted.kind === 'authenticated') return { kind: admitted.kind, principal: admitted.principal }
  const challenge = bearerChallenge(resolveCanonicalBaseUrl(request).baseUrl, CALL_SCOPE)
  const failure = gatewayFailureToProblem({ code: admitted.reason, kind: 'refused', retryable: false })
  return withRequestCorrelationHeader(problem({
    ...failure,
    status: admitted.status,
    detail: gatewayDetail(admitted.reason),
  }, { Vary: 'Authorization', 'WWW-Authenticate': challenge }), correlationId)
}


export async function handleToolQuotePost(
  request: Request,
  options: CallHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const bounded = await readBoundedRequestText(request, MAX_CALL_BODY_BYTES)
    if (!bounded.ok) {
      return withRequestCorrelationHeader(problem({
        status: 413,
        kind: 'PAYLOAD_TOO_LARGE',
        code: bounded.code,
        detail: 'The Tool inspection body is too large.',
      }), correlationId)
    }
    const admitted = await authenticateCallGateway(request, correlationId, options, bounded.text)
    if (admitted instanceof Response) return admitted
    if (!(await isJsonContentType(request.headers.get('content-type')))) {
      return invalidContentTypeResponse(correlationId)
    }
    let rawBody: unknown
    try {
      rawBody = JSON.parse(bounded.text) as unknown
    } catch {
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_json',
        detail: 'The request body must be valid JSON.',
      }), correlationId)
    }
    const parsed = toolQuoteAction.schema.safeParse(rawBody)
    if (!parsed.success) {
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_request',
        detail: 'The request did not match tool.quote:v2.',
      }), correlationId)
    }
    try {
      const service = options.callService ?? createCallService(request, bounded.text)
      if (service.quoteTool === undefined) throw new Error('tool_quote_unavailable')
      const result = await service.quoteTool({
        input: parsed.data,
        principal: admitted.principal,
        correlationId,
      })
      const projected = toolQuoteAction.outputSchema.parse(result)
      return withRequestCorrelationHeader(response(projected, 200, callJsonResponseHeaders), correlationId)
    } catch (error) {
      return gatewayErrorResponse(error, 'tool_quote_unavailable', correlationId)
    }
  })
}

export async function handleToolCallPost(
  request: Request,
  options: CallHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const startedAt = Date.now()
    const bounded = await readBoundedRequestText(request, MAX_CALL_BODY_BYTES)
    if (!bounded.ok) {
      return withRequestCorrelationHeader(problem({
        status: 413,
        kind: 'PAYLOAD_TOO_LARGE',
        code: bounded.code,
        detail: 'The Tool call body is too large.',
      }), correlationId)
    }
    const admitted = await authenticateCallGateway(request, correlationId, options, bounded.text)
    if (admitted instanceof Response) return admitted
    if (!(await isJsonContentType(request.headers.get('content-type')))) {
      return invalidContentTypeResponse(correlationId)
    }
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
    const parsed = callAction.schema.safeParse(rawBody)
    if (!parsed.success) {
      telemetry({ outcome: 'failed', refusalCode: 'invalid_request' })
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_request',
        detail: 'The request did not match tool.call:v1.',
      }), correlationId)
    }
    try {
      const service = options.callService ?? createCallService(request, bounded.text)
      const result = await service.callTool({ input: parsed.data, principal: admitted.principal, correlationId })
      const projected = callAction.outputSchema.safeParse(
        projectCallMachineResult(result),
      )
      if (!projected.success) {
        telemetry({ outcome: 'failed', refusalCode: 'call_result_invalid' })
        const failure = gatewayFailureToProblem({ kind: 'error', code: 'call_result_invalid' })
        return withRequestCorrelationHeader(problem({
          ...failure,
          detail: gatewayDetail(failure.code),
        }), correlationId)
      }
      telemetry(gatewayTelemetryForResult(projected.data))
      return withRequestCorrelationHeader(response(projected.data, 200, callJsonResponseHeaders), correlationId)
    } catch (error) {
      const mapped = gatewayErrorCode(error, 'call_unavailable')
      telemetry({
        outcome: mapped.code === 'source_unavailable' ? 'failed' : 'unknown',
        refusalCode: mapped.code,
        ...(mapped.code === 'call_unavailable' ? { unknown: true } : {}),
      })
      return gatewayErrorResponse(error, 'call_unavailable', correlationId)
    }
  })
}
type RecoveryBodyKind = 'cancel' | 'reconcile'

type ParsedRecoveryBody =
  | Readonly<{ ok: true; bodyText: string; input: unknown }>
  | Readonly<{ ok: false; response: Response }>

async function parseRecoveryBody(
  request: Request,
  callRef: string,
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
        detail: 'The tool recovery body is too large.',
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
  const bodyCallRef = rawBody.callRef
  if (bodyCallRef !== undefined && bodyCallRef !== callRef) {
    return {
      ok: false,
      response: withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'call_ref_mismatch',
        detail: 'The Call reference must match the request path.',
      }), correlationId),
    }
  }
  const candidate = {
    ...rawBody,
    callRef,
  }
  const parsed = bodyKind === 'cancel'
    ? callCancelInputSchema.safeParse(candidate)
    : callReconcileInputSchema.safeParse(candidate)
  if (!parsed.success) {
    return {
      ok: false,
      response: withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_request',
        detail: bodyKind === 'cancel'
          ? 'The request did not match call.cancel:v1.'
          : 'The request did not match call.reconcile:v1.',
      }), correlationId),
    }
  }
  return { ok: true, bodyText: bounded.text, input: parsed.data }
}

export async function handleCallStatusGet(
  request: Request,
  callRef: string,
  options: CallHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const startedAt = Date.now()
    const admitted = await authenticateCallGateway(request, correlationId, options, '')
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
    const url = new URL(request.url)
    const rawAfterVersion = url.searchParams.get('afterVersion')
    const parsed = callStatusInputSchema.safeParse({
      callRef,
      ...(rawAfterVersion === null ? {} : { afterVersion: Number(rawAfterVersion) }),
    })
    if (!parsed.success) {
      telemetry({ outcome: 'failed', refusalCode: 'invalid_call_ref' })
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_call_ref',
        detail: 'The Call reference is invalid.',
      }), correlationId)
    }
    try {
      const service = options.callService ?? createCallService(request, '')
      const result = await service.readCallStatus({
        callRef: parsed.data.callRef,
        ...(parsed.data.afterVersion === undefined ? {} : { afterVersion: parsed.data.afterVersion }),
        principal: admitted.principal,
        correlationId,
      })
      const projected = callStatusResultSchema.safeParse(result)
      if (!projected.success) {
        telemetry({ outcome: 'failed', refusalCode: 'call_result_invalid' })
        const failure = gatewayFailureToProblem({ kind: 'error', code: 'call_result_invalid' })
        return withRequestCorrelationHeader(problem({
          ...failure,
          detail: gatewayDetail(failure.code),
        }), correlationId)
      }
      telemetry(recoveryTelemetryForResult(projected.data, parsed.data.callRef))
      return withRequestCorrelationHeader(response(projected.data, 200, callJsonResponseHeaders), correlationId)
    } catch (error) {
      const mapped = gatewayErrorCode(error, 'call_runtime_unavailable')
      telemetry({
        outcome: 'unknown',
        refusalCode: mapped.code,
        unknown: true,
      })
      return gatewayErrorResponse(error, 'call_runtime_unavailable', correlationId)
    }
  })
}

export async function handleCallListGet(
  request: Request,
  options: CallHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const admitted = await authenticateCallGateway(request, correlationId, options, '')
    if (admitted instanceof Response) return admitted
    const url = new URL(request.url)
    const rawLimit = url.searchParams.get('limit')
    const rawCursor = url.searchParams.get('cursor')
    const rawState = url.searchParams.get('state')
    const parsed = callListInputSchema.safeParse({
      ...(rawLimit === null ? {} : { limit: Number(rawLimit) }),
      ...(rawCursor === null ? {} : { cursor: rawCursor }),
      ...(rawState === null ? {} : { state: rawState }),
    })
    if (!parsed.success) {
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_call_list_query',
        detail: 'Use limit 1-100, an opaque cursor, and an optional canonical Call state.',
      }), correlationId)
    }
    try {
      const service = options.callService ?? createCallService(request, '')
      if (service.listCalls === undefined) throw new Error('call_history_service_unavailable')
      const result = await service.listCalls({
        input: parsed.data,
        principal: admitted.principal,
        correlationId,
      })
      return withRequestCorrelationHeader(response(callListResultSchema.parse(result), 200, callJsonResponseHeaders), correlationId)
    } catch (error) {
      return gatewayErrorResponse(error, 'call_runtime_unavailable', correlationId)
    }
  })
}

export async function handleCallCancelPost(
  request: Request,
  callRef: string,
  options: CallHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const startedAt = Date.now()
    const parsed = await parseRecoveryBody(request, callRef, 'cancel', correlationId)
    if (!parsed.ok) return parsed.response
    const admitted = await authenticateCallGateway(request, correlationId, options, parsed.bodyText)
    if (admitted instanceof Response) return admitted
    if (!(await isJsonContentType(request.headers.get('content-type')))) {
      return invalidContentTypeResponse(correlationId)
    }
    const principal = admitted.principal
    const telemetry = (event: Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'>): void => {
      recordGatewayTelemetry(options.timing, {
        ...principalTelemetry(principal),
        ...event,
        correlationId,
        durationMs: Date.now() - startedAt,
      })
    }
    const command = callCancelInputSchema.parse(parsed.input)
    try {
      const service = options.callService ?? createCallService(request, parsed.bodyText)
      const result = await service.cancelCall({
        callRef: command.callRef,
        idempotencyKey: command.idempotencyKey,
        principal: admitted.principal,
        correlationId,
      })
      const projected = callRecoveryResultSchema.safeParse(result)
      if (!projected.success) {
        telemetry({ outcome: 'failed', refusalCode: 'call_result_invalid' })
        const failure = gatewayFailureToProblem({ kind: 'error', code: 'call_result_invalid' })
        return withRequestCorrelationHeader(problem({
          ...failure,
          detail: gatewayDetail(failure.code),
        }), correlationId)
      }
      telemetry(recoveryTelemetryForResult(projected.data, command.callRef))
      return withRequestCorrelationHeader(response(projected.data, 200, callJsonResponseHeaders), correlationId)
    } catch (error) {
      const mapped = gatewayErrorCode(error, 'call_runtime_unavailable')
      telemetry({
        outcome: 'unknown',
        refusalCode: mapped.code,
        unknown: true,
      })
      return gatewayErrorResponse(error, 'call_runtime_unavailable', correlationId)
    }
  })
}

export async function handleCallReconcilePost(
  request: Request,
  callRef: string,
  options: CallHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const startedAt = Date.now()
    const parsed = await parseRecoveryBody(request, callRef, 'reconcile', correlationId)
    if (!parsed.ok) return parsed.response
    const admitted = await authenticateCallGateway(request, correlationId, options, parsed.bodyText)
    if (admitted instanceof Response) return admitted
    if (!(await isJsonContentType(request.headers.get('content-type')))) {
      return invalidContentTypeResponse(correlationId)
    }
    const principal = admitted.principal
    const telemetry = (event: Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'>): void => {
      recordGatewayTelemetry(options.timing, {
        ...principalTelemetry(principal),
        ...event,
        correlationId,
        durationMs: Date.now() - startedAt,
      })
    }
    const command = callReconcileInputSchema.parse(parsed.input)
    try {
      const service = options.callService ?? createCallService(request, parsed.bodyText)
      const result = await service.reconcileCall({
        callRef: command.callRef,
        evidence: command.evidence,
        idempotencyKey: command.idempotencyKey,
        principal: admitted.principal,
        correlationId,
      })
      const projected = callRecoveryResultSchema.safeParse(result)
      if (!projected.success) {
        telemetry({ outcome: 'failed', refusalCode: 'call_result_invalid' })
        const failure = gatewayFailureToProblem({ kind: 'error', code: 'call_result_invalid' })
        return withRequestCorrelationHeader(problem({
          ...failure,
          detail: gatewayDetail(failure.code),
        }), correlationId)
      }
      telemetry(recoveryTelemetryForResult(projected.data, command.callRef))
      return withRequestCorrelationHeader(response(projected.data, 200, callJsonResponseHeaders), correlationId)
    } catch (error) {
      const mapped = gatewayErrorCode(error, 'call_runtime_unavailable')
      telemetry({
        outcome: 'unknown',
        refusalCode: mapped.code,
        unknown: true,
      })
      return gatewayErrorResponse(error, 'call_runtime_unavailable', correlationId)
    }
  })
}
