import { gatewayFailureToProblem, operationInvokeResultToProblem } from '@/lib/errors'
import { productionMoneyManifestReady } from '@/lib/deployment/env-schema'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { isJsonContentType } from '@/lib/server/json-content-type'
import {
  authRefusalProblem,
  authenticateAgentAccess,
  resolveAgentAccessPrincipal,
  type AgentAccessPrincipal,
  type AgentAccessPrincipalResolver,
} from '@/lib/server/agent-access-auth'
import { ConvexSourceError, callPublicSourceAction, callPublicSourceQuery, callPublicSourceMutation, sourceAction, sourceQuery, sourceMutation } from '@/lib/server/convex-source'
import { problem, duplicateQueryParameterProblem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { sourceWriteAdmissionFromRequest, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import { response } from '@/lib/server/no-store-response'
import { isRecord } from '@/modules/common/is-record'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { callAction } from '@/modules/capability-execution/call.actions'
import {
  toolQuoteAction,
} from '@/modules/capability-execution/quote.actions'
import { parsePlanRunReadback, parsePlanReadback } from '@/modules/capability-execution/plan/runtime.schemas'
import { projectToolQuoteRefusal } from '@/modules/capability-execution/quote'
import { toolPlanQuoteAction } from '@/modules/capability-execution/plan/quote.actions'
import {
  callListInputSchema,
  callListResultSchema,
} from '@/modules/capability-execution/call-history.actions'
import {
  callCancelInputSchema,
  callRecoveryResultSchema,
  callStatusInputSchema,
  callStatusResultSchema,
  projectCallStatusResult,
  projectCallRecoveryResult,
  callReconcileInputSchema,
} from '@/modules/capability-execution/call-recovery.actions'
import type { CallRecoveryResult } from '@/modules/capability-execution/call-recovery-contracts'
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
} from '@/modules/capability-execution/call-contracts'
import type { ActionTimingSink } from '@/modules/common/action'
import {
  recordGatewayTelemetry,
  type GatewayTelemetryEvent,
} from '@/lib/server/gateway-telemetry'
import {
  gatewayDetail,
  gatewayTelemetryForResult,
  principalTelemetry,
  recoveryTelemetryForResult,
} from './call-route-telemetry'

export { CALL_ACTION_ID, CALL_HTTP_PATH, CALL_SCOPE }
export type { CallService }

const callJsonResponseHeaders = {
  'Content-Type': CALL_ROUTE_CONTRACT.media.response,
} as const
const MAX_CALL_BODY_BYTES = 256 * 1024
const callSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityCalls:call')
const toolQuoteSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityQuotes:quote')
const planRunSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityPlans:run')
const planGetSourceQuery = sourceQuery<Record<string, unknown>, unknown>('capabilityPlans:get')
const planCancelSourceMutation = sourceMutation<Record<string, unknown>, unknown>('capabilityPlans:cancel')
const planQuoteSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityPlans:quote')
const callListSourceAction = sourceAction<Record<string, unknown>, unknown>('capabilityCalls:listCalls')
const callStatusSourceQuery = sourceQuery<Record<string, unknown>, unknown>('capabilityCallsStatus:readCallStatus')
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
    if (!productionMoneyManifestReady()) return {
      kind: 'refused' as const, code: 'operation_not_ready' as const, retryable: true,
      nextAction: 'Tool purchases are temporarily unavailable. You can keep searching for Tools.',
    }
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
    if (!productionMoneyManifestReady()) return projectToolQuoteRefusal({
      ...input.input, code: 'payments_not_ready', retryable: true, correlationRef: input.correlationId,
    })
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
      callRef: input.callRef,
      ...(input.afterVersion === undefined ? {} : { afterVersion: input.afterVersion }),
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
    const result = await callPublicSourceQuery(callStatusSourceQuery, {
      callRef: input.callRef,
      ...(input.afterVersion === undefined ? {} : { afterVersion: input.afterVersion }),
      correlationId: input.correlationId,
      operationKey,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
      principal: input.principal,
    })
    return projectCallStatusResult(callStatusResultSchema.parse(result))
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
    return projectCallRecoveryResult(callRecoveryResultSchema.parse(result))
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
    return projectCallRecoveryResult(callRecoveryResultSchema.parse(result))
  }
  const planQuote: NonNullable<CallService['planQuote']> = async ({ input, principal, correlationId }) => {
    const operationKey = canonicalDigest({
      contract: 'tool.plan.quote:v1', plan: input.plan,
      principalId: principal.principalId, credentialId: principal.credentialId,
      applicationRef: principal.applicationRef, environment: principal.environment,
    })
    const command = { planJson: JSON.stringify(input.plan), principal, correlationId, operationKey }
    const sourceWrite = await sourceWriteAdmissionFromRequest({
      request, command, body: bodyText, scope: 'protected_action', operationKey, correlationId,
    })
    return toolPlanQuoteAction.outputSchema.parse(await callPublicSourceAction(planQuoteSourceAction, {
      ...command, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite), sourceWrite,
    }))
  }
  async function planCommand(actionId: string, input: Record<string, unknown>, principal: AgentAccessPrincipal, correlationId: string) {
    const operationKey = canonicalDigest({ actionId, input, principalId: principal.principalId, applicationRef: principal.applicationRef, environment: principal.environment })
    const command = { ...input, principal, correlationId, operationKey }
    const sourceWrite = await sourceWriteAdmissionFromRequest({ request, command, body: bodyText, scope: 'protected_action', operationKey, correlationId })
    return { ...command, sourceWrite, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite) }
  }
  const planRun: NonNullable<CallService['planRun']> = async ({ input, principal, correlationId }) =>
    parsePlanRunReadback(await callPublicSourceAction(planRunSourceAction, await planCommand('tool.plan.run', input, principal, correlationId)))
  const planGet: NonNullable<CallService['planGet']> = async ({ input, principal, correlationId }) =>
    parsePlanReadback(await callPublicSourceQuery(planGetSourceQuery, await planCommand('tool.plan.get', input, principal, correlationId)))
  const planCancel: NonNullable<CallService['planCancel']> = async ({ input, principal, correlationId }) =>
    parsePlanRunReadback(await callPublicSourceMutation(planCancelSourceMutation, await planCommand('tool.plan.cancel', input, principal, correlationId)))
  return { callTool, quoteTool, planQuote, planRun, planGet, planCancel, listCalls, readCallStatus, cancelCall, reconcileCall }
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

