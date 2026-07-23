import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  authenticateHostedPaidOperationAgent,
  PAID_OPERATION_AGENT_SCOPE,
} from '@/lib/server/hosted-paid-operation-agent-auth'
import { verifyHostedPaidOperationServiceToken } from '@/modules/action-invocation/hosted-paid-operation-service-auth'
import { Route as AgentCreateRoute } from '@/routes/api.v1.paid-operations'
import { Route as AgentInspectRoute } from '@/routes/api.v1.paid-operations.$invocationRef'
import { Route as AgentCommandRoute } from '@/routes/api.v1.paid-operations.$invocationRef.commands'

const clerk = vi.hoisted(() => ({
  auth: vi.fn(),
  getApiKey: vi.fn(),
  client: vi.fn(),
}))
const convex = vi.hoisted(() => ({
  clientOptions: [] as unknown[],
  mutationArgs: [] as Array<Record<string, unknown>>,
  queryArgs: [] as Array<Record<string, unknown>>,
  actionArgs: [] as Array<Record<string, unknown>>,
}))

vi.mock('@clerk/tanstack-react-start/server', () => ({
  auth: clerk.auth,
  clerkClient: clerk.client,
}))

vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    constructor(_url: string, options: unknown) {
      convex.clientOptions.push(options)
    }

    async mutation(_reference: unknown, args: Record<string, unknown>) {
      convex.mutationArgs.push(args)
      return {
        kind: 'created',
        invocationRef: 'invocation:agent-route',
        expectedInvocationVersion: 1,
      }
    }

    async query(_reference: unknown, args: Record<string, unknown>) {
      convex.queryArgs.push(args)
      return { kind: 'refused', code: 'invocation_not_found' }
    }

    async action(_reference: unknown, args: Record<string, unknown>) {
      convex.actionArgs.push(args)
      return { kind: 'refused', code: 'invocation_not_found' }
    }
  },
}))

