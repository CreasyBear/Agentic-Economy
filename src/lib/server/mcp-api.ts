/**
 * MCP host adapter over the registered action registry. Anonymous requests
 * remain read-only; authenticated projections admit only explicitly surfaced
 * actions whose declared authority requirement fits the caller's mode.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Protocol } from '@modelcontextprotocol/sdk/shared/protocol.js'
import { safeParse, safeParseAsync } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import { getMethodLiteral } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js'
import { ErrorCode, McpError, type Notification, type Request as SdkRequest, type Result, type ServerNotification, type ServerRequest, type ServerResult } from '@modelcontextprotocol/sdk/types.js'
import type { AnyObjectSchema, SchemaOutput } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import { z } from 'zod'

import { bearerChallenge, bearerModeChallenge } from '@/lib/http/oauth-challenge'
import { buildProblem, gatewayFailureToProblem, type ProblemDetails, type ProblemKind } from '@/lib/errors'
import { problem } from '@/lib/server/problem'
import { readBoundedRequestJson, readBoundedRequestText, type BoundedRequestTextResult } from '@/lib/server/bounded-request-body'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { authenticateAgentAccess, resolveAgentAccessPrincipal } from '@/lib/server/agent-access-auth'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { recordGatewayTelemetry, type GatewayTelemetryEvent } from '@/lib/server/gateway-telemetry'
import { isRecord } from '@/modules/common/is-record'
import { listMcpActions, mcpToolName, type AnyAction } from '@/modules/actions'
import { customerRequestModeAllows, type CustomerRequestAuthorityMode } from '@/modules/customer-request/agent-contract'
import type { ActionAgentAccessPrincipal, ActionTimingSink } from '@/modules/common/action'
import type { OperationInvokeService } from '@/modules/capability-execution/operation-invoke'
import { createOperationInvokeService } from '@/lib/server/operation-invoke-api'
import { createSupplyManagementService, type SupplyManagementService } from '@/modules/capability-supply/supply-actions'
const MAX_MCP_REQUEST_BODY_BYTES = 320 * 1024
export type McpAccessTier = Readonly<{
  tier: 'anonymous' | 'authenticated'
  authorityMode?: CustomerRequestAuthorityMode
  principalId?: string
  principal?: ActionAgentAccessPrincipal
  correlationId?: string
  timing?: ActionTimingSink
  operationInvokeService?: OperationInvokeService
  supplyManagementService?: SupplyManagementService
}>

type AeServerHandler<T extends AnyObjectSchema> = (
  request: SchemaOutput<T>,
  extra: RequestHandlerExtra<ServerRequest | SdkRequest, ServerNotification | Notification>,
) => ServerResult | Result | Promise<ServerResult | Result>

/**
 * Keep request validation in the installed SDK while converting its raw
 * schema-parse throw into the JSON-RPC Invalid params error the SDK already
 * defines. McpError prefixes its message for local diagnostics, so this
 * adapter restores the concise wire-level message without changing the
 * SDK-owned error code or protocol handling.
 */
const INVALID_MCP_REQUEST_PARAMETERS_MESSAGE = 'Invalid MCP request parameters.'

class ConciseMcpRequestError extends McpError {
  constructor() {
    super(ErrorCode.InvalidParams, INVALID_MCP_REQUEST_PARAMETERS_MESSAGE)
    this.message = INVALID_MCP_REQUEST_PARAMETERS_MESSAGE
  }
}
class SafeMcpSdkServer extends Server {
  constructor() {
    super({ name: 'agentic-economy', version: '1.0.0' })
  }

  override setRequestHandler<T extends AnyObjectSchema>(
    requestSchema: T,
    handler: AeServerHandler<T>,
  ): void {
    const method = getMethodLiteral(requestSchema)
    const safeRequestSchema = z.looseObject({ method: z.literal(method) })
    const safeHandler = async (
      request: unknown,
      extra: RequestHandlerExtra<ServerRequest | SdkRequest, ServerNotification | Notification>,
    ): Promise<ServerResult | Result> => {
      const parsed = safeParse(requestSchema, request)
      if (!parsed.success) {
        throw new ConciseMcpRequestError()
      }
      return await handler(parsed.data, extra)
    }

    Reflect.apply(Protocol.prototype.setRequestHandler, this, [safeRequestSchema, safeHandler])
  }
}

type McpToolFailure = ProblemDetails