export type AdmittedCallGateway = Readonly<{
  kind: 'authenticated'
  principal: AgentAccessPrincipal
}>

export async function authenticateCallGateway(
  request: Request,
  correlationId: string,
  options: CallHandlerOptions,
  body: string | Uint8Array,
): Promise<AdmittedCallGateway | Response> {
  const resolvePrincipal = options.resolvePrincipal
    ?? (options.authenticate === undefined ? resolveAgentAccessPrincipal(request, body, correlationId) : undefined)
  const admitted = await authenticateAgentAccess({
    request,
    ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
    ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
    consequenceResource: 'surface:http:tools-call',
    requiredScope: CALL_SCOPE,
  })
  if (admitted.kind === 'authenticated') return { kind: admitted.kind, principal: admitted.principal }
  recordGatewayTelemetry(options.timing,{correlationId,transport:'http',operation:'admission',stage:'pre_admission',durationMs:0,outcome:'refused',refusalCode:admitted.reason,retryable:admitted.reason==='source_unavailable'})
  return authRefusalProblem(request, admitted, CALL_SCOPE, undefined, correlationId)
}

const CALL_LIST_QUERY_KEYS = new Set(['limit', 'cursor', 'state'])
const CALL_STATUS_QUERY_KEYS = new Set(['afterVersion'])

function callQueryParameterProblem(url: URL, allowed: ReadonlySet<string>): Response | undefined {
  const duplicate = duplicateQueryParameterProblem(url)
  if (duplicate !== undefined) return duplicate
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) {
      return problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_query_parameter',
        detail: `Query parameter '${key}' is not supported.`,
      })
    }
  }
  return undefined
}

