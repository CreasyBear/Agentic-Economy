import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  authenticateAgentAccess,
  resolveAgentAccessPrincipal,
  type AgentAccessAuthenticationOptions,
  type AgentAccessPrincipalResolver,
} from '@/lib/server/agent-access-auth'
import { createLocalE2EAgentAccessKeyApi } from '@/lib/server/local-e2e-agent-key'
import { LOCAL_E2E_OPERATOR_PRINCIPAL } from '@/lib/server/local-e2e-bypass'
import {
  CUSTOMER_REQUEST_AGENT_SCOPE,
  CUSTOMER_REQUEST_APPROVAL_REQUIRED_SCOPE,
  CUSTOMER_REQUEST_READ_ONLY_SCOPE,
  MARKET_TOOLS_CALL_SCOPE,
  MARKET_SUPPLY_MANAGE_SCOPE,
} from '@/modules/agent-access/contract'

const liveScopes = [MARKET_TOOLS_CALL_SCOPE, CUSTOMER_REQUEST_READ_ONLY_SCOPE]
const TEST_CONSEQUENCE_RESOURCE = 'surface:test:agent-access'
const resolveCanonicalPrincipal: AgentAccessPrincipalResolver = async (projection) => ({
  ...projection,
  principalId: 'prn_00000000000040008000000000000040',
  ownerId: 'acc_00000000000040008000000000000040',
})

async function authenticateCanonically(options: AgentAccessAuthenticationOptions) {
  return await authenticateAgentAccess({
    consequenceResource: TEST_CONSEQUENCE_RESOURCE,
    resolvePrincipal: resolveCanonicalPrincipal,
    ...options,
  })
}

const adapterMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  callPublicSourceMutation: vi.fn(),
  sourceWriteAdmissionFromRequest: vi.fn(),
  sourceWriteRequestFromAdmission: vi.fn(),
  getRequest: vi.fn(),
}))

vi.mock('@clerk/tanstack-react-start/server', () => ({
  auth: adapterMocks.auth,
  clerkClient: adapterMocks.clerkClient,
}))

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: adapterMocks.getRequest,
}))

vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/server/convex-source')>(),
  callPublicSourceMutation: adapterMocks.callPublicSourceMutation,
}))