function mcpToolFailure(error: unknown, correlationId?: string): McpToolFailure {
  const failure = error instanceof ConvexSourceError
    ? gatewayFailureToProblem({
      code: error.code === 'missing_auth' ? 'authentication_required' : 'source_unavailable',
      retryable: error.status >= 500 || error.status === 429,
      kind: 'error',
    })
    : {
      kind: 'INTERNAL' as const,
      code: 'action_execution_failed',
      retryable: false,
    }
  return buildProblem({
    ...failure,
    detail: safeMcpFailureDetail(failure.kind),
    ...(correlationId === undefined ? {} : { extras: { correlationId } }),
  })
}

function safeMcpFailureDetail(kind: ProblemKind): string {
  switch (kind) {
    case 'UNAVAILABLE':
      return 'Action source is temporarily unavailable.'
    case 'UNAUTHENTICATED':
      return 'Action execution requires authentication.'
    case 'PERMISSION_DENIED':
      return 'Action execution is not permitted.'
    case 'NOT_FOUND':
      return 'Action target was not found.'
    default:
      return 'Action execution failed.'
  }
}

function mcpToolError(failure: McpToolFailure): {
  isError: true
  content: [{ type: 'text'; text: string }]
} {
  return {
    isError: true,
    content: [{
      type: 'text',
      text: JSON.stringify(failure),
    }],
  }
}

function mcpGatewayEvent(
  actionId: string,
  data: unknown,
  result: unknown,
): Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'> | undefined {
  if (!actionId.startsWith('operation.')) return undefined
  const input = isRecord(data) ? data : {}
  const output = isRecord(result) ? result : {}
  const invocationRef = typeof output.invocationRef === 'string'
    ? output.invocationRef
    : typeof input.invocationRef === 'string' ? input.invocationRef : undefined
  const operationRef = typeof output.operationRef === 'string'
    ? output.operationRef
    : typeof input.operationRef === 'string' ? input.operationRef : undefined
  if (output.kind === 'refused') {
    return {
      ...(invocationRef === undefined ? {} : { invocationRef }),
      ...(operationRef === undefined ? {} : { operationRef }),
      outcome: 'refused',
      refusalCode: typeof output.code === 'string' ? output.code : 'action_execution_failed',
      ...(typeof output.retryable === 'boolean' ? { retryable: output.retryable } : {}),
    }
  }
  if (output.kind === 'reconciliation_required') {
    return {
      ...(invocationRef === undefined ? {} : { invocationRef }),
      ...(operationRef === undefined ? {} : { operationRef }),
      outcome: 'reconciliation_required',
      unknown: true,
    }
  }
  if (output.kind === 'needs_authority') {
    return {
      ...(invocationRef === undefined ? {} : { invocationRef }),
      ...(operationRef === undefined ? {} : { operationRef }),
      outcome: 'needs_authority',
      approval: 'required',
    }
  }
  if (output.kind === 'pending') {
    return {
      ...(invocationRef === undefined ? {} : { invocationRef }),
      ...(operationRef === undefined ? {} : { operationRef }),
      outcome: 'pending',
    }
  }
  if (output.kind === 'found') {
    const state = output.state
    return {
      ...(invocationRef === undefined ? {} : { invocationRef }),
      ...(operationRef === undefined ? {} : { operationRef }),
      outcome: state === 'cancelled'
        ? 'cancelled'
        : state === 'reconciliation_required'
          ? 'reconciliation_required'
          : state === 'terminal'
            ? actionId === 'operation.reconcile' ? 'reconciled' : 'completed'
            : 'pending',
    }
  }
  if (output.kind === 'completed' || output.kind === 'ok') {
    return {
      ...(invocationRef === undefined ? {} : { invocationRef }),
      ...(operationRef === undefined ? {} : { operationRef }),
      outcome: 'completed',
    }
  }
  return {
    ...(invocationRef === undefined ? {} : { invocationRef }),
    ...(operationRef === undefined ? {} : { operationRef }),
    outcome: 'failed',
    refusalCode: 'action_execution_failed',
  }
}
function recordMcpGatewayTelemetry(
  actionId: string,
  data: unknown,
  result: unknown,
  access: McpAccessTier,
  startedAt: number,
): void {
  if (access.timing === undefined || access.principal === undefined) return
  const event = mcpGatewayEvent(actionId, data, result)
  if (event === undefined) return
  recordGatewayTelemetry(access.timing, {
    ...event,
    credentialId: access.principal.credentialId,
    principalId: access.principal.principalId,
    applicationRef: access.principal.applicationRef,
    ...(access.correlationId === undefined ? {} : { correlationId: access.correlationId }),
    durationMs: Date.now() - startedAt,
  })
}