async function withCallHttpRateLimit(
  request: Request,
  correlationId: string,
  name: 'public-read' | 'public-mutation',
  operation: () => Promise<Response>,
): Promise<Response> {
  const res = await withHttpRateLimit(request, name, operation)
  if(res.status===429)recordGatewayTelemetry(undefined,{correlationId,transport:'http',operation:'admission',stage:'pre_admission',durationMs:0,outcome:'refused',refusalCode:'rate_limited',rateLimited:true})
  return withRequestCorrelationHeader(res, correlationId)
}

export async function handleToolQuotePost(
  request: Request,
  options: CallHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    return await withCallHttpRateLimit(request, correlationId, 'public-mutation', async () => {
    const startedAt=Date.now()
    const telemetry=(event:Omit<GatewayTelemetryEvent,'correlationId'|'durationMs'>)=>recordGatewayTelemetry(options.timing,{...event,correlationId,durationMs:Date.now()-startedAt,transport:'http',operation:'quote'})
    const bounded = await readBoundedRequestText(request, MAX_CALL_BODY_BYTES)
    if (!bounded.ok) {
      telemetry({outcome:'refused',stage:'pre_admission',refusalCode:'payload_too_large'})
      return withRequestCorrelationHeader(problem({
        status: 413,
        kind: 'PAYLOAD_TOO_LARGE',
        code: bounded.code,
        detail: 'The Tool quote body is too large.',
      }), correlationId)
    }
    const admitted = await authenticateCallGateway(request, correlationId, options, bounded.text)
    if (admitted instanceof Response) return admitted
    if (!(await isJsonContentType(request.headers.get('content-type')))) {
      telemetry({...principalTelemetry(admitted.principal),outcome:'refused',stage:'pre_admission',refusalCode:'invalid_content_type'})
      return invalidContentTypeResponse(correlationId)
    }
    let rawBody: unknown
    try {
      rawBody = JSON.parse(bounded.text)
    } catch (cause) {
      void cause;
      telemetry({...principalTelemetry(admitted.principal),outcome:'refused',stage:'pre_admission',refusalCode:'invalid_json'})
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_json',
        detail: 'The request body must be valid JSON.',
      }), correlationId)
    }
    const parsed = toolQuoteAction.schema.safeParse(rawBody)
    if (!parsed.success) {
      telemetry({...principalTelemetry(admitted.principal),outcome:'refused',stage:'pre_admission',refusalCode:'invalid_request'})
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_request',
        detail: 'The request did not match tool.quote:v2.',
      }), correlationId)
    }
    if (!productionMoneyManifestReady()) {telemetry({...principalTelemetry(admitted.principal),outcome:'refused',stage:'pre_admission',refusalCode:'payments_not_ready',retryable:true});return withRequestCorrelationHeader(response(projectToolQuoteRefusal({
      ...parsed.data, code: 'payments_not_ready', retryable: true, correlationRef: correlationId,
    }), 200, callJsonResponseHeaders), correlationId)}
    try {
      const service = options.callService ?? createCallService(request, bounded.text)
      if (service.quoteTool === undefined) throw new Error('tool_quote_unavailable')
      const result = await service.quoteTool({
        input: parsed.data,
        principal: admitted.principal,
        correlationId,
      })
      const projected = toolQuoteAction.outputSchema.parse(result)
      telemetry({...principalTelemetry(admitted.principal),operationRef:parsed.data.toolRef,stage:'execution',outcome:projected.kind==='refused'?'refused':'completed',...(projected.kind==='refused'?{refusalCode:projected.code,retryable:projected.retryable}:{})})
      return withRequestCorrelationHeader(response(projected, 200, callJsonResponseHeaders), correlationId)
    } catch (error) {
      telemetry({...principalTelemetry(admitted.principal),stage:'execution',outcome:'failed',refusalCode:gatewayErrorCode(error,'tool_quote_unavailable').code})
      return gatewayErrorResponse(error, 'tool_quote_unavailable', correlationId)
    }
    })
  })
}

