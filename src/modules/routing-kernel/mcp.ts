import { z } from 'zod'

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'

import { admitRequest, releaseRequest, type RoutingAdmissionOperation, type RoutingKernelHttpDependencies } from './http'
import { ROUTING_MCP_PROTOCOL_VERSION, ROUTING_PROTOCOL_VERSION } from './contract'

const MAX_BODY_BYTES = 64 * 1024
const protocolVersion = z.literal(ROUTING_PROTOCOL_VERSION)
const schemas = {
  'ae.route': z.object({
    protocolVersion,
    networkId: z.string().min(1).max(200),
    query: z.string().trim().min(1).max(8_000),
    constraints: z.object({ currency: z.string().regex(/^[A-Z]{3}$/), maximumSpendMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), optimizeFor: z.enum(['cost', 'latency']).optional() }).strict(),
  }).strict(),
  'ae.execute': z.object({
    protocolVersion, quoteId: z.string().min(1).max(200), quoteDigest: z.string().min(1).max(200),
    authorizationRef: z.string().min(1).max(200).optional(),
    approval: z.object({ maximumSpendMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), currency: z.string().regex(/^[A-Z]{3}$/), expiresAt: z.number().int().positive(), allowedDataFields: z.array(z.string().min(1).max(200)).max(128) }).strict().optional(),
    idempotencyKey: z.string().min(1).max(200), data: z.record(z.string().min(1).max(200), z.string().max(8_000)).optional(),
    executionPurpose: z.literal('incident_canary').optional(), canaryRecoveryGrantId: z.string().min(1).max(200).optional(),
  }).strict()
    .refine((value) => (value.authorizationRef === undefined) !== (value.approval === undefined))
    .refine((value) => (value.executionPurpose === 'incident_canary') === (value.canaryRecoveryGrantId !== undefined)),
  'ae.authorize': z.object({
    protocolVersion, quoteId: z.string().min(1).max(200), quoteDigest: z.string().min(1).max(200),
    maximumSpendMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().regex(/^[A-Z]{3}$/), expiresAt: z.number().int().positive(),
    allowedDataFields: z.array(z.string().min(1).max(200)).max(128), idempotencyKey: z.string().min(1).max(200),
  }).strict(),
  'ae.reconcile': z.object({
    protocolVersion, rootRunId: z.string().min(1).max(200), recoveryGrantId: z.string().min(1).max(200).optional(),
  }).strict(),
  'ae.inspect': z.object({ protocolVersion, rootRunId: z.string().min(1).max(200) }).strict(),
  'ae.cancel': z.object({ protocolVersion, rootRunId: z.string().min(1).max(200) }).strict(),
} as const

const tools = [
  tool('ae.route', 'Plan and quote a route through registered capabilities.', schemas['ae.route']),
  tool('ae.authorize', 'Create delegated execution authority bound to one route quote.', schemas['ae.authorize']),
  tool('ae.execute', 'Execute an authorized route quote exactly once.', schemas['ae.execute']),
  tool('ae.reconcile', 'Read provider state for an uncertain run without executing it again.', schemas['ae.reconcile']),
  tool('ae.inspect', 'Inspect a kernel run and its protocol records.', schemas['ae.inspect']),
  tool('ae.cancel', 'Request cancellation of a kernel run.', schemas['ae.cancel']),
]