export function createAeMcpServer(
  request: Request,
  actions: readonly AnyAction[] = listMcpActions(),
  access: McpAccessTier = { tier: 'anonymous' },
): McpServer {
  const admittedActions = access.tier === 'anonymous'
    ? actions.filter((action) => action.surfaces.includes('mcp') && action.readOnly && action.credentialAdmission === undefined)
    : actions.filter((action) => action.surfaces.includes('mcp') && (
      (action.credentialAdmission === undefined && action.readOnly)
      || (action.credentialAdmission !== undefined
        && access.principal?.scopes.includes(action.credentialAdmission.scope) === true)
      || (action.credentialAdmission === undefined
        && access.authorityMode !== undefined
        && customerRequestModeAllows(access.authorityMode, requiredModeForAction(action)))
    ))

  const server = new McpServer({ name: 'agentic-economy', version: '1.0.0' })
  const sdkServer = new SafeMcpSdkServer()
  const serverWithSdk = server as { server: Server }
  serverWithSdk.server = sdkServer
  for (const action of admittedActions) {
    server.registerTool(
      mcpToolName(action),
      {
        title: action.name,
        description: `${action.summary}\n\nBoundaries:\n${action.boundaries.map((boundary) => `- ${boundary}`).join('\n')}`,
        inputSchema: action.schema,
        outputSchema: { result: action.outputSchema },
        annotations: {
          readOnlyHint: action.readOnly,
          destructiveHint: !action.readOnly,
          idempotentHint: true,
        },
      },
      async (data: unknown) => {
        const startedAt = Date.now()
        try {
          const result = await action.run({
            data,
            context: {
              caller: 'mcp',
              request,
              ...(access.principal === undefined ? {} : { agentAccessPrincipal: access.principal }),
              ...(access.correlationId === undefined ? {} : { correlationId: access.correlationId }),
              ...(access.timing === undefined ? {} : { timing: access.timing }),
              ...(access.supplyManagementService === undefined ? {} : { supplyManagementService: access.supplyManagementService }),
              ...(access.operationInvokeService === undefined ? {} : { operationInvokeService: access.operationInvokeService }),
            },
          })
          const outputValidation = await safeParseAsync(action.outputSchema, result)
          if (!outputValidation.success) {
            recordMcpGatewayTelemetry(action.id, data, { kind: 'error' }, access, startedAt)
            return mcpToolError(buildProblem({
              kind: 'INTERNAL',
              code: 'action_output_invalid',
              detail: 'Action returned an invalid result.',
              ...(access.correlationId === undefined ? {} : { extras: { correlationId: access.correlationId } }),
            }))
          }
          recordMcpGatewayTelemetry(action.id, data, result, access, startedAt)
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(outputValidation.data) }],
            structuredContent: { result: outputValidation.data },
          }
        } catch (error) {
          recordMcpGatewayTelemetry(action.id, data, undefined, access, startedAt)
          return mcpToolError(mcpToolFailure(error, access.correlationId))
        }
      },
    )
  }

  return server
}

type McpRequestOptions = Readonly<{
  actions?: readonly AnyAction[]
  authenticate?: NonNullable<Parameters<typeof authenticateAgentAccess>[0]>['authenticate']
  supplyManagementService?: SupplyManagementService
  timing?: ActionTimingSink
  operationInvokeService?: OperationInvokeService
}>