export async function handleToolCallPost(
  request: Request,
  options: CallHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    return await withCallHttpRateLimit(request, correlationId, 'public-mutation', async () => {
    const startedAt = Date.now()
    const bounded = await readBoundedRequestText(request, MAX_CALL_BODY_BYTES)
    if (!bounded.ok) {
      recordGatewayTelemetry(options.timing,{correlationId,transport:'http',operation:'call',stage:'pre_admission',durationMs:Date.now()-startedAt,outcome:'refused',refusalCode:'payload_too_large'})
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
      recordGatewayTelemetry(options.timing,{...principalTelemetry(admitted.principal),correlationId,transport:'http',operation:'call',stage:'pre_admission',durationMs:Date.now()-startedAt,outcome:'refused',refusalCode:'invalid_content_type'})
      return invalidContentTypeResponse(correlationId)
    }
    const principal = admitted.principal
    const telemetry = (event: Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'>): void => {
      recordGatewayTelemetry(options.timing, {
        ...principalTelemetry(principal),
        ...event,
        correlationId,
        durationMs: Date.now() - startedAt,
        transport:'http',operation:'call',stage:event.stage??'execution',
      })
    }
    let rawBody: unknown
    try {
      rawBody = JSON.parse(bounded.text)
    } catch (cause) {
      void cause;
      telemetry({ outcome: 'failed', refusalCode: 'invalid_json',stage:'pre_admission' })
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_json',
        detail: 'The request body must be valid JSON.',
      }), correlationId)
    }
    const parsed = callAction.schema.safeParse(rawBody)
    if (!parsed.success) {
      telemetry({ outcome: 'failed', refusalCode: 'invalid_request',stage:'pre_admission' })
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_request',
        detail: 'The request did not match tool.call:v1.',
      }), correlationId)
    }
    if (!productionMoneyManifestReady()) {
      const refused = callAction.outputSchema.parse(projectCallMachineResult({
        kind: 'refused', code: 'operation_not_ready', retryable: true,
        nextAction: 'Tool purchases are temporarily unavailable. You can keep searching for Tools.',
      }))
      telemetry({...gatewayTelemetryForResult(refused),stage:'pre_admission'})
      return withRequestCorrelationHeader(response(refused, 200, callJsonResponseHeaders), correlationId)
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
  })
}

type RecoveryBodyKind = 'cancel' | 'reconcile'

type ParsedRecoveryBody =
  | Readonly<{ ok: true; bodyText: string; input: unknown }>
  | Readonly<{ ok: false; code: 'payload_too_large'|'invalid_json'|'invalid_request'; response: Response }>

async function parseRecoveryBody(
  request: Request,
  callRef: string,
  bodyKind: RecoveryBodyKind,
  correlationId: string,
): Promise<ParsedRecoveryBody> {
  const bounded = await readBoundedRequestText(request, 64 * 1024)
  if (!bounded.ok) {
    return {
      ok: false, code: 'payload_too_large',
      response: withRequestCorrelationHeader(problem({
        status: 413,
        kind: 'PAYLOAD_TOO_LARGE',
        code: bounded.code,
        detail: `The Call ${bodyKind} body is too large.`,
      }), correlationId),
    }
  }
  let rawBody: unknown
  try {
    rawBody = JSON.parse(bounded.text)
  } catch (cause) {
    void cause;
    return {
      ok: false, code: 'invalid_json',
      response: withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_json',
        detail: 'The request body must be valid JSON.',
      }), correlationId),
    }
  }
  if (!isRecord(rawBody) || typeof rawBody.idempotencyKey !== 'string') {
    return {
      ok: false, code: 'invalid_request',
      response: withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_request',
        detail: `The request must include an idempotencyKey to ${bodyKind} a Call.`,
      }), correlationId),
    }
  }
  return {
    ok: true,
    bodyText: bounded.text,
    input: {
      ...rawBody,
      callRef,
    },
  }
}

