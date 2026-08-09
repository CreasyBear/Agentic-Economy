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
import { getMethodLiteral, toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js'
import { ErrorCode, ListToolsRequestSchema, McpError, type Notification, type Request as SdkRequest, type Result, type ServerNotification, type ServerRequest, type ServerResult } from '@modelcontextprotocol/sdk/types.js'
import type { AnyObjectSchema, SchemaOutput } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import { ZodObject, z } from 'zod'

import { bearerChallenge, bearerModeChallenge } from '@/lib/http/oauth-challenge'
import { kindForStatus, type ProblemKind } from '@/lib/errors'
import { problem } from '@/lib/server/problem'
import { readBoundedRequestJson, readBoundedRequestText, type BoundedRequestTextResult } from '@/lib/server/bounded-request-body'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { authenticateCustomerRequestAgent } from '@/lib/server/customer-request-agent-auth'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { isRecord } from '@/modules/common/is-record'
import { listMcpActions, mcpToolName, type AnyAction } from '@/modules/actions'
import { customerRequestModeAllows, type CustomerRequestAuthorityMode } from '@/modules/customer-request/agent-contract'

const MAX_MCP_REQUEST_BODY_BYTES = 64 * 1024

export type McpAccessTier = Readonly<{
  tier: 'anonymous' | 'authenticated'
  authorityMode?: CustomerRequestAuthorityMode
  principalId?: string
}> 

type SdkServerHandler = (
  request: unknown,
  extra: RequestHandlerExtra<ServerRequest | SdkRequest, ServerNotification | Notification>,
) => ServerResult | Result | Promise<ServerResult | Result>

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
  private readonly captureToolsListHandler: ((handler: SdkServerHandler) => void) | undefined

  constructor(captureToolsListHandler?: (handler: SdkServerHandler) => void) {
    super({ name: 'agentic-economy', version: '1.0.0' })
    this.captureToolsListHandler = captureToolsListHandler
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

    if (method === 'tools/list') {
      this.captureToolsListHandler?.(safeHandler)
    }

    Reflect.apply(Protocol.prototype.setRequestHandler, this, [safeRequestSchema, safeHandler])
  }
}

type McpToolFailure = Readonly<{
  kind: ProblemKind
  code: string
  retryable: boolean
  detail: string
}>

function mcpToolFailure(error: unknown): McpToolFailure {
  if (error instanceof ConvexSourceError) {
    const kind = kindForStatus(error.status)
    return {
      kind,
      code: error.code,
      retryable: kind === 'UNAVAILABLE' || kind === 'RESOURCE_EXHAUSTED',
      detail: safeMcpFailureDetail(kind),
    }
  }
  return {
    kind: 'INTERNAL',
    code: 'action_execution_failed',
    retryable: false,
    detail: 'Action execution failed.',
  }
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
      text: `${failure.detail} (code=${failure.code}; kind=${failure.kind}; retryable=${String(failure.retryable)}).`,
    }],
  }
}

/**
 * SDK 1.30's high-level list projection only emits object-shaped output
 * schemas. Project the canonical action schema through that same SDK converter
 * here so unions remain present without a second hand-maintained schema.
 */
function projectMcpToolsList(
  value: unknown,
  actions: readonly AnyAction[],
): ServerResult | Result {
  if (!isRecord(value) || !Array.isArray(value.tools)) return value as ServerResult
  const outputSchemas = new Map(actions.map((action) => [mcpToolName(action), action.outputSchema]))
  return {
    ...value,
    tools: value.tools.map((tool) => {
      if (!isRecord(tool) || typeof tool.name !== 'string') return tool
      const outputSchema = outputSchemas.get(tool.name)
      if (outputSchema === undefined) return tool
      return {
        ...tool,
        outputSchema: toJsonSchemaCompat(outputSchema, {
          strictUnions: true,
          pipeStrategy: 'output',
        }),
      }
    }),
  } as ServerResult
}