export async function handleMcpRequest(request: Request, options: McpRequestOptions = {}): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const actions = options.actions ?? listMcpActions()
    const bounded = await boundedMcpRequest(request)
    if (!bounded.ok) {
      return withRequestCorrelationHeader(problem({
        status: 413,
        kind: 'PAYLOAD_TOO_LARGE',
        code: bounded.code,
        detail: 'The MCP request body is too large.',
      }), correlationId)
    }
    const boundedRequest = bounded.request
    const protectedTarget = await actionRequiringAuthenticationForRequest(boundedRequest, actions)
    if (protectedTarget !== undefined) {
      const protectedAction = protectedTarget.action
      const requiredMode = requiredModeForAction(protectedAction)
      const requiredScope = protectedTarget.generic ? null : protectedAction.credentialAdmission?.scope
      const admitted = await authenticateAgentAccess({
        ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
        ...(options.authenticate === undefined
          ? { resolvePrincipal: resolveAgentAccessPrincipal(boundedRequest, bounded.bodyText, correlationId) }
          : {}),
        ...(requiredScope === undefined ? {} : { requiredScope }),
        requiredMode,
      })
      if (admitted.kind === 'refused') {
        const base = resolveCanonicalBaseUrl(request).baseUrl
        const challenge = requiredScope !== undefined && requiredScope !== null
          ? bearerChallenge(base, requiredScope)
          : requiredMode === 'inspect_only'
            ? bearerChallenge(base)
            : bearerModeChallenge(base, requiredMode)
        const failure = gatewayFailureToProblem({ kind: 'refused', code: admitted.reason, retryable: false })
        return withRequestCorrelationHeader(problem(
          {
            ...failure,
            status: admitted.status,
            detail: admitted.reason === 'authentication_required'
              ? 'Authentication required.'
              : 'The provided API key does not carry the required scope.',
          },
          { Vary: 'Authorization', 'WWW-Authenticate': challenge },
        ), correlationId)
      }
      const server = createAeMcpServer(boundedRequest, actions, {
        tier: 'authenticated',
        authorityMode: admitted.principal.authorityMode,
        principalId: admitted.principal.principalId,
        principal: admitted.principal,
        correlationId,
        operationInvokeService: options.operationInvokeService
          ?? createOperationInvokeService(boundedRequest, bounded.bodyText),
        supplyManagementService: options.supplyManagementService
          ?? createSupplyManagementService(boundedRequest, bounded.bodyText),
      })
      return withRequestCorrelationHeader(await serveMcp(server, boundedRequest), correlationId)
    }
    const server = createAeMcpServer(boundedRequest, actions, { tier: 'anonymous', correlationId })
    return withRequestCorrelationHeader(await serveMcp(server, boundedRequest), correlationId)
  })
}

type BoundedMcpRequest =
  | Readonly<{ ok: true; request: Request; bodyText: string }>
  | Extract<BoundedRequestTextResult, { ok: false }>

async function boundedMcpRequest(request: Request): Promise<BoundedMcpRequest> {
  if (request.method !== 'POST') return { ok: true, request, bodyText: '' }
  const init = {
    method: request.method,
    headers: request.headers,
  }
  const boundedBody = await readBoundedRequestText(request, MAX_MCP_REQUEST_BODY_BYTES)
  if (!boundedBody.ok) return boundedBody
  return {
    ok: true,
    bodyText: boundedBody.text,
    request: new Request(request.url, { ...init, body: boundedBody.text }),
  }
}

async function serveMcp(server: McpServer, request: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
  await server.connect(transport)
  return await transport.handleRequest(request)
}

type McpAuthenticationTarget = Readonly<{
  action: AnyAction
  generic: boolean
}>

async function actionRequiringAuthenticationForRequest(
  request: Request,
  actions: readonly AnyAction[],
): Promise<McpAuthenticationTarget | undefined> {
  if (request.method !== 'POST') return undefined
  try {
    const boundedBody = await readBoundedRequestJson(request.clone(), MAX_MCP_REQUEST_BODY_BYTES)
    if (!boundedBody.ok || !isRecord(boundedBody.value)) return undefined
    const body = boundedBody.value
    const params = isRecord(body.params) ? body.params : undefined
    if (typeof params?.name === 'string') {
      const action = actions.find((candidate) => mcpToolName(candidate) === params.name)
      if (action !== undefined && (action.credentialAdmission !== undefined || !action.readOnly)) {
        return { action, generic: false }
      }
    }
    if (
      body.method === 'tools/list'
      && (request.headers.get('authorization')?.trim().length ?? 0) > 0
    ) {
      const action = actions.find((candidate) => candidate.credentialAdmission !== undefined)
      return action === undefined ? undefined : { action, generic: true }
    }
    return undefined
  } catch {
    return undefined
  }
}

function requiredModeForAction(action: AnyAction): CustomerRequestAuthorityMode {
  if (action.credentialAdmission?.authority === 'descriptor_classified' || action.readOnly) return 'inspect_only'
  const requirement = action.invocationContract?.authorityRequirement
  if (requirement === 'principal' || requirement === 'caller') return 'approve_each'
  if (requirement === 'owner' || requirement === 'admin') return 'bounded_mandate'
  return 'approve_each'
}