export async function handleCallStatusGet(
  request: Request,
  callRef: string,
  options: CallHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const url = new URL(request.url)
    const queryProblem = callQueryParameterProblem(url, CALL_STATUS_QUERY_KEYS)
    if (queryProblem !== undefined) {recordGatewayTelemetry(options.timing,{correlationId,transport:'http',operation:'admission',stage:'pre_admission',durationMs:0,outcome:'refused',refusalCode:'invalid_query'});return withRequestCorrelationHeader(queryProblem, correlationId)}
    return await withCallHttpRateLimit(request, correlationId, 'public-read', async () => {
    const startedAt = Date.now()
    const admitted = await authenticateCallGateway(request, correlationId, options, '')
    if (admitted instanceof Response) return admitted
    const principal = admitted.principal
    const telemetry = (event: Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'>): void => {
      recordGatewayTelemetry(options.timing, {
        ...principalTelemetry(principal),
        ...event,
        correlationId,
        durationMs: Date.now() - startedAt, transport:'http',operation:'status',stage:event.stage??'recovery',
      })
    }
    const rawAfterVersion = url.searchParams.get('afterVersion')
    const parsed = callStatusInputSchema.safeParse({
      callRef,
      ...(rawAfterVersion === null ? {} : { afterVersion: Number(rawAfterVersion) }),
    })
    if (!parsed.success) {
      telemetry({ outcome: 'failed', refusalCode: 'invalid_call_ref',stage:'pre_admission' })
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
      const refusalProblem = projected.data.kind === 'refused'
        ? operationInvokeResultToProblem(projected.data)
        : null
      telemetry(recoveryTelemetryForResult(projected.data, parsed.data.callRef))
      if (refusalProblem !== null) {
        return withRequestCorrelationHeader(problem({
          ...refusalProblem,
          detail: gatewayDetail(refusalProblem.code),
        }), correlationId)
      }
      return withRequestCorrelationHeader(response(projectCallStatusResult(projected.data), 200, callJsonResponseHeaders), correlationId)
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
  })
}

export async function handleCallListGet(
  request: Request,
  options: CallHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const url = new URL(request.url)
    const queryProblem = callQueryParameterProblem(url, CALL_LIST_QUERY_KEYS)
    if (queryProblem !== undefined) {recordGatewayTelemetry(options.timing,{correlationId,transport:'http',operation:'admission',stage:'pre_admission',durationMs:0,outcome:'refused',refusalCode:'invalid_query'});return withRequestCorrelationHeader(queryProblem, correlationId)}
    return await withCallHttpRateLimit(request, correlationId, 'public-read', async () => {
    const startedAt=Date.now()
    const telemetry=(event:Omit<GatewayTelemetryEvent,'correlationId'|'durationMs'>)=>recordGatewayTelemetry(options.timing,{...event,correlationId,transport:'http',operation:'list',stage:event.stage??'recovery',durationMs:Date.now()-startedAt})
    const admitted = await authenticateCallGateway(request, correlationId, options, '')
    if (admitted instanceof Response) return admitted
    const rawLimit = url.searchParams.get('limit')
    const rawCursor = url.searchParams.get('cursor')
    const rawState = url.searchParams.get('state')
    const parsed = callListInputSchema.safeParse({
      ...(rawLimit === null ? {} : { limit: Number(rawLimit) }),
      ...(rawCursor === null ? {} : { cursor: rawCursor }),
      ...(rawState === null ? {} : { state: rawState }),
    })
    if (!parsed.success) {
      telemetry({...principalTelemetry(admitted.principal),outcome:'refused',refusalCode:'invalid_call_list_query',stage:'pre_admission'})
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
      const output=callListResultSchema.parse(result)
      telemetry({...principalTelemetry(admitted.principal),outcome:'completed'})
      return withRequestCorrelationHeader(response(output, 200, callJsonResponseHeaders), correlationId)
    } catch (error) {
      telemetry({...principalTelemetry(admitted.principal),outcome:'failed',refusalCode:gatewayErrorCode(error,'call_runtime_unavailable').code})
      return gatewayErrorResponse(error, 'call_runtime_unavailable', correlationId)
    }
    })
  })
}