export function createAeMcpServer(
  request: Request,
  actions: readonly AnyAction[] = listMcpActions(),
  access: McpAccessTier = { tier: 'anonymous' },
): McpServer {
  const admittedActions = access.tier === 'anonymous'
    ? actions
    : actions.filter((action) => action.surfaces.includes('mcp') && (action.readOnly || (access.authorityMode !== undefined && customerRequestModeAllows(access.authorityMode, requiredModeForAction(action)))))
  if (access.tier === 'anonymous') {
    for (const action of admittedActions) {
      if (!action.readOnly) throw new Error(`MCP anonymous tier admits only read-only actions: ${action.id}`)
    }
  }

  let toolsListHandler: SdkServerHandler | undefined
  const server = new McpServer({ name: 'agentic-economy', version: '1.0.0' })
  const sdkServer = new SafeMcpSdkServer((handler) => {
    if (toolsListHandler === undefined) toolsListHandler = handler
  })
  const serverWithSdk = server as { server: Server }
  serverWithSdk.server = sdkServer

  for (const action of admittedActions) {
    server.registerTool(
      mcpToolName(action),
      {
        title: action.name,
        description: `${action.summary}\n\nBoundaries:\n${action.boundaries.map((boundary) => `- ${boundary}`).join('\n')}`,
        inputSchema: action.schema,
        ...(action.outputSchema instanceof ZodObject ? { outputSchema: action.outputSchema } : {}),
        annotations: {
          readOnlyHint: action.readOnly,
          destructiveHint: !action.readOnly,
          idempotentHint: true,
        },
      },
      async (data: unknown) => {
        try {
          const result = await action.run({ data, context: { caller: 'mcp', request } })
          const outputValidation = await safeParseAsync(action.outputSchema, result)
          if (!outputValidation.success) {
            return mcpToolError({
              kind: 'INTERNAL',
              code: 'action_output_invalid',
              retryable: false,
              detail: 'Action returned an invalid result.',
            })
          }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
            structuredContent: result,
          }
        } catch (error) {
          return mcpToolError(mcpToolFailure(error))
        }
      },
    )
  }

  const baseToolsListHandler = toolsListHandler
  if (baseToolsListHandler === undefined) throw new Error('MCP tools/list handler was not registered.')
  sdkServer.removeRequestHandler('tools/list')
  sdkServer.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
    return projectMcpToolsList(await baseToolsListHandler(request, extra), admittedActions)
  })
  return server
}

type McpRequestOptions = Readonly<{
  actions?: readonly AnyAction[]
  authenticate?: NonNullable<Parameters<typeof authenticateCustomerRequestAgent>[0]>['authenticate']
}>

export async function handleMcpRequest(request: Request, options: McpRequestOptions = {}): Promise<Response> {
  const actions = options.actions ?? listMcpActions()
  const bounded = await boundedMcpRequest(request)
  if (!bounded.ok) {
    return problem({
      status: 413,
      kind: 'PAYLOAD_TOO_LARGE',
      code: bounded.code,
      detail: 'The MCP request body is too large.',
    })
  }
  const boundedRequest = bounded.request
  const protectedAction = await protectedActionForRequest(boundedRequest, actions)
  if (protectedAction !== undefined) {
    const requiredMode = requiredModeForAction(protectedAction)
    const admitted = await authenticateCustomerRequestAgent({
      ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
      requiredMode,
    })
    if (admitted.kind === 'refused') {
      const base = resolveCanonicalBaseUrl(request).baseUrl
      const challenge = requiredMode === 'inspect_only'
        ? bearerChallenge(base)
        : bearerModeChallenge(base, requiredMode)
      return problem(
        {
          status: admitted.status,
          kind: kindForStatus(admitted.status),
          code: admitted.reason,
          detail: admitted.reason === 'authentication_required'
            ? 'Authentication required.'
            : 'The provided API key does not carry the required scope.',
        },
        { Vary: 'Authorization', 'WWW-Authenticate': challenge },
      )
    }
    const server = createAeMcpServer(boundedRequest, actions, {
      tier: 'authenticated',
      authorityMode: admitted.principal.authorityMode,
      principalId: admitted.principal.principalId,
    })
    return await serveMcp(server, boundedRequest)
  }
  const server = createAeMcpServer(boundedRequest, actions, { tier: 'anonymous' })
  return await serveMcp(server, boundedRequest)
}

type BoundedMcpRequest =
  | Readonly<{ ok: true; request: Request }>
  | Extract<BoundedRequestTextResult, { ok: false }>

async function boundedMcpRequest(request: Request): Promise<BoundedMcpRequest> {
  if (request.method !== 'POST') return { ok: true, request }
  const init = {
    method: request.method,
    headers: request.headers,
  }
  const boundedBody = await readBoundedRequestText(request, MAX_MCP_REQUEST_BODY_BYTES)
  if (!boundedBody.ok) return boundedBody
  return {
    ok: true,
    request: new Request(request.url, { ...init, body: boundedBody.text }),
  }
}


async function serveMcp(server: McpServer, request: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
  await server.connect(transport)
  return await transport.handleRequest(request)
}

async function protectedActionForRequest(request: Request, actions: readonly AnyAction[]): Promise<AnyAction | undefined> {
  if (request.method !== 'POST') return undefined
  try {
    const boundedBody = await readBoundedRequestJson(request.clone(), MAX_MCP_REQUEST_BODY_BYTES)
    if (!boundedBody.ok) return undefined
    const body = boundedBody.value
    if (typeof body !== 'object' || body === null || !('params' in body)) return undefined
    const params = body.params
    if (typeof params !== 'object' || params === null || !('name' in params) || typeof params.name !== 'string') return undefined
    const action = actions.find((candidate) => mcpToolName(candidate) === params.name)
    return action !== undefined && !action.readOnly ? action : undefined
  } catch {
    return undefined
  }
}

function requiredModeForAction(action: AnyAction): CustomerRequestAuthorityMode {
  if (action.readOnly) return 'inspect_only'
  const requirement = action.invocationContract?.authorityRequirement
  if (requirement === 'principal' || requirement === 'caller') return 'approve_each'
  if (requirement === 'owner' || requirement === 'admin') return 'bounded_mandate'
  return 'approve_each'
}
