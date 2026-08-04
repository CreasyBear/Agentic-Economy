/**
 * MCP host adapter over the registered action registry. Anonymous requests
 * remain read-only; authenticated projections admit only explicitly surfaced
 * actions whose declared authority requirement fits the caller's mode.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { ZodObject } from 'zod'

import { bearerChallenge, bearerModeChallenge } from '@/lib/http/oauth-challenge'
import { readBoundedRequestJson, readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { authenticateCustomerRequestAgent } from '@/lib/server/customer-request-agent-auth'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { listMcpActions, mcpToolName, type AnyAction } from '@/modules/actions'
import { customerRequestModeAllows, type CustomerRequestAuthorityMode } from '@/modules/customer-request/agent-contract'

const MAX_MCP_REQUEST_BODY_BYTES = 64 * 1024

export type McpAccessTier = Readonly<{
  tier: 'anonymous' | 'authenticated'
  authorityMode?: CustomerRequestAuthorityMode
  principalId?: string
}> 

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

  const server = new McpServer({ name: 'agentic-economy', version: '1.0.0' })
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
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
            structuredContent: result,
          }
        } catch (error) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: error instanceof Error ? error.message : 'Action failed.',
            }],
          }
        }
      },
    )
  }
  return server
}

type McpRequestOptions = Readonly<{
  actions?: readonly AnyAction[]
  authenticate?: NonNullable<Parameters<typeof authenticateCustomerRequestAgent>[0]>['authenticate']
}>

export async function handleMcpRequest(request: Request, options: McpRequestOptions = {}): Promise<Response> {
  const actions = options.actions ?? listMcpActions()
  const boundedRequest = await boundedMcpRequest(request)
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
      const headers = new Headers({
        'Cache-Control': 'no-store',
        Vary: 'Authorization',
        'WWW-Authenticate': challenge,
      })
      return Response.json({ kind: 'refused', reason: admitted.reason }, { status: admitted.status, headers })
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

async function boundedMcpRequest(request: Request): Promise<Request> {
  if (request.method !== 'POST') return request
  const init = {
    method: request.method,
    headers: request.headers,
  }
  try {
    const boundedBody = await readBoundedRequestText(request, MAX_MCP_REQUEST_BODY_BYTES)
    return new Request(request.url, { ...init, body: boundedBody.ok ? boundedBody.text : '' })
  } catch {
    return new Request(request.url, { ...init, body: '' })
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