async function executeRecoveryAction(
  request: Request,
  callRef: string,
  kind: RecoveryBodyKind,
  options: CallHandlerOptions,
  action: (service: CallService, admitted: AdmittedCallGateway, parsedInput: unknown, correlationId: string) => Promise<CallRecoveryResult | Response>,
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    return await withCallHttpRateLimit(request, correlationId, 'public-mutation', async () => {
      const startedAt = Date.now()
      const parsed = await parseRecoveryBody(request, callRef, kind, correlationId)
      if (!parsed.ok) {recordGatewayTelemetry(options.timing,{correlationId,transport:'http',operation:kind,stage:'pre_admission',durationMs:Date.now()-startedAt,outcome:'refused',refusalCode:parsed.code});return parsed.response}
      const admitted = await authenticateCallGateway(request, correlationId, options, parsed.bodyText)
      if (admitted instanceof Response) return admitted
      if (!(await isJsonContentType(request.headers.get('content-type')))) {
        recordGatewayTelemetry(options.timing,{...principalTelemetry(admitted.principal),correlationId,transport:'http',operation:kind,stage:'pre_admission',durationMs:Date.now()-startedAt,outcome:'refused',refusalCode:'invalid_content_type'})
        return invalidContentTypeResponse(correlationId)
      }
      const principal = admitted.principal
      const telemetry = (event: Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'>): void => {
        recordGatewayTelemetry(options.timing, {
          ...principalTelemetry(principal),
          ...event,
          correlationId,
          durationMs: Date.now() - startedAt,transport:'http',operation:kind,stage:event.stage??'recovery',
        })
      }
      try {
        const service = options.callService ?? createCallService(request, parsed.bodyText)
        const result = await action(service, admitted, parsed.input, correlationId)
        if (result instanceof Response) {telemetry({outcome:'refused',refusalCode:'invalid_request',stage:'pre_admission'});return result}
        const projected = callRecoveryResultSchema.safeParse(result)
        if (!projected.success) {
          telemetry({ outcome: 'failed', refusalCode: 'call_result_invalid' })
          const failure = gatewayFailureToProblem({ kind: 'error', code: 'call_result_invalid' })
          return withRequestCorrelationHeader(problem({
            ...failure,
            detail: gatewayDetail(failure.code),
          }), correlationId)
        }
        telemetry(recoveryTelemetryForResult(projected.data, callRef))
        return withRequestCorrelationHeader(response(projectCallRecoveryResult(projected.data), 200, callJsonResponseHeaders), correlationId)
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
  })
}

export async function handleCallCancelPost(
  request: Request,
  callRef: string,
  options: CallHandlerOptions = {},
): Promise<Response> {
  return await executeRecoveryAction(request, callRef, 'cancel', options, async (service, admitted, input, correlationId) => {
    const parsed = callCancelInputSchema.safeParse(input)
    if (!parsed.success) {
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_request',
        detail: 'The cancel request is invalid.',
      }), correlationId)
    }
    const command = parsed.data
    return await service.cancelCall({
      callRef: command.callRef,
      idempotencyKey: command.idempotencyKey,
      principal: admitted.principal,
      correlationId,
    })
  })
}

export async function handleCallReconcilePost(
  request: Request,
  callRef: string,
  options: CallHandlerOptions = {},
): Promise<Response> {
  return await executeRecoveryAction(request, callRef, 'reconcile', options, async (service, admitted, input, correlationId) => {
    const parsed = callReconcileInputSchema.safeParse(input)
    if (!parsed.success) {
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_request',
        detail: 'The reconcile evidence is invalid.',
      }), correlationId)
    }
    const command = parsed.data
    return await service.reconcileCall({
      callRef: command.callRef,
      evidence: command.evidence,
      idempotencyKey: command.idempotencyKey,
      principal: admitted.principal,
      correlationId,
    })
  })
}