export async function handleRoutingKernelMcpRequest(request: Request, dependencies: RoutingKernelHttpDependencies): Promise<Response> {
  if (request.method === 'GET' || request.method === 'DELETE') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().includes('application/json')) return new Response(null, { status: 415 })
  const accept = (request.headers.get('Accept') ?? '').toLowerCase()
  if (!accept.includes('application/json') || !accept.includes('text/event-stream')) return new Response(null, { status: 406 })
  const body = await readBoundedRequestText(request, MAX_BODY_BYTES)
  if (!body.ok) return new Response(null, { status: 413 })
  const authentication = await dependencies.authenticate(request, body.text)
  if (authentication.kind !== 'authenticated') return jsonRpc({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Authentication required' } }, 401)

  let message: unknown
  try { message = JSON.parse(body.text) } catch { return jsonRpc({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400) }
  const envelope = z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number(), z.null()]).optional(), method: z.string(), params: z.unknown().optional() }).strict().safeParse(message)
  if (!envelope.success) return jsonRpc({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, 400)
  const { id = null, method, params } = envelope.data
  const admission = await admitRequest(request, dependencies, authentication.caller, admissionOperation(method, params))
  if (admission.kind === 'refused') return admissionRpcError(id, admission)
  try {
    if (method === 'notifications/initialized') return new Response(null, { status: 202 })
    if (method === 'initialize') {
    const init = z.object({ protocolVersion: z.string(), capabilities: z.record(z.string(), z.unknown()), clientInfo: z.object({ name: z.string(), version: z.string() }).passthrough() }).passthrough().safeParse(params)
    if (!init.success) return rpcError(id, -32602, 'Invalid initialize parameters')
    return jsonRpc({ jsonrpc: '2.0', id, result: { protocolVersion: ROUTING_MCP_PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'agentic-economy-routing-kernel', version: '0.1.0' }, instructions: 'Delegate route planning, authorization, execution, reconciliation, inspection, and cancellation through the six ae.* tools. Caller identity is supplied by the authenticated transport.' } })
    }
    if (request.headers.get('MCP-Protocol-Version') !== ROUTING_MCP_PROTOCOL_VERSION) return new Response(null, { status: 400 })
    if (method === 'tools/list') return jsonRpc({ jsonrpc: '2.0', id, result: { tools } })
    if (method !== 'tools/call') return rpcError(id, -32601, 'Method not found')

    const call = z.object({ name: z.string(), arguments: z.unknown().optional(), _meta: z.unknown().optional() }).strict().safeParse(params)
    if (!call.success || !(call.data.name in schemas)) return rpcError(id, -32602, 'Unknown tool or invalid call parameters')
    const name = call.data.name as keyof typeof schemas
    try {
      const caller = authentication.caller
      let result: unknown
      switch (name) {
      case 'ae.route': {
        const input = schemas[name].safeParse(call.data.arguments ?? {})
        if (!input.success) return toolError(id, 'Invalid tool arguments')
        if (authentication.grant !== undefined && (
          !authentication.grant.networkIds.includes(input.data.networkId)
          || authentication.grant.currency !== input.data.constraints.currency
          || authentication.grant.maximumSpendMinor < input.data.constraints.maximumSpendMinor
          || authentication.grant.expiresAt <= Date.now()
        )) return toolError(id, 'grant_constraints_exceeded')
        result = await dependencies.operations.route({
          caller, networkId: input.data.networkId, query: input.data.query,
          constraints: {
            currency: input.data.constraints.currency,
            maximumSpendMinor: input.data.constraints.maximumSpendMinor,
            ...(input.data.constraints.optimizeFor === undefined ? {} : { optimizeFor: input.data.constraints.optimizeFor }),
          },
        }); break
      }
      case 'ae.execute': {
        const input = schemas[name].safeParse(call.data.arguments ?? {})
        if (!input.success) return toolError(id, 'Invalid tool arguments')
        let authorizationRef = input.data.authorizationRef
        if (input.data.approval !== undefined) {
          if (dependencies.authorize === undefined) return toolError(id, 'Authorization unavailable')
          const grant = authentication.grant
          if (grant === undefined
            || grant.currency !== input.data.approval.currency
            || grant.maximumSpendMinor < input.data.approval.maximumSpendMinor
            || grant.expiresAt < input.data.approval.expiresAt
            || input.data.approval.allowedDataFields.some((field) => !grant.allowedDataFields.includes(field))) {
            return toolError(id, 'grant_constraints_exceeded')
          }
          const authorization = await dependencies.authorize({ caller, quoteId: input.data.quoteId, quoteDigest: input.data.quoteDigest, ...input.data.approval, idempotencyKey: input.data.idempotencyKey, sourceGrantId: grant.grantId })
          if (authorization.kind !== 'authorized') return toolError(id, authorization.reason)
          authorizationRef = authorization.authorizationRef
        }
        if (authorizationRef === undefined) return toolError(id, 'Authorization required')
        result = await dependencies.operations.execute({
          caller, quoteId: input.data.quoteId, quoteDigest: input.data.quoteDigest,
          authorizationRef, idempotencyKey: input.data.idempotencyKey,
          ...(input.data.data === undefined ? {} : { data: input.data.data }),
          ...(input.data.executionPurpose === undefined ? {} : { executionPurpose: input.data.executionPurpose }),
          ...(input.data.canaryRecoveryGrantId === undefined ? {} : { canaryRecoveryGrantId: input.data.canaryRecoveryGrantId }),
        }); break
      }
      case 'ae.authorize': {
        const input = schemas[name].safeParse(call.data.arguments ?? {})
        if (!input.success) return toolError(id, 'Invalid tool arguments')
        if (dependencies.authorize === undefined) return toolError(id, 'Authorization unavailable')
        const grant = authentication.grant
        if (grant === undefined || grant.currency !== input.data.currency
          || grant.maximumSpendMinor < input.data.maximumSpendMinor || grant.expiresAt < input.data.expiresAt
          || input.data.allowedDataFields.some((field) => !grant.allowedDataFields.includes(field))) {
          return toolError(id, 'grant_constraints_exceeded')
        }
        result = await dependencies.authorize({ caller, ...input.data, sourceGrantId: grant.grantId })
        break
      }
      case 'ae.inspect': {
        const input = schemas[name].safeParse(call.data.arguments ?? {})
        if (!input.success) return toolError(id, 'Invalid tool arguments')
        result = await dependencies.operations.inspect({ caller, rootRunId: input.data.rootRunId }); break
      }
      case 'ae.reconcile': {
        const input = schemas[name].safeParse(call.data.arguments ?? {})
        if (!input.success) return toolError(id, 'Invalid tool arguments')
        result = await dependencies.operations.reconcileProviderOutcome({
          caller, rootRunId: input.data.rootRunId,
          ...(input.data.recoveryGrantId === undefined ? {} : { recoveryGrantId: input.data.recoveryGrantId }),
        }); break
      }
      case 'ae.cancel': {
        const input = schemas[name].safeParse(call.data.arguments ?? {})
        if (!input.success) return toolError(id, 'Invalid tool arguments')
        result = await dependencies.operations.cancel({ caller, rootRunId: input.data.rootRunId }); break
      }
      }
      return jsonRpc({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: false } })
    } catch { return toolError(id, 'Kernel operation failed') }
  } finally {
    await releaseRequest(dependencies, admission)
  }
}

