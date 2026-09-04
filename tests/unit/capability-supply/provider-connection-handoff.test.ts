import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callSourceQuery: vi.fn(),
  callSourceMutation: vi.fn(),
  sourceQuery: vi.fn((name: string) => ({ name })),
  sourceMutation: vi.fn((name: string) => ({ name })),
  sourceWriteAdmissionFromContext: vi.fn(),
  sourceWriteRequestFromAdmission: vi.fn(),
  requireStrictClerkConsequenceProof: vi.fn(),
  createConvexServerFunctionAssertion: vi.fn(),
}))

vi.mock('@/lib/server/convex-source', () => ({
  callSourceQuery: mocks.callSourceQuery,
  callSourceMutation: mocks.callSourceMutation,
  sourceQuery: mocks.sourceQuery,
  sourceMutation: mocks.sourceMutation,
  createConvexServerFunctionAssertion: mocks.createConvexServerFunctionAssertion,
}))
vi.mock('@/lib/server/source-write-admission', () => ({
  sourceWriteAdmissionFromContext: mocks.sourceWriteAdmissionFromContext,
}))
vi.mock('@/modules/security/source-write-admission', () => ({
  sourceWriteRequestFromAdmission: mocks.sourceWriteRequestFromAdmission,
}))
vi.mock('@/lib/server/clerk-consequence-proof', () => ({
  requireStrictClerkConsequenceProof: mocks.requireStrictClerkConsequenceProof,
}))

import {
  completeOwnerMcpProviderConnection,
  completeOwnerHttpProviderConnection,
  loadOwnerConnectedOpenApi,
  readOwnerProviderConnectionAttempt,
  previewOwnerMcpProviderConnection,
  revokeStoredMcpProviderConnection,
  startOwnerMcpProviderConnection,
} from '@/modules/capability-supply/provider-connection-handoff'