describe('hosted paid-operation agent authentication', () => {
  afterEach(() => {
    clerk.auth.mockReset()
    clerk.getApiKey.mockReset()
    clerk.client.mockReset()
    convex.clientOptions.length = 0
    convex.mutationArgs.length = 0
    convex.queryArgs.length = 0
    convex.actionArgs.length = 0
    vi.unstubAllEnvs()
  })

  it('carries scoped API-key admission through the route without session fallback or opaque-key JWT forwarding', async () => {
    vi.stubEnv('CONVEX_URL', 'https://example.convex.cloud')
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'service-token-key-material-32-bytes-minimum')
    clerk.auth.mockImplementation(async (options?: { acceptsToken?: string }) => {
      if (options?.acceptsToken === 'api_key') {
        return {
          isAuthenticated: true,
          tokenType: 'api_key',
          id: 'key:paid',
          subject: 'user_paid',
          scopes: [PAID_OPERATION_AGENT_SCOPE, 'customer_requests:create'],
          userId: 'user_paid',
          orgId: null,
          getToken: async () => 'ak_opaque_clerk_api_key',
        }
      }
      throw new Error('session_auth_fallback')
    })
    clerk.getApiKey.mockResolvedValue({
      id: 'key:paid',
      subject: 'user_paid',
      revoked: false,
      expired: false,
      scopes: [PAID_OPERATION_AGENT_SCOPE, 'customer_requests:create'],
    })
    clerk.client.mockReturnValue({
      apiKeys: { get: clerk.getApiKey },
    })
    const handlers = AgentCreateRoute.options.server?.handlers as
      | Readonly<{ POST?: (input: Readonly<{ request: Request }>) => Promise<Response> }>
      | undefined
    const post = handlers?.POST
    if (post === undefined) throw new Error('agent_create_route_missing')

    const response = await post({
      request: new Request('https://ae.test/api/v1/paid-operations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerKey: 'A' }),
      }),
    } as never)
    const inspectHandlers = AgentInspectRoute.options.server?.handlers as
      | Readonly<{
          GET?: (input: Readonly<{
            request: Request
            params: Readonly<{ invocationRef: string }>
          }>) => Promise<Response>
        }>
      | undefined
    const inspectResponse = await inspectHandlers?.GET?.({
      request: new Request(
        'https://ae.test/api/v1/paid-operations/invocation%3Aagent-route?expectedInvocationVersion=1',
      ),
      params: { invocationRef: 'invocation:agent-route' },
    })
    const commandHandlers = AgentCommandRoute.options.server?.handlers as
      | Readonly<{
          POST?: (input: Readonly<{
            request: Request
            params: Readonly<{ invocationRef: string }>
          }>) => Promise<Response>
        }>
      | undefined
    const commandResponse = await commandHandlers?.POST?.({
      request: new Request(
        'https://ae.test/api/v1/paid-operations/invocation%3Aagent-route/commands',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            command: 'execute',
            commandId: 'command:agent-route',
            expectedInvocationVersion: 1,
          }),
        },
      ),
      params: { invocationRef: 'invocation:agent-route' },
    })
    if (inspectResponse === undefined || commandResponse === undefined) {
      throw new Error('agent_route_handler_missing')
    }

    expect({
      status: response.status,
      body: await response.clone().json(),
      authCalls: clerk.auth.mock.calls,
      keyCalls: clerk.getApiKey.mock.calls,
      clientCalls: clerk.client.mock.calls,
    }).toEqual({
      status: 201,
      body: {
        kind: 'created',
        invocationRef: 'invocation:agent-route',
        expectedInvocationVersion: 1,
        relation: {
          inspect: '/api/v1/paid-operations/invocation%3Aagent-route?expectedInvocationVersion=1',
        },
      },
      authCalls: Array.from({ length: 3 }, () => [{ acceptsToken: 'api_key' }]),
      keyCalls: Array.from({ length: 3 }, () => ['key:paid']),
      clientCalls: Array.from({ length: 3 }, () => []),
    })
    expect(inspectResponse.status).toBe(404)
    expect(commandResponse.status).toBe(404)
    expect(clerk.auth).toHaveBeenCalledTimes(3)
    expect(clerk.auth).toHaveBeenCalledWith({ acceptsToken: 'api_key' })
    expect(JSON.stringify(convex.clientOptions)).not.toContain('ak_opaque_clerk_api_key')
    expect(Object.keys(convex.mutationArgs[0] ?? {}).sort()).toEqual([
      'providerKey',
      'serviceToken',
    ])
    expect(Object.keys(convex.queryArgs[0] ?? {}).sort()).toEqual([
      'expectedInvocationVersion',
      'invocationRef',
      'serviceToken',
    ])
    expect(Object.keys(convex.actionArgs[0] ?? {}).sort()).toEqual([
      'command',
      'commandId',
      'expectedInvocationVersion',
      'invocationRef',
      'serviceToken',
    ])
    expect(JSON.stringify({
      mutationArgs: convex.mutationArgs,
      queryArgs: convex.queryArgs,
      actionArgs: convex.actionArgs,
    })).not.toMatch(
      /ak_opaque_clerk_api_key|principalRef|callerRef|owner/u,
    )
    const serviceToken = convex.mutationArgs[0]?.serviceToken
    expect(typeof serviceToken).toBe('string')
    if (typeof serviceToken !== 'string') return
    await expect(verifyHostedPaidOperationServiceToken({
      key: 'service-token-key-material-32-bytes-minimum',
      serviceToken,
      intent: { kind: 'create', providerKey: 'A' },
    })).resolves.toMatchObject({
      principalRef: 'user_paid',
      callerRef: 'clerk_api_key:key:paid',
      credentialId: 'key:paid',
      scopes: [PAID_OPERATION_AGENT_SCOPE],
    })
  })

  it('derives a least-privilege actor from the current key and rejects revocation and scope overreach', async () => {
    const authenticate = async () => ({
      isAuthenticated: true,
      tokenType: 'api_key' as const,
      id: 'key:paid',
      subject: 'principal:paid',
      scopes: [PAID_OPERATION_AGENT_SCOPE],
      userId: 'owner:paid',
    })
    const admitted = await authenticateHostedPaidOperationAgent({
      authenticate,
      verifyKeyState: async () => ({
        id: 'key:paid',
        subject: 'principal:paid',
        revoked: false,
        expired: false,
        scopes: [PAID_OPERATION_AGENT_SCOPE],
      }),
    })
    expect(admitted).toEqual({
      kind: 'authenticated',
      principal: {
        actor: {
          callerRef: 'clerk_api_key:key:paid',
          principalRef: 'owner:paid',
        },
        credentialId: 'key:paid',
        scopes: [PAID_OPERATION_AGENT_SCOPE],
      },
    })
    expect(admitted).not.toHaveProperty('authority')

    await expect(authenticateHostedPaidOperationAgent({
      authenticate,
      verifyKeyState: async () => ({
        id: 'key:paid',
        subject: 'principal:paid',
        revoked: true,
        expired: false,
        scopes: [PAID_OPERATION_AGENT_SCOPE],
      }),
    })).resolves.toEqual({
      kind: 'refused',
      status: 401,
      reason: 'authentication_required',
    })

    await expect(authenticateHostedPaidOperationAgent({
      authenticate: async () => ({
        ...(await authenticate()),
        scopes: ['customer_request:write'],
      }),
    })).resolves.toEqual({
      kind: 'refused',
      status: 403,
      reason: 'scope_required',
    })
  })
})
