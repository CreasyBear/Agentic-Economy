import {
  ROUTING_MCP_PROTOCOL_VERSION,
  ROUTING_MCP_TOOLS,
  ROUTING_OPERATIONS,
  ROUTING_PROTOCOL_VERSION,
} from './contract'

const DESCRIPTOR_PATH = '/.well-known/ae-routing.json'

export function handleRoutingKernelDescriptorRequest(request: Request): Response {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } })
  const url = new URL(request.url)
  if (url.pathname !== DESCRIPTOR_PATH) return new Response(null, { status: 404 })
  const origin = url.origin
  return Response.json({
    schemaVersion: 'ae-routing-descriptor:v1',
    protocolVersion: ROUTING_PROTOCOL_VERSION,
    name: 'Agentic Economy Routing Kernel',
    projections: {
      http: {
        operations: ROUTING_OPERATIONS.map((id) => ({ id, method: 'POST', url: `${origin}/v1/${id}` })),
      },
      mcp: {
        transport: 'streamable-http',
        protocolVersion: ROUTING_MCP_PROTOCOL_VERSION,
        url: `${origin}/mcp`,
        tools: [...ROUTING_MCP_TOOLS],
      },
    },
    callerAuthentication: {
      profile: 'web-bot-auth',
      signatureAgentDirectoryWellKnownPath: '/.well-known/http-message-signatures-directory',
      grantRequired: true,
    },
    executionAuthorization: {
      routeAuthorizationRequired: true,
      boundToQuoteDigest: true,
      idempotencyKeyRequired: true,
      incidentCanary: {
        purpose: 'incident_canary',
        recoveryGrantRequired: true,
        requestDigestProfile: 'canonical-authority-digest:execution-request:v1',
        requestDigestFields: [
          'quoteId', 'quoteDigest', 'authorizationRef', 'executionPurpose', 'canaryRecoveryGrantId', 'data',
        ],
        exactPlanBinding: true,
      },
    },
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300, must-revalidate',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