vi.mock('@/lib/server/source-write-admission', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/server/source-write-admission')>(),
  sourceWriteAdmissionFromRequest: adapterMocks.sourceWriteAdmissionFromRequest,
  sourceWriteRequestFromAdmission: adapterMocks.sourceWriteRequestFromAdmission,
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('agent access authentication', () => {
  it('resolves the production binding mutation with locator fields and exact required scopes only', async () => {
    const projection = {
      credentialId: 'ak_source_resolver',
      applicationRef: 'agentic-economy',
      environment: 'sandbox' as const,
      scopes: liveScopes,
      authorityMode: 'read_only' as const,
    }
    const canonical = {
      ...projection,
      principalId: 'prn_00000000000040008000000000000045',
      ownerId: 'acc_00000000000040008000000000000045',
    }
    adapterMocks.sourceWriteAdmissionFromRequest.mockResolvedValue({ kind: 'admitted' })
    adapterMocks.sourceWriteRequestFromAdmission.mockReturnValue({ digest: 'source-request' })
    adapterMocks.callPublicSourceMutation.mockResolvedValue(canonical)
    const request = new Request('https://ae.example/api')
    const resolver = resolveAgentAccessPrincipal(request, 'body', 'correlation:resolver', {
      env: { CONVEX_URL: 'https://convex.example' },
    })

    await expect(resolver(
      projection,
      [MARKET_TOOLS_CALL_SCOPE],
      'surface:http:operations-call',
    )).resolves.toEqual(canonical)
    expect(adapterMocks.sourceWriteAdmissionFromRequest).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'agent_identity',
      command: expect.objectContaining({
        credentialId: 'ak_source_resolver',
        requiredScopes: [MARKET_TOOLS_CALL_SCOPE],
        operationKey: 'surface:http:operations-call',
      }),
      env: { CONVEX_URL: 'https://convex.example' },
    }))
    const [reference, args] = adapterMocks.callPublicSourceMutation.mock.calls[0] as [object, Record<string, unknown>]
    expect(Object.getOwnPropertySymbols(reference).map((symbol) => Reflect.get(reference, symbol)))
      .toContain('authorityBoundary:resolveAgentBinding')
    expect(args).not.toHaveProperty('principalId')
    expect(args).not.toHaveProperty('ownerId')

    await expect(resolver(projection, [], 'surface:http:operations-call')).resolves.toEqual(canonical)
    expect(adapterMocks.callPublicSourceMutation.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      requiredScopes: [...liveScopes],
    }))

    adapterMocks.sourceWriteAdmissionFromRequest.mockRejectedValueOnce(new Error('source unavailable'))
    await expect(resolveAgentAccessPrincipal(request, new Uint8Array([1]), 'correlation:failure')(
      projection,
      [MARKET_TOOLS_CALL_SCOPE],
      'surface:http:operations-call',
    )).resolves.toBeNull()

    for (const invalidResource of [undefined, ' surface:http:operations-call', 'credential:ak_source_resolver']) {
      await expect(resolver(
        projection,
        [MARKET_TOOLS_CALL_SCOPE],
        invalidResource as never,
      )).resolves.toBeNull()
    }
  })

  it('keeps the consequence resource stable when the credential locator changes', async () => {
    adapterMocks.sourceWriteAdmissionFromRequest.mockResolvedValue({ kind: 'admitted' })
    adapterMocks.sourceWriteRequestFromAdmission.mockReturnValue({ digest: 'source-request' })
    adapterMocks.callPublicSourceMutation.mockResolvedValue(null)
    const resolver = resolveAgentAccessPrincipal(
      new Request('https://ae.example/api'),
      'body',
      'correlation:stable-resource',
    )
    const baseProjection = {
      applicationRef: 'agentic-economy',
      environment: 'sandbox' as const,
      scopes: liveScopes,
      authorityMode: 'read_only' as const,
    }

    await resolver(
      { ...baseProjection, credentialId: 'ak_first' },
      [MARKET_TOOLS_CALL_SCOPE],
      'surface:http:operations-call',
    )
    await resolver(
      { ...baseProjection, credentialId: 'ak_second' },
      [MARKET_TOOLS_CALL_SCOPE],
      'surface:http:operations-call',
    )

    expect(adapterMocks.callPublicSourceMutation.mock.calls.map(([, args]) => ({
      credentialId: (args as Record<string, unknown>).credentialId,
      operationKey: (args as Record<string, unknown>).operationKey,
    }))).toEqual([
      { credentialId: 'ak_first', operationKey: 'surface:http:operations-call' },
      { credentialId: 'ak_second', operationKey: 'surface:http:operations-call' },
    ])
  })

  it('uses canonical Principal and Account refs even when credential subject and id claim different ownership', async () => {
    const resolvePrincipal: AgentAccessPrincipalResolver = async (projection) => ({
      ...projection,
      principalId: 'prn_00000000000040008000000000000041',
      ownerId: 'acc_00000000000040008000000000000041',
    })

    await expect(authenticateCanonically({
      requiredScope: MARKET_TOOLS_CALL_SCOPE,
      authenticate: async () => ({
        isAuthenticated: true,
        tokenType: 'api_key',
        id: 'ak_attacker_selected_principal',
        subject: 'user_attacker_selected_account',
        scopes: liveScopes,
      }),
      resolvePrincipal,
    })).resolves.toMatchObject({
      kind: 'authenticated',
      principal: {
        principalId: 'prn_00000000000040008000000000000041',
        ownerId: 'acc_00000000000040008000000000000041',
        credentialId: 'ak_attacker_selected_principal',
      },
    })
  })

  it('uses the hosted auth and current-key providers while still requiring canonical resolution', async () => {
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', '')
    adapterMocks.auth.mockResolvedValue({
      isAuthenticated: true,
      tokenType: 'api_key',
      id: 'ak_hosted',
      subject: 'user_hosted',
      scopes: liveScopes,
      claims: { aeApplicationRef: 'hosted-app', aeEnvironment: 'production' },
    })
    const get = vi.fn().mockResolvedValue({
      id: 'ak_hosted',
      subject: 'user_hosted',
      revoked: false,
      expired: false,
      scopes: liveScopes,
      claims: { aeApplicationRef: 'hosted-app', aeEnvironment: 'production' },
    })
    adapterMocks.clerkClient.mockReturnValue({ apiKeys: { get } })

    await expect(authenticateCanonically({
      resolvePrincipal: async (projection) => ({
        ...projection,
        principalId: 'prn_00000000000040008000000000000046',
        ownerId: 'acc_00000000000040008000000000000046',
      }),
    })).resolves.toMatchObject({
      kind: 'authenticated',
      principal: {
        principalId: 'prn_00000000000040008000000000000046',
        ownerId: 'acc_00000000000040008000000000000046',
        applicationRef: 'hosted-app',
        environment: 'production',
      },
    })
    expect(adapterMocks.auth).toHaveBeenCalledWith({ acceptsToken: 'api_key' })
    expect(get).toHaveBeenCalledWith('ak_hosted')

    await expect(authenticateAgentAccess()).resolves.toEqual({
      kind: 'refused', status: 401, reason: 'authentication_required',
    })
  })

  it('authenticates only the current nonexpired local OAuth bearer through canonical resolution', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')
    const localApi = createLocalE2EAgentAccessKeyApi()
    const createInput = {
      name: 'AE Agent local-authentication',
      subject: LOCAL_E2E_OPERATOR_PRINCIPAL,
      createdBy: LOCAL_E2E_OPERATOR_PRINCIPAL,
      scopes: liveScopes,
      claims: {
        aePurpose: 'agent_access',
        aeGrantRef: 'grt_local_authentication',
        aeDisplayName: 'Local authentication',
        aeAuthorityMode: 'read_only',
        aeIssuanceKey: 'local-authentication-12345678',
        aeApplicationRef: 'agentic-economy',
        aeEnvironment: 'sandbox',
        aeScopes: JSON.stringify(liveScopes),
      },
      secondsUntilExpiration: 1,
      description: 'Use Agentic Economy Tools with this assistant.',
    } as const
    const created = await localApi.create(createInput)
    const replay = await localApi.create(createInput)
    const second = await localApi.create({
      ...createInput,
      name: 'AE Agent second-authentication',
      claims: {
        ...createInput.claims,
        aeGrantRef: 'grt_second_authentication',
        aeIssuanceKey: 'second-authentication-12345678',
      },
    })
    const secret = (await localApi.getSecret(created.id)).secret
    expect(replay.id).toBe(created.id)
    expect(second.id).not.toBe(created.id)
    const resolvePrincipal = vi.fn<AgentAccessPrincipalResolver>(async (projection) => ({
      ...projection,
      principalId: 'prn_00000000000040008000000000000048',
      ownerId: 'acc_00000000000040008000000000000048',
    }))

    try {
      adapterMocks.getRequest.mockReturnValue(new Request('http://localhost/api/v1/account', {
        headers: { Authorization: `Bearer ${secret}` },
      }))
      await expect(authenticateCanonically({ resolvePrincipal })).resolves.toMatchObject({
        kind: 'authenticated',
        principal: {
          credentialId: created.id,
          applicationRef: 'agentic-economy',
          environment: 'sandbox',
        },
      })
      expect(resolvePrincipal).toHaveBeenCalledTimes(1)
      expect(adapterMocks.auth).not.toHaveBeenCalled()
      expect(adapterMocks.clerkClient).not.toHaveBeenCalled()

      adapterMocks.getRequest.mockReturnValue(new Request('http://localhost/api/v1/account', {
        headers: { Authorization: 'Bearer wrong-local-secret' },
      }))
      await expect(authenticateCanonically({ resolvePrincipal })).resolves.toEqual({
        kind: 'refused', status: 401, reason: 'authentication_required',
      })

      vi.setSystemTime(2_001)
      adapterMocks.getRequest.mockReturnValue(new Request('http://localhost/api/v1/account', {
        headers: { Authorization: `Bearer ${secret}` },
      }))
      await expect(authenticateCanonically({ resolvePrincipal })).resolves.toEqual({
        kind: 'refused', status: 401, reason: 'authentication_required',
      })
      expect(resolvePrincipal).toHaveBeenCalledTimes(1)
      expect(adapterMocks.auth).not.toHaveBeenCalled()
      expect(adapterMocks.clerkClient).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails closed without canonical resolution and has no test-only ownership projection', async () => {
    const authenticate = async () => ({
      isAuthenticated: true as const,
      tokenType: 'api_key' as const,
      id: 'ak_no_resolver',
      subject: 'user_no_resolver',
      scopes: liveScopes,
    })

    await expect(authenticateAgentAccess({ authenticate }))
      .resolves.toEqual({ kind: 'refused', status: 401, reason: 'authentication_required' })
    await expect(authenticateAgentAccess({
      authenticate,
      consequenceResource: 'credential:ak_no_resolver',
      resolvePrincipal: resolveCanonicalPrincipal,
    })).resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })
  })

  it('passes exact protected scopes to canonical resolution and refuses malformed or mismatched canonical fields', async () => {
    const authenticate = async () => ({
      isAuthenticated: true as const,
      tokenType: 'api_key' as const,
      id: 'ak_canonical_validation',
      subject: 'user_canonical_validation',
      scopes: liveScopes,
    })
    const resolvedScopes: Array<readonly string[]> = []
    const canonical = {
      principalId: 'prn_00000000000040008000000000000042',
      ownerId: 'acc_00000000000040008000000000000042',
      credentialId: 'ak_canonical_validation',
      applicationRef: 'agentic-economy',
      environment: 'sandbox' as const,
      scopes: [...liveScopes].sort(),
      authorityMode: 'read_only' as const,
    }
    await expect(authenticateCanonically({
      authenticate,
      requiredScope: MARKET_TOOLS_CALL_SCOPE,
      resolvePrincipal: async (_projection, requiredScopes) => {
        resolvedScopes.push(requiredScopes)
        return canonical
      },
    })).resolves.toMatchObject({ kind: 'authenticated', principal: canonical })
    expect(resolvedScopes).toEqual([[MARKET_TOOLS_CALL_SCOPE]])

    for (const stored of [
      { ...canonical, principalId: 'clerk_api_key:attacker' },
      { ...canonical, ownerId: 'user_attacker' },
      { ...canonical, credentialId: 'ak_other' },
      { ...canonical, applicationRef: 'other-application' },
      { ...canonical, environment: 'production' as const },
      { ...canonical, authorityMode: 'spending_policy' as const },
      { ...canonical, scopes: [CUSTOMER_REQUEST_READ_ONLY_SCOPE] },
      { ...canonical, scopes: [] },
      { ...canonical, scopes: [MARKET_TOOLS_CALL_SCOPE, MARKET_TOOLS_CALL_SCOPE] },
      { ...canonical, scopes: [MARKET_TOOLS_CALL_SCOPE, 42] },
    ]) {
      await expect(authenticateCanonically({
        authenticate,
        requiredScope: MARKET_TOOLS_CALL_SCOPE,
        resolvePrincipal: async () => stored as never,
      })).resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })
    }

    await expect(authenticateCanonically({
      authenticate,
      requiredScope: MARKET_TOOLS_CALL_SCOPE,
      resolvePrincipal: async () => null,
    })).resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })
    await expect(authenticateCanonically({
      authenticate,
      requiredScope: MARKET_TOOLS_CALL_SCOPE,
      resolvePrincipal: async () => { throw new Error('resolver unavailable') },
    })).resolves.toEqual({ kind: 'refused', status: 401, reason: 'authentication_required' })
  })

  it('honors an explicit required-scope set and canonicalizes supported claim projections', async () => {
    const authenticate = async () => ({
      isAuthenticated: true as const,
      tokenType: 'api_key' as const,
      id: 'ak_claims',
      subject: 'user_claims',
      scopes: liveScopes,
      claims: { aeApplicationRef: '  claims-app  ', aeEnvironment: 'development' },
    })
    await expect(authenticateCanonically({
      authenticate,
      requiredScope: null,
      requiredScopes: [MARKET_TOOLS_CALL_SCOPE],
    })).resolves.toMatchObject({
      kind: 'authenticated',
      principal: { applicationRef: 'claims-app', environment: 'sandbox' },
    })
    await expect(authenticateCanonically({
      authenticate,
      requiredScope: null,
    })).resolves.toMatchObject({ kind: 'authenticated' })
    for (const aeEnvironment of ['sandbox', '', 42]) {
      await expect(authenticateCanonically({
        authenticate: async () => ({
          ...await authenticate(),
          claims: { aeApplicationRef: 42, aeEnvironment },
        }),
      })).resolves.toMatchObject({
        kind: 'authenticated',
        principal: { applicationRef: 'agentic-economy', environment: 'sandbox' },
      })
    }
  })

  it('admits exactly one declared alternative scope and binds canonical resolution to the matched scope', async () => {
    const resolvedScopes: Array<readonly string[]> = []
    const authenticateWithScopes = (scopes: readonly string[]) => async () => ({
      isAuthenticated: true as const,
      tokenType: 'api_key' as const,
      id: 'ak_profile_identity',
      subject: 'user_profile_identity',
      scopes,
    })
    const resolvePrincipal: AgentAccessPrincipalResolver = async (projection, requiredScopes) => {
      resolvedScopes.push(requiredScopes)
      return {
        ...projection,
        principalId: 'prn_00000000000040008000000000000047',
        ownerId: 'acc_00000000000040008000000000000047',
      }
    }
    const options = {
      requiredScope: null,
      requiredAnyScopes: [MARKET_TOOLS_CALL_SCOPE, MARKET_SUPPLY_MANAGE_SCOPE],
      resolvePrincipal,
    } as const

    await expect(authenticateAgentAccess({
      ...options,
      consequenceResource: TEST_CONSEQUENCE_RESOURCE,
      authenticate: authenticateWithScopes([MARKET_SUPPLY_MANAGE_SCOPE]),
    })).resolves.toMatchObject({
      kind: 'authenticated',
      principal: { scopes: [MARKET_SUPPLY_MANAGE_SCOPE], authorityMode: 'spending_policy' },
    })
    await expect(authenticateAgentAccess({
      ...options,
      consequenceResource: TEST_CONSEQUENCE_RESOURCE,
      authenticate: authenticateWithScopes([MARKET_TOOLS_CALL_SCOPE, CUSTOMER_REQUEST_READ_ONLY_SCOPE]),
    })).resolves.toMatchObject({ kind: 'authenticated' })
    await expect(authenticateAgentAccess({
      ...options,
      consequenceResource: TEST_CONSEQUENCE_RESOURCE,
      authenticate: authenticateWithScopes([CUSTOMER_REQUEST_READ_ONLY_SCOPE]),
    })).resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })

    expect(resolvedScopes).toEqual([
      [MARKET_SUPPLY_MANAGE_SCOPE],
      [MARKET_TOOLS_CALL_SCOPE],
    ])
  })

  it('keeps a scoped Clerk API key as a locator for a canonical principal', async () => {
    const verifyKeyState = async () => ({
      id: 'ak_123', subject: 'user_123', revoked: false, expired: false, scopes: liveScopes,
    })
    await expect(authenticateCanonically({
      requiredScope: MARKET_TOOLS_CALL_SCOPE,
      authenticate: async () => ({
        isAuthenticated: true, tokenType: 'api_key', id: 'ak_123', subject: 'user_123', userId: 'user_123', orgId: null,
        scopes: liveScopes,
      }),
      verifyKeyState,
    })).resolves.toEqual({ kind: 'authenticated', principal: {
      principalId: 'prn_00000000000040008000000000000040', ownerId: 'acc_00000000000040008000000000000040', credentialId: 'ak_123',
      applicationRef: 'agentic-economy', environment: 'sandbox',
      scopes: [CUSTOMER_REQUEST_READ_ONLY_SCOPE, MARKET_TOOLS_CALL_SCOPE], authorityMode: 'read_only',
    } })
  })

  it('does not let an organization claim alter canonical Principal or Account ownership', async () => {
    await expect(authenticateCanonically({
      requiredScope: MARKET_TOOLS_CALL_SCOPE,
      authenticate: async () => ({
        isAuthenticated: true,
        tokenType: 'api_key',
        id: 'ak_org_scoped',
        subject: 'user_org_owner',
        userId: 'user_org_owner',
        orgId: 'org_123',
        scopes: liveScopes,
      }),
      verifyKeyState: async () => ({
        id: 'ak_org_scoped',
        subject: 'user_org_owner',
        revoked: false,
        expired: false,
        scopes: liveScopes,
      }),
    })).resolves.toMatchObject({
      kind: 'authenticated',
      principal: {
        principalId: 'prn_00000000000040008000000000000040',
        ownerId: 'acc_00000000000040008000000000000040',
      },
    })
  })

  it('refuses organization-scoped keys when ownership is user-bound', async () => {
    await expect(authenticateCanonically({
      requiredScope: MARKET_TOOLS_CALL_SCOPE,
      authenticate: async () => ({
        isAuthenticated: true,
        tokenType: 'api_key',
        id: 'ak_org',
        subject: 'org_123',
        userId: null,
        orgId: 'org_123',
        scopes: liveScopes,
      }),
    })).resolves.toEqual({
      kind: 'refused',
      status: 403,
      reason: 'scope_required',
    })
  })

  it('fails closed when current key state is revoked, expired, mismatched, or unavailable', async () => {
    const authenticate = async () => ({
      isAuthenticated: true, tokenType: 'api_key' as const, id: 'ak_123', subject: 'user_123',
      userId: 'user_123', orgId: null, scopes: liveScopes,
    })
    for (const current of [
      { id: 'ak_123', subject: 'user_123', revoked: true, expired: false, scopes: liveScopes },
      { id: 'ak_123', subject: 'user_123', revoked: false, expired: true, scopes: liveScopes },
      { id: 'ak_other', subject: 'user_123', revoked: false, expired: false, scopes: liveScopes },
      { id: 'ak_123', subject: 'user_other', revoked: false, expired: false, scopes: liveScopes },
    ]) {
      await expect(authenticateCanonically({ requiredScope: MARKET_TOOLS_CALL_SCOPE, authenticate, verifyKeyState: async () => current }))
        .resolves.toEqual({ kind: 'refused', status: 401, reason: 'authentication_required' })
    }
    await expect(authenticateCanonically({ requiredScope: MARKET_TOOLS_CALL_SCOPE, authenticate, verifyKeyState: async () => { throw new Error('unavailable') } }))
      .resolves.toEqual({ kind: 'refused', status: 401, reason: 'authentication_required' })
    await expect(authenticateCanonically({
      requiredScope: MARKET_TOOLS_CALL_SCOPE,
      authenticate,
      verifyKeyState: async () => ({
        id: 'ak_123', subject: 'user_123', revoked: false, expired: false, scopes: [],
      }),
    })).resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })
  })

  it('fails closed when the authentication provider is unavailable', async () => {
    await expect(authenticateCanonically({
      authenticate: async () => {
        throw new Error('authentication provider unavailable')
      },
    })).resolves.toEqual({
      kind: 'refused',
      status: 401,
      reason: 'authentication_required',
    })
  })

  it('refuses missing, wrong-type and unscoped credentials', async () => {
    await expect(authenticateCanonically({ authenticate: async () => ({
      isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null,
    }) })).resolves.toMatchObject({ kind: 'refused', status: 401 })
    await expect(authenticateCanonically({ authenticate: async () => ({
      isAuthenticated: true, tokenType: 'api_key', id: 'ak_123', subject: 'user_123', scopes: [],
    }) })).resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })
  })

  it('maps legacy create-bearing invoke keys without a mode to read_only', async () => {
    const authenticate = async () => ({
      isAuthenticated: true, tokenType: 'api_key' as const, id: 'ak_123', subject: 'user_123',
      userId: 'user_123', orgId: null, scopes: [MARKET_TOOLS_CALL_SCOPE, CUSTOMER_REQUEST_AGENT_SCOPE],
    })
    await expect(authenticateCanonically({ requiredScope: MARKET_TOOLS_CALL_SCOPE, authenticate, requiredMode: 'approval_required' }))
      .resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })
    await expect(authenticateCanonically({
      requiredScope: MARKET_TOOLS_CALL_SCOPE,
      authenticate,
    }))
      .resolves.toMatchObject({ kind: 'authenticated', principal: { authorityMode: 'read_only' } })
  })

  it('refuses create-only keys at the market invoke door', async () => {
    await expect(authenticateCanonically({
      requiredScope: MARKET_TOOLS_CALL_SCOPE,
      authenticate: async () => ({
        isAuthenticated: true, tokenType: 'api_key', id: 'ak_123', subject: 'user_123',
        userId: 'user_123', orgId: null, scopes: [CUSTOMER_REQUEST_AGENT_SCOPE],
      }),
    })).resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })
  })

  it('refuses multiple authority modes instead of selecting one implicitly', async () => {
    await expect(authenticateCanonically({
      requiredScope: MARKET_TOOLS_CALL_SCOPE,
      authenticate: async () => ({
        isAuthenticated: true, tokenType: 'api_key', id: 'ak_123', subject: 'user_123',
        userId: 'user_123', orgId: null,
        scopes: [MARKET_TOOLS_CALL_SCOPE, CUSTOMER_REQUEST_READ_ONLY_SCOPE, CUSTOMER_REQUEST_APPROVAL_REQUIRED_SCOPE],
      }),
    })).resolves.toEqual({ kind: 'refused', status: 403, reason: 'scope_required' })
  })
})