function admissionOperation(method: string, params: unknown): RoutingAdmissionOperation {
  if (method !== 'tools/call' || typeof params !== 'object' || params === null || Array.isArray(params)) return 'mcp_control'
  const name = Reflect.get(params, 'name')
  switch (name) {
    case 'ae.route': return 'route'
    case 'ae.authorize': return 'authorize'
    case 'ae.execute': return 'execute'
    case 'ae.reconcile': return 'reconcile'
    case 'ae.inspect': return 'inspect'
    case 'ae.cancel': return 'cancel'
    default: return 'mcp_control'
  }
}

function admissionRpcError(id: string | number | null, admission: { reason: string; retryAfterMs: number }): Response {
  const status = admission.reason.includes('saturated') ? 503 : 429
  const response = jsonRpc({ jsonrpc: '2.0', id, error: { code: -32002, message: admission.reason } }, status)
  response.headers.set('Retry-After', String(Math.max(1, Math.ceil(admission.retryAfterMs / 1_000))))
  return response
}

function tool(name: string, description: string, schema: z.ZodType) {
  return { name, description, inputSchema: z.toJSONSchema(schema), annotations: { readOnlyHint: name === 'ae.route' || name === 'ae.inspect', destructiveHint: name === 'ae.execute' || name === 'ae.cancel', idempotentHint: name !== 'ae.route' } }
}
function rpcError(id: string | number | null, code: number, message: string) { return jsonRpc({ jsonrpc: '2.0', id, error: { code, message } }) }
function toolError(id: string | number | null, text: string) { return jsonRpc({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } }) }
function jsonRpc(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } }) }