describe('Provider connection owner handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sourceWriteAdmissionFromContext.mockImplementation(async ({ operationKey, correlationId }) => ({
      version: 'source-write:v2',
      operationKey,
      correlationId,
    }))
    mocks.sourceWriteRequestFromAdmission.mockImplementation((write) => ({
      operationKey: write.operationKey,
      correlationId: write.correlationId,
    }))
    mocks.requireStrictClerkConsequenceProof.mockResolvedValue({
      reverificationId: 'rev_owner_handoff',
      firstFactorAgeMinutes: 0,
      secondFactorAgeMinutes: -1,
    })
    mocks.createConvexServerFunctionAssertion.mockResolvedValue({
      principalId: 'ae:server-function',
      ownerId: 'ae:server-function',
      credentialId: 'ae:server-function',
      scopes: ['market_supply:manage'],
      issuedAt: 1,
      signature: 'signed',
    })
  })

  it('reads only the safe owner-facing attempt projection', async () => {
    mocks.callSourceQuery.mockResolvedValue({
      kind: 'available',
      attempt: {
        attemptRef: 'pca_one',
        businessRef: 'business:one',
        sourceKind: 'http_credential',
        sourceUrl: 'https://provider.example/openapi.yaml',
        sourceOrigin: 'https://provider.example',
        authentication: { kind: 'http_bearer' },
        environment: 'production',
        state: 'pending',
        expiresAt: 60_000,
      },
    })

    await expect(readOwnerProviderConnectionAttempt({ data: { attemptRef: 'pca_one' } }))
      .resolves.toMatchObject({ kind: 'available', attempt: { attemptRef: 'pca_one' } })
    expect(mocks.callSourceQuery).toHaveBeenCalledWith(
      { name: 'capabilityProviderConnectionAttempts:readOwner' },
      { attemptRef: 'pca_one' },
    )
  })

  it('provisions the credential only through the secret lifecycle before finalizing the connection', async () => {
    mocks.callSourceQuery.mockResolvedValue({
      kind: 'available',
      attempt: {
        attemptRef: 'pca_one',
        businessRef: 'business:one',
        sourceKind: 'http_credential',
        sourceUrl: 'https://provider.example/openapi.yaml',
        sourceOrigin: 'https://provider.example',
        authentication: { kind: 'http_bearer' },
        environment: 'production',
        state: 'pending',
        expiresAt: Date.now() + 60_000,
      },
    })
    mocks.callSourceMutation
      .mockResolvedValueOnce({
        kind: 'prepared',
        attemptRef: 'pca_one',
        secretRef: 'sec_00000000000040008000000000000061',
        authority: {
          operation: 'provision',
          snapshotRef: 'das_00000000000040008000000000000061',
          accountRef: 'acc_00000000000040008000000000000061',
          actorPrincipalRef: 'prn_00000000000040008000000000000061',
          grantRef: 'grt_00000000000040008000000000000061',
          grantGeneration: 1,
          correlationRef: 'provider-connection:prepare',
          idempotencyRef: 'provider-connection:prepare',
          occurredAt: 1,
        },
      })
      .mockResolvedValueOnce({
        kind: 'connected',
        connection: { connectionRef: 'connection:one', lifecycle: 'active' },
      })
    let provisionedCredential: string | undefined
    const provision = vi.fn().mockImplementation(async (input: { material: Uint8Array }) => {
      provisionedCredential = new TextDecoder().decode(input.material)
      return { kind: 'active' as const }
    })

    const result = await completeOwnerHttpProviderConnection({
      data: {
        attemptRef: 'pca_one',
        credential: 'provider-token-never-persist',
        idempotencyKey: 'connect-provider-one',
      },
      context: { request: 'owner' },
    }, { provision })

    expect(result).toMatchObject({ kind: 'connected', connection: { connectionRef: 'connection:one' } })
    expect(provision).toHaveBeenCalledWith(expect.objectContaining({
      secretRef: 'sec_00000000000040008000000000000061',
      material: expect.any(Uint8Array),
    }))
    const provisionInput = provision.mock.calls[0]?.[0] as { material: Uint8Array }
    expect(provisionedCredential).toBe('provider-token-never-persist')
    expect([...provisionInput.material].every((byte) => byte === 0)).toBe(true)
    const serializedMutations = JSON.stringify(mocks.callSourceMutation.mock.calls)
    expect(serializedMutations).not.toContain('provider-token-never-persist')
    expect(mocks.callSourceMutation.mock.calls.map(([reference]) => reference)).toEqual([
      { name: 'capabilityProviderConnectionAttempts:prepareOwner' },
      { name: 'capabilityProviderConnectionAttempts:finalizeOwner' },
    ])
  })

  it('loads a protected OpenAPI source after restart through its durable connection', async () => {
    mocks.callSourceMutation.mockResolvedValue({
      kind: 'available',
      connection: {
        connectionRef: 'connection:http',
        businessRef: 'business:one',
        sourceUrl: 'https://provider.example/openapi.yaml',
        sourceOrigin: 'https://provider.example',
        environment: 'production',
        authentication: { kind: 'api_key', location: 'header', name: 'X-Provider-Key' },
        secretRef: 'sec_00000000000040008000000000000061',
        activeGeneration: 'sgn_00000000000040008000000000000061',
        pointerRevision: 1,
      },
    })
    const secret = new TextEncoder().encode('provider-token-never-convex')
    const readSecret = vi.fn().mockResolvedValue(secret)
    const loadOpenApi = vi.fn().mockResolvedValue({
      openapi: '3.1.0',
      info: { title: 'Protected Provider', version: '1.0.0' },
      paths: {},
    })

    await expect(loadOwnerConnectedOpenApi({
      connectionRef: 'connection:http',
      businessRef: 'business:one',
      definitionUrl: 'https://provider.example/openapi.yaml',
      environment: 'production',
    }, { readSecret, loadOpenApi, randomCorrelation: () => 'http-preview-correlation' }))
      .resolves.toMatchObject({ openapi: '3.1.0' })

    expect(mocks.createConvexServerFunctionAssertion).toHaveBeenCalledWith({
      operation: 'capabilityProviderConnections.prepareOwnerHttpRuntimeForServer',
      scope: 'market_supply:manage',
      command: { connectionRef: 'connection:http', correlationRef: 'http-preview-correlation' },
    })
    expect(loadOpenApi).toHaveBeenCalledWith({
      definitionUrl: 'https://provider.example/openapi.yaml',
      authentication: { kind: 'api_key', location: 'header', name: 'X-Provider-Key' },
      credential: expect.any(Uint8Array),
    })
    expect(new TextDecoder().decode(loadOpenApi.mock.calls[0]?.[0].credential)).toBe('\0'.repeat('provider-token-never-convex'.length))
    expect(JSON.stringify(mocks.callSourceMutation.mock.calls)).not.toContain('provider-token-never-convex')
  })

  it('starts MCP OAuth with the official client while persisting only a state hash and secret locator', async () => {
    mocks.callSourceQuery.mockResolvedValue({
      kind: 'available',
      attempt: {
        attemptRef: 'pca_oauth',
        businessRef: 'business:one',
        sourceKind: 'mcp_oauth',
        sourceUrl: 'https://mcp.provider.example/mcp',
        sourceOrigin: 'https://mcp.provider.example',
        authentication: { kind: 'mcp_oauth' },
        environment: 'production',
        state: 'pending',
        expiresAt: Date.now() + 60_000,
      },
    })
    mocks.callSourceMutation
      .mockResolvedValueOnce({
        kind: 'prepared',
        attemptRef: 'pca_oauth',
        secretRef: 'sec_00000000000040008000000000000062',
        provisionAuthority: authority('provision', 'oauth-start'),
        rotationAuthority: authority('rotate', 'oauth-callback'),
      })
      .mockResolvedValueOnce({ kind: 'bound' })
    let durableBundle = ''
    const writeSecret = vi.fn().mockImplementation(async (input) => {
      durableBundle = new TextDecoder().decode(input.material)
      return { kind: 'active' }
    })
    const authorize = vi.fn().mockImplementation(async (provider) => {
      await provider.saveDiscoveryState({ authorizationServerUrl: 'https://login.provider.example' })
      await provider.saveClientInformation({ client_id: 'registered-client', issuer: 'https://login.provider.example' })
      await provider.saveCodeVerifier('pkce-verifier-never-convex-0123456789abcdefghijkl')
      await provider.redirectToAuthorization(new URL('https://login.provider.example/authorize?request=one'))
      return 'REDIRECT'
    })

    const result = await startOwnerMcpProviderConnection({
      data: {
        attemptRef: 'pca_oauth',
        idempotencyKey: 'oauth-provider-one',
        callbackUrl: 'https://ae.example/owner/supply/connections/oauth/callback?attempt=pca_oauth',
      },
      context: { request: 'owner' },
    }, {
      authorize,
      writeSecret,
      randomState: () => 'oauth-state-never-convex',
    })

    expect(result).toEqual({
      kind: 'redirect',
      authorizationUrl: 'https://login.provider.example/authorize?request=one',
    })
    expect(authorize).toHaveBeenCalledWith(expect.any(Object), {
      serverUrl: 'https://mcp.provider.example/mcp',
      scope: undefined,
    })
    expect(writeSecret).toHaveBeenCalledWith(expect.objectContaining({
      action: 'provision',
      secretRef: 'sec_00000000000040008000000000000062',
      material: expect.any(Uint8Array),
    }))
    expect(durableBundle).toContain('pkce-verifier-never-convex-0123456789abcdefghijkl')
    expect(durableBundle).toContain('oauth-state-never-convex')
    const convexTraffic = JSON.stringify(mocks.callSourceMutation.mock.calls)
    expect(convexTraffic).not.toContain('pkce-verifier-never-convex')
    expect(convexTraffic).not.toContain('oauth-state-never-convex')
    expect(convexTraffic).not.toContain('/authorize?request=one')
    expect(mocks.callSourceMutation.mock.calls[1]?.[0]).toEqual({
      name: 'capabilityProviderConnectionAttempts:bindOAuthOwner',
    })
  })

  it('exchanges the callback, proves MCP tools, rotates the secret, and finalizes the durable connection', async () => {
    const state = 'oauth-state-never-convex'
    const storedBundle = new TextEncoder().encode(JSON.stringify({
      version: 'ae.mcp-oauth-session:v1',
      attemptRef: 'pca_oauth',
      serverUrl: 'https://mcp.provider.example/mcp',
      environment: 'production',
      redirectUrl: 'https://ae.example/owner/supply/connections/oauth/callback?attempt=pca_oauth',
      state,
      codeVerifier: 'pkce-verifier-never-convex-0123456789abcdefghijkl',
      discoveryState: { authorizationServerUrl: 'https://login.provider.example' },
      clientInformation: { client_id: 'registered-client', issuer: 'https://login.provider.example' },
      rotationAuthority: authority('rotate', 'oauth-callback'),
      rotationIdempotencyRef: 'oauth-callback',
    }))
    mocks.callSourceQuery.mockResolvedValue({
      kind: 'available',
      attempt: {
        attemptRef: 'pca_oauth',
        sourceUrl: 'https://mcp.provider.example/mcp',
        environment: 'production',
        secretRef: 'sec_00000000000040008000000000000062',
        activeGeneration: 'sgn_00000000000040008000000000000062',
        pointerRevision: 1,
      },
    })
    mocks.callSourceMutation.mockResolvedValue({
      kind: 'connected',
      connection: { connectionRef: 'connection:mcp', lifecycle: 'active' },
    })
    const authorize = vi.fn().mockImplementation(async (provider) => {
      expect(await provider.codeVerifier()).toBe('pkce-verifier-never-convex-0123456789abcdefghijkl')
      await provider.saveTokens({
        access_token: 'access-token-never-convex',
        token_type: 'bearer',
        refresh_token: 'refresh-token-never-convex',
        issuer: 'https://login.provider.example',
      })
      return 'AUTHORIZED'
    })
    let rotatedBundle = ''
    const writeSecret = vi.fn().mockImplementation(async (input) => {
      rotatedBundle = new TextDecoder().decode(input.material)
      return { kind: 'active' }
    })
    const verifyMcp = vi.fn().mockResolvedValue({
      kind: 'ready',
      serverUrl: 'https://mcp.provider.example/mcp',
      protocolVersion: '2025-11-25',
      sourceDigest: `sha256:${'d'.repeat(64)}`,
      tools: [{ name: 'search', inputSchema: { type: 'object' }, outputSchema: { type: 'object' } }],
    })

    const result = await completeOwnerMcpProviderConnection({
      data: {
        attemptRef: 'pca_oauth',
        state,
        code: 'authorization-code-never-convex',
        iss: 'https://login.provider.example',
      },
      context: { request: 'owner' },
    }, {
      authorize,
      readSecret: vi.fn().mockResolvedValue(storedBundle),
      writeSecret,
      verifyMcp,
    })

    expect(result).toMatchObject({ kind: 'connected', connection: { connectionRef: 'connection:mcp' } })
    expect(authorize).toHaveBeenCalledWith(expect.any(Object), {
      serverUrl: 'https://mcp.provider.example/mcp',
      authorizationCode: 'authorization-code-never-convex',
      iss: 'https://login.provider.example',
      scope: undefined,
    })
    expect(verifyMcp).toHaveBeenCalledWith(expect.objectContaining({
      serverUrl: 'https://mcp.provider.example/mcp',
      authProvider: expect.any(Object),
    }))
    expect(writeSecret).toHaveBeenCalledWith(expect.objectContaining({
      action: 'rotate',
      secretRef: 'sec_00000000000040008000000000000062',
    }))
    expect(rotatedBundle).toContain('refresh-token-never-convex')
    const convexTraffic = JSON.stringify(mocks.callSourceMutation.mock.calls)
    expect(convexTraffic).not.toContain('authorization-code-never-convex')
    expect(convexTraffic).not.toContain('access-token-never-convex')
    expect(convexTraffic).not.toContain('refresh-token-never-convex')
  })

  it('restarts from the stored OAuth connection and persists a silent token refresh', async () => {
    const secretRef = 'sec_00000000000040008000000000000063'
    const storedBundle = new TextEncoder().encode(JSON.stringify({
      version: 'ae.mcp-oauth-session:v1',
      attemptRef: 'pca_oauth',
      serverUrl: 'https://mcp.provider.example/mcp',
      environment: 'production',
      redirectUrl: 'https://ae.example/owner/supply/connections/oauth/callback?attempt=pca_oauth',
      state: 'oauth-state-never-convex',
      clientInformation: { client_id: 'registered-client', issuer: 'https://login.provider.example' },
      tokens: {
        access_token: 'expired-access-token',
        token_type: 'bearer',
        refresh_token: 'refresh-token-never-convex',
      },
      discoveryState: { authorizationServerUrl: 'https://login.provider.example' },
      rotationAuthority: authority('rotate', 'oauth-callback'),
      rotationIdempotencyRef: 'oauth-callback',
    }))
    const rotateAuthority = authority('rotate', 'oauth-preview-refresh')
    let refreshedBundle = ''
    const writeSecret = vi.fn().mockImplementation(async (input) => {
      refreshedBundle = new TextDecoder().decode(input.material)
      return { kind: 'active' }
    })
    const verifyMcp = vi.fn().mockImplementation(async ({ authProvider }) => {
      await authProvider.saveTokens({
        access_token: 'refreshed-access-token',
        token_type: 'bearer',
        refresh_token: 'rotated-refresh-token',
      })
      return {
        kind: 'ready',
        serverUrl: 'https://mcp.provider.example/mcp',
        protocolVersion: '2025-11-25',
        sourceDigest: `sha256:${'9'.repeat(64)}`,
        tools: [{ name: 'lookup', inputSchema: { type: 'object' }, outputSchema: { type: 'object' } }],
      }
    })

    const result = await previewOwnerMcpProviderConnection({
      connectionRef: 'connection:mcp',
      businessRef: 'business:one',
      serverUrl: 'https://mcp.provider.example/mcp',
      environment: 'production',
    }, {
      prepareRuntime: vi.fn().mockResolvedValue({
        kind: 'available',
        connection: {
          connectionRef: 'connection:mcp',
          businessRef: 'business:one',
          sourceUrl: 'https://mcp.provider.example/mcp',
          secretRef,
          activeGeneration: 'sgn_00000000000040008000000000000063',
          pointerRevision: 3,
          rotationAuthority: rotateAuthority,
        },
      }),
      readSecret: vi.fn().mockResolvedValue(storedBundle),
      writeSecret,
      verifyMcp,
      randomCorrelation: () => 'mcp-preview-restart',
    })

    expect(result).toMatchObject({ kind: 'ready', tools: [{ name: 'lookup' }] })
    expect(writeSecret).toHaveBeenCalledWith(expect.objectContaining({
      action: 'rotate',
      secretRef,
      authority: rotateAuthority,
      idempotencyRef: 'oauth-preview-refresh',
    }))
    expect(refreshedBundle).toContain('refreshed-access-token')
    expect(refreshedBundle).toContain('rotated-refresh-token')
    expect(JSON.stringify(mocks.callSourceMutation.mock.calls)).not.toContain('refresh-token-never-convex')
  })

  it('revokes the refresh token through the discovered RFC 7009 endpoint without releasing it', async () => {
    const material = new TextEncoder().encode(JSON.stringify({
      version: 'ae.mcp-oauth-session:v1',
      attemptRef: 'pca_oauth',
      serverUrl: 'https://mcp.provider.example/mcp',
      environment: 'production',
      redirectUrl: 'https://ae.example/owner/supply/connections/oauth/callback?attempt=pca_oauth',
      state: 'oauth-state-never-convex',
      clientInformation: { client_id: 'registered-client', issuer: 'https://login.provider.example' },
      tokens: {
        access_token: 'access-token-never-convex',
        token_type: 'bearer',
        refresh_token: 'refresh-token-never-convex',
      },
      discoveryState: {
        authorizationServerUrl: 'https://login.provider.example',
        authorizationServerMetadata: {
          issuer: 'https://login.provider.example',
          revocation_endpoint: 'https://login.provider.example/revoke',
        },
      },
      rotationAuthority: authority('rotate', 'oauth-callback'),
      rotationIdempotencyRef: 'oauth-callback',
    }))
    const revoke = vi.fn().mockResolvedValue({ status: 200 })

    const result = await revokeStoredMcpProviderConnection(material, { revoke })

    expect(result).toMatchObject({
      outcome: 'revoked',
      reasonCode: 'oauth_revoked',
      evidenceRefs: ['provider_cleanup:oauth_revoked'],
    })
    expect(revoke).toHaveBeenCalledWith({
      authorizationServer: expect.objectContaining({
        issuer: 'https://login.provider.example',
        revocation_endpoint: 'https://login.provider.example/revoke',
      }),
      client: { client_id: 'registered-client' },
      token: 'refresh-token-never-convex',
      tokenTypeHint: 'refresh_token',
    })
    expect(JSON.stringify(result)).not.toContain('refresh-token-never-convex')
    expect(material.every((byte) => byte === 0)).toBe(true)
  })

  it('keeps unsupported and uncertain OAuth cleanup distinct', async () => {
    const session = (metadata: Record<string, unknown>) => new TextEncoder().encode(JSON.stringify({
      version: 'ae.mcp-oauth-session:v1',
      attemptRef: 'pca_oauth',
      serverUrl: 'https://mcp.provider.example/mcp',
      environment: 'production',
      redirectUrl: 'https://ae.example/owner/supply/connections/oauth/callback?attempt=pca_oauth',
      state: 'oauth-state-never-convex',
      clientInformation: { client_id: 'registered-client', issuer: 'https://login.provider.example' },
      tokens: { access_token: 'access-token-never-convex', token_type: 'bearer' },
      discoveryState: {
        authorizationServerUrl: 'https://login.provider.example',
        authorizationServerMetadata: metadata,
      },
      rotationAuthority: authority('rotate', 'oauth-callback'),
      rotationIdempotencyRef: 'oauth-callback',
    }))

    await expect(revokeStoredMcpProviderConnection(session({
      issuer: 'https://login.provider.example',
    }), { revoke: vi.fn() })).resolves.toMatchObject({
      outcome: 'unsupported',
      reasonCode: 'oauth_revocation_unsupported',
    })

    await expect(revokeStoredMcpProviderConnection(session({
      issuer: 'https://login.provider.example',
      revocation_endpoint: 'https://login.provider.example/revoke',
    }), { revoke: vi.fn().mockRejectedValue(new Error('lost response')) })).resolves.toMatchObject({
      outcome: 'outcome_unknown',
      reasonCode: 'oauth_revocation_unknown',
    })
  })
})

function authority(operation: 'provision' | 'rotate', idempotencyRef: string) {
  return {
    operation,
    snapshotRef: `das_${operation}`,
    accountRef: 'acc_00000000000040008000000000000061',
    actorPrincipalRef: 'prn_00000000000040008000000000000061',
    grantRef: 'grt_00000000000040008000000000000061',
    grantGeneration: 1,
    correlationRef: idempotencyRef,
    idempotencyRef,
    occurredAt: 1,
  }
}
