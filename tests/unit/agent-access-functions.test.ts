import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const serverMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  callSourceQuery: vi.fn(),
  callSourceMutation: vi.fn(),
  createConvexServerFunctionAssertion: vi.fn(),
  has: vi.fn(),
  sourceQuery: vi.fn((name: string) => ({ name })),
  sourceMutation: vi.fn((name: string) => ({ name })),
}))

vi.mock('@clerk/tanstack-react-start/server', () => ({
  auth: serverMocks.auth,
  clerkClient: serverMocks.clerkClient,
}))
vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal()),
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  }),
}))
vi.mock('@/lib/server/convex-source', () => ({
  callSourceQuery: serverMocks.callSourceQuery,
  callSourceMutation: serverMocks.callSourceMutation,
  createConvexServerFunctionAssertion: serverMocks.createConvexServerFunctionAssertion,
  sourceQuery: serverMocks.sourceQuery,
  sourceMutation: serverMocks.sourceMutation,
}))

import {
  buildOwnerAgentAccessPolicy,
  disconnectAgentServer,
  enableOwnerChatSpendingServer,
  issueAgentAccessKeyServer,
  renameAgentServer,
  revokeAgentCredentialServer,
  updateAgentSpendingLimitsServer,
} from '@/modules/agent-access/agent-access.functions'

const amount = (units: string) => ({ currency: 'USD', units, exponent: 2 })
const spendingAmount = (units: string) => ({ currency: 'AUD', units, exponent: 6 })

const clerkApi = {
  list: vi.fn(),
  create: vi.fn(),
  getSecret: vi.fn(),
  get: vi.fn(),
  revoke: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
  vi.stubEnv('CLERK_JWT_ISSUER_DOMAIN', 'https://clerk.example.test/')
  serverMocks.has.mockReturnValue(true)
  serverMocks.auth.mockResolvedValue({ isAuthenticated: true, userId: 'user_123', has: serverMocks.has })
  serverMocks.clerkClient.mockReturnValue({ apiKeys: clerkApi })
  clerkApi.list.mockResolvedValue({ data: [] })
  clerkApi.create.mockResolvedValue({ id: 'key_server', secret: 'secret_server' })
  clerkApi.getSecret.mockResolvedValue({ secret: 'secret_server' })
  serverMocks.callSourceMutation.mockImplementation(async (_reference: unknown, input: { grantRef: string; expiresAt: number }) => ({
    kind: 'recorded',
    grantRef: input.grantRef,
    generation: 1,
    spendingPolicyDigest: 'sha256:policy',
    lifecycle: 'active',
    expiresAt: input.expiresAt,
  }))
  serverMocks.createConvexServerFunctionAssertion.mockResolvedValue({
    principalId: 'ae:server-function',
    ownerId: 'ae:server-function',
    credentialId: 'ae:server-function',
    scopes: ['market_tools:call'],
  })
  serverMocks.callSourceQuery.mockImplementation(async (reference: { name: string }) =>
    reference.name === 'platformLaunch:readOwnerPaymentAccess' ? { kind: 'allowed' }
      : reference.name === 'agentAccessPrincipals:readLegacyOwnerChatPrincipal' ? null : [])
})

describe('owner chat environment cutover', () => {
  it.each(['payments_paused', 'payments_admins_only', 'payments_not_ready'] as const)('refuses %s before legacy cleanup or issuing credentials', async (code) => {
    serverMocks.callSourceQuery.mockImplementation(async (reference: { name: string }) =>
      reference.name === 'platformLaunch:readOwnerPaymentAccess' ? { kind: 'refused', code } : [])
    await expect(enableOwnerChatSpendingServer()).resolves.toEqual({ kind: 'refused', code })
    expect(serverMocks.callSourceQuery).not.toHaveBeenCalledWith({ name: 'agentAccessPrincipals:readLegacyOwnerChatPrincipal' }, expect.anything())
    expect(serverMocks.callSourceMutation).not.toHaveBeenCalled()
    expect(clerkApi.create).not.toHaveBeenCalled()
    expect(clerkApi.revoke).not.toHaveBeenCalled()
  })

  it('refuses an unavailable payment gate before legacy cleanup or issuing credentials', async () => {
    serverMocks.callSourceQuery.mockImplementation(async (reference: { name: string }) => {
      if (reference.name === 'platformLaunch:readOwnerPaymentAccess') throw new Error('source unavailable')
      return []
    })
    await expect(enableOwnerChatSpendingServer()).resolves.toEqual({ kind: 'refused', code: 'issuance_unavailable', retryable: true })
    expect(serverMocks.callSourceMutation).not.toHaveBeenCalled()
    expect(clerkApi.create).not.toHaveBeenCalled()
  })

  it.each([['production', 'production'], ['development', 'sandbox']] as const)(
    'issues a secretless %s credential with bounded spending and an environment-specific retry key', async (deployment, environment) => {
      vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', deployment)
      serverMocks.has.mockReturnValue(false)
      await expect(enableOwnerChatSpendingServer()).resolves.toEqual({ kind: 'enabled' })
      const created = clerkApi.create.mock.calls[0]?.[0]
      expect(created.claims).toMatchObject({
        aeApplicationRef: 'ae-owner-chat', aeEnvironment: environment,
        aeIssuanceKey: `owner-chat-spend-user_123-${environment}`,
      })
      expect(serverMocks.has).not.toHaveBeenCalled()
      expect(clerkApi.getSecret).not.toHaveBeenCalled()
      const registration = serverMocks.callSourceMutation.mock.calls[0]?.[1]
      expect(registration.spendingPolicy).toMatchObject({
        environment,
        budget: {
          maximumSpendPerCall: spendingAmount('1000000'),
          maximumDailySpend: spendingAmount('5000000'),
          maximumMonthlySpend: spendingAmount('20000000'),
        },
      })
      clerkApi.list.mockResolvedValue({ data: [{
        id: 'key_server', name: created.name, subject: 'user_123', revoked: false, expired: false,
        claims: created.claims, scopes: created.scopes,
        createdAt: registration.createdAt, expiresAt: registration.expiresAt,
      }] })
      await expect(enableOwnerChatSpendingServer()).resolves.toEqual({ kind: 'enabled' })
      expect(clerkApi.create).toHaveBeenCalledTimes(1)
      expect(clerkApi.getSecret).not.toHaveBeenCalled()
    },
  )

  it('finishes a failed legacy provider revocation before creating the replacement', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    serverMocks.callSourceQuery.mockImplementation(async (reference: { name: string }) =>
      reference.name === 'platformLaunch:readOwnerPaymentAccess' ? { kind: 'allowed' }
        : reference.name === 'agentAccessPrincipals:readLegacyOwnerChatPrincipal' ? 'prn_legacy' : [])
    const canonical = {
      kind: 'completed', principalRef: 'prn_legacy', correlationRef: 'legacy-cutover',
      providerTargets: [{ credentialRef: 'crd_legacy', providerCredentialId: 'key_legacy' }],
    }
    serverMocks.callSourceMutation.mockImplementation(async (reference: { name: string }, input: { grantRef: string; expiresAt: number }) => {
      if (reference.name === 'agentAccessPrincipals:disconnectAgentForServer') return canonical
      if (reference.name === 'agentAccessPrincipals:recordProviderRevocationForServer') return { kind: 'completed' }
      return { kind: 'recorded', grantRef: input.grantRef, generation: 1, spendingPolicyDigest: 'sha256:policy', lifecycle: 'active', expiresAt: input.expiresAt }
    })
    clerkApi.get.mockResolvedValue({ id: 'key_legacy', subject: 'user_123', name: 'legacy', revoked: false, expired: false, claims: null })
    clerkApi.revoke.mockRejectedValueOnce(new Error('provider unavailable')).mockResolvedValue(undefined)
    await expect(enableOwnerChatSpendingServer()).resolves.toEqual({ kind: 'refused', code: 'issuance_unavailable', retryable: true })
    expect(clerkApi.create).not.toHaveBeenCalled()
    expect(serverMocks.callSourceMutation).toHaveBeenCalledWith(
      { name: 'agentAccessPrincipals:recordProviderRevocationForServer' }, expect.objectContaining({ outcome: 'failed' }),
    )
    await expect(enableOwnerChatSpendingServer()).resolves.toEqual({ kind: 'enabled' })
    expect(clerkApi.revoke).toHaveBeenCalledTimes(2)
    expect(clerkApi.create).toHaveBeenCalledTimes(1)
    expect(clerkApi.revoke.mock.invocationCallOrder[1]).toBeLessThan(clerkApi.create.mock.invocationCallOrder[0]!)
  })

  it('refuses an undeclared environment before authentication or credential effects', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', undefined)
    await expect(enableOwnerChatSpendingServer()).resolves.toEqual({ kind: 'refused', code: 'invalid_input' })
    expect(serverMocks.auth).not.toHaveBeenCalled()
    expect(clerkApi.create).not.toHaveBeenCalled()
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('owner agent-access issuance policy', () => {
  it.each([
    ['production', 'production'], ['development', 'sandbox'],
  ] as const)('derives omitted issuance environment from %s', async (deployment, environment) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', deployment)
    await expect(issueAgentAccessKeyServer({
      data: { name: 'Deployment assistant', idempotencyKey: 'deployment-12345678' },
    })).resolves.toMatchObject({ kind: 'created' })
    expect(clerkApi.create).toHaveBeenCalledWith(expect.objectContaining({
      claims: expect.objectContaining({ aeEnvironment: environment }),
    }))
    expect(serverMocks.callSourceMutation).toHaveBeenCalledWith(
      { name: 'agentAccessPrincipals:registerIssuedAgentBindingForServer' },
      expect.objectContaining({ environment, spendingPolicy: expect.objectContaining({ environment }) }),
    )
    if (environment === 'production') {
      expect(serverMocks.callSourceMutation.mock.calls[0]?.[1].spendingPolicy.budget.maximumSpendPerCall.units).toBe('0')
    }
  })

  it.each([
    [undefined, undefined], ['', undefined], ['Production', undefined],
    ['production', 'sandbox'], ['development', 'production'],
  ] as const)('refuses undeclared or opposite issuance (%s, %s) before effects', async (deployment, environment) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', deployment)
    await expect(issueAgentAccessKeyServer({
      data: { name: 'Wrong world', idempotencyKey: 'wrong-world-12345678', ...(environment === undefined ? {} : { environment }) },
    })).resolves.toEqual({ kind: 'error', code: 'invalid_input', retryable: false })
    expect(serverMocks.auth).not.toHaveBeenCalled()
    expect(clerkApi.list).not.toHaveBeenCalled()
    expect(clerkApi.create).not.toHaveBeenCalled()
    expect(serverMocks.callSourceMutation).not.toHaveBeenCalled()
  })

  it('refuses production unrestricted issuance even when the caller omits environment', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    await expect(issueAgentAccessKeyServer({
      data: { name: 'Unrestricted', idempotencyKey: 'unrestricted-12345678', authorityMode: 'unrestricted_test_only' },
    })).resolves.toEqual({ kind: 'error', code: 'invalid_input', retryable: false })
    expect(clerkApi.list).not.toHaveBeenCalled()
    expect(clerkApi.create).not.toHaveBeenCalled()
  })

  it('builds explicit bounded production spend, rate, and concurrency limits', () => {
    const policy = buildOwnerAgentAccessPolicy({
      environment: 'production',
      maximumSpendPerCall: amount('100'),
      maximumDailySpend: amount('500'),
      maximumMonthlySpend: amount('2000'),
      maximumConcurrentCalls: 2,
      maximumCallsPerMinute: 10,
      maximumCallsPerHour: 100,
    })
    expect(policy.environment).toBe('production')
    expect(policy.budget.maximumSpendPerCall).toEqual(amount('100'))
    expect(policy.budget.maximumDailySpend).toEqual(amount('500'))
    expect(policy.budget.maximumMonthlySpend).toEqual(amount('2000'))
    expect(policy.budget.maximumConcurrentCalls).toBe(2)
    expect(policy.rate.maximumCallsPerMinute).toBe(10)
    expect(policy.rate.maximumCallsPerHour).toBe(100)
  })

  it('keeps the production default fail-safe when no explicit budgets are supplied', () => {
    const policy = buildOwnerAgentAccessPolicy({ environment: 'production' })
    const zero = { currency: 'AUD', units: '0', exponent: 6 }
    expect(policy.budget.maximumSpendPerCall).toEqual(zero)
    expect(policy.budget.maximumDailySpend).toEqual(zero)
    expect(policy.budget.maximumMonthlySpend).toEqual(zero)
  })

  it('does not replace sandbox policy limits with production zero defaults', () => {
    const policy = buildOwnerAgentAccessPolicy({ environment: 'sandbox' })
    expect(policy.budget.maximumSpendPerCall).toEqual({ currency: 'AUD', units: '1000000', exponent: 6 })
    expect(policy.budget.maximumDailySpend).toEqual({ currency: 'AUD', units: '5000000', exponent: 6 })
    expect(policy.budget.maximumMonthlySpend).toEqual({ currency: 'AUD', units: '20000000', exponent: 6 })
  })

  it('requires canonical Convex authority before Clerk effects and keeps provider IDs as locators', async () => {
    await expect(issueAgentAccessKeyServer({
      data: {
        name: 'Server assistant',
        idempotencyKey: 'server-12345678',
      },
    })).resolves.toMatchObject({ kind: 'created', keyId: 'key_server' })
    expect(serverMocks.has).toHaveBeenCalledWith({ reverification: 'strict' })

    expect(serverMocks.callSourceQuery).toHaveBeenCalledWith(
      { name: 'agentAccessPolicy:listOwnerGrantReadbacks' },
      { requireAuthority: true },
    )
    expect(clerkApi.create).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'user_123',
      createdBy: 'user_123',
    }))
    expect(serverMocks.callSourceMutation).toHaveBeenCalledWith(
      { name: 'agentAccessPrincipals:registerIssuedAgentBindingForServer' },
      expect.objectContaining({
        credentialId: 'key_server',
        grantRef: expect.stringMatching(/^grt_[0-9a-f]{32}$/u),
        serviceAuth: expect.objectContaining({ principalId: 'ae:server-function' }),
      }),
    )
    expect(serverMocks.callSourceMutation.mock.calls[0]?.[1]).not.toHaveProperty('ownerId')
  })

  it('returns a closed refusal before side effects when strict reverification is missing', async () => {
    serverMocks.has.mockReturnValue(false)

    await expect(issueAgentAccessKeyServer({
      data: { name: 'Server assistant', idempotencyKey: 'proof-12345678' },
    })).resolves.toEqual({ kind: 'refused', code: 'reverification_required' })

    expect(serverMocks.has).toHaveBeenCalledWith({ reverification: 'strict' })
    expect(clerkApi.create).not.toHaveBeenCalled()
    expect(serverMocks.callSourceMutation).not.toHaveBeenCalled()
  })
  it('creates no Clerk key when canonical account authority is unavailable', async () => {
    serverMocks.callSourceQuery.mockRejectedValue(new Error('canonical_authority_unavailable'))

    await expect(issueAgentAccessKeyServer({
      data: { name: 'Server assistant', idempotencyKey: 'authority-12345678' },
    })).resolves.toEqual({ kind: 'error', code: 'missing_auth', retryable: false })

    expect(clerkApi.create).not.toHaveBeenCalled()
  })

  it('fails closed with missing auth when issuer or Clerk identity is unavailable', async () => {
    vi.stubEnv('CLERK_JWT_ISSUER_DOMAIN', '')
    await expect(issueAgentAccessKeyServer({
      data: { name: 'Server assistant', idempotencyKey: 'issuer-12345678' },
    })).resolves.toEqual({ kind: 'error', code: 'missing_auth', retryable: false })
    expect(serverMocks.clerkClient).not.toHaveBeenCalled()

    vi.stubEnv('CLERK_JWT_ISSUER_DOMAIN', 'https://clerk.example.test')
    serverMocks.auth.mockResolvedValue({ isAuthenticated: false, userId: null })
    await expect(issueAgentAccessKeyServer({
      data: { name: 'Server assistant', idempotencyKey: 'identity-12345678' },
    })).resolves.toEqual({ kind: 'error', code: 'missing_auth', retryable: false })
    expect(serverMocks.clerkClient).not.toHaveBeenCalled()
  })

  it('reports provider cleanup failure as partial and retries from canonical replay', async () => {
    const canonical = {
      kind: 'completed' as const,
      principalRef: 'prn_agent_a',
      providerTargets: [{ credentialRef: 'crd_agent_a', providerCredentialId: 'key_agent_a' }],
      correlationRef: 'corr-agent-a',
    }
    serverMocks.callSourceMutation.mockImplementation(async (reference: { name: string }, input: Record<string, unknown>) => {
      if (reference.name === 'agentAccessPrincipals:revokeCredentialForServer') return canonical
      if (reference.name === 'agentAccessPrincipals:recordProviderRevocationForServer') {
        expect(input).toMatchObject({ outcome: 'failed', providerCredentialId: 'key_agent_a' })
        return { kind: 'completed' }
      }
      throw new Error(`unexpected mutation ${reference.name}`)
    })
    clerkApi.get.mockResolvedValue({ id: 'key_agent_a', subject: 'user_123', name: 'Agent A', revoked: false, expired: false, claims: {} })
    clerkApi.revoke.mockRejectedValueOnce(new Error('provider unavailable'))

    await expect(revokeAgentCredentialServer({ data: { credentialRef: 'crd_agent_a' } }))
      .resolves.toMatchObject({ kind: 'partial', principalRef: 'prn_agent_a', retryable: true })

    serverMocks.callSourceMutation.mockImplementation(async (reference: { name: string }, input: Record<string, unknown>) => {
      if (reference.name === 'agentAccessPrincipals:revokeCredentialForServer') return { ...canonical, kind: 'replayed' }
      if (reference.name === 'agentAccessPrincipals:recordProviderRevocationForServer') {
        expect(input).toMatchObject({ outcome: 'revoked', providerCredentialId: 'key_agent_a' })
        return { kind: 'completed' }
      }
      throw new Error(`unexpected mutation ${reference.name}`)
    })
    clerkApi.get.mockResolvedValue({ id: 'key_agent_a', subject: 'user_123', name: 'Agent A', revoked: true, expired: false, claims: {} })
    await expect(revokeAgentCredentialServer({ data: { credentialRef: 'crd_agent_a' } }))
      .resolves.toMatchObject({ kind: 'replayed', principalRef: 'prn_agent_a' })
  })

  it('disconnects only the canonical principal selected by the owner', async () => {
    serverMocks.callSourceMutation.mockImplementation(async (reference: { name: string }, input: Record<string, unknown>) => {
      if (reference.name === 'agentAccessPrincipals:disconnectAgentForServer') {
        expect(input).toMatchObject({ principalRef: 'prn_agent_a' })
        return { kind: 'completed', principalRef: 'prn_agent_a', providerTargets: [], correlationRef: 'corr-disconnect-a' }
      }
      throw new Error(`unexpected mutation ${reference.name}`)
    })
    await expect(disconnectAgentServer({ data: { principalRef: 'prn_agent_a' } }))
      .resolves.toEqual({ kind: 'completed', principalRef: 'prn_agent_a', correlationRef: 'corr-disconnect-a' })
    expect(clerkApi.revoke).not.toHaveBeenCalled()
  })

  it('renames through canonical Principal CAS without calling Clerk', async () => {
    serverMocks.callSourceMutation.mockImplementation(async (reference: { name: string }, input: Record<string, unknown>) => {
      if (reference.name !== 'agentAccessPrincipals:renameAgentForServer') {
        throw new Error(`unexpected mutation ${reference.name}`)
      }
      expect(input).toMatchObject({
        principalRef: 'prn_agent_a',
        expectedRevision: 4,
        displayName: 'Research assistant',
        correlationRef: expect.any(String),
      })
      return {
        kind: 'completed',
        principalRef: 'prn_agent_a',
        displayName: 'Research assistant',
        revision: 5,
        correlationRef: input.correlationRef,
      }
    })

    await expect(renameAgentServer({
      data: {
        principalRef: 'prn_agent_a',
        expectedRevision: 4,
        displayName: 'Research assistant',
      },
    })).resolves.toMatchObject({
      kind: 'completed',
      principalRef: 'prn_agent_a',
      displayName: 'Research assistant',
      revision: 5,
    })
    expect(serverMocks.callSourceQuery).toHaveBeenCalledWith(
      { name: 'agentAccessPolicy:listOwnerGrantReadbacks' },
      { requireAuthority: true },
    )
    expect(serverMocks.clerkClient).not.toHaveBeenCalled()
  })

  it('returns resumable partial state when canonical disconnection has another bounded batch', async () => {
    serverMocks.callSourceMutation.mockImplementation(async (reference: { name: string }) => {
      if (reference.name === 'agentAccessPrincipals:disconnectAgentForServer') {
        return {
          kind: 'completed',
          principalRef: 'prn_agent_many',
          providerTargets: [],
          hasMore: true,
          correlationRef: 'corr-disconnect-many',
        }
      }
      throw new Error(`unexpected mutation ${reference.name}`)
    })
    await expect(disconnectAgentServer({ data: { principalRef: 'prn_agent_many' } }))
      .resolves.toEqual({
        kind: 'partial',
        code: 'work_remaining',
        principalRef: 'prn_agent_many',
        correlationRef: 'corr-disconnect-many',
        retryable: true,
      })
    expect(clerkApi.revoke).not.toHaveBeenCalled()
  })

  it('does not call Clerk again when canonical replay has no pending provider work', async () => {
    serverMocks.callSourceMutation.mockImplementation(async (reference: { name: string }) => {
      if (reference.name === 'agentAccessPrincipals:revokeCredentialForServer') {
        return {
          kind: 'replayed',
          principalRef: 'prn_agent_a',
          providerTargets: [],
          correlationRef: 'corr-agent-a-replay',
        }
      }
      throw new Error(`unexpected mutation ${reference.name}`)
    })

    await expect(revokeAgentCredentialServer({ data: { credentialRef: 'crd_agent_a' } }))
      .resolves.toEqual({
        kind: 'replayed',
        principalRef: 'prn_agent_a',
        correlationRef: 'corr-agent-a-replay',
      })
    expect(clerkApi.get).not.toHaveBeenCalled()
    expect(clerkApi.revoke).not.toHaveBeenCalled()
  })
})

describe('owner spending policy limits', () => {
  const update = {
    principalRef: 'prn_agent_a',
    expectedGeneration: 3,
    idempotencyKey: 'spending-limits-12345678',
    maximumSpendPerCall: spendingAmount('1000000'),
    maximumDailySpend: spendingAmount('5000000'),
    maximumMonthlySpend: spendingAmount('20000000'),
  }

  it('forwards each spending limit and the original idempotency key to the canonical mutation', async () => {
    serverMocks.callSourceMutation.mockImplementation(async (reference: { name: string }, input: Record<string, unknown>) => {
      expect(reference).toEqual({ name: 'agentSpendingPolicy:updateForServer' })
      expect(input).toMatchObject({
        ...update,
        correlationRef: expect.any(String),
      })
      expect(input.idempotencyKey).toBe(update.idempotencyKey)
      return {
        kind: 'completed',
        principalRef: update.principalRef,
        grantRef: 'agt_grant_a',
        generation: 4,
        spendingPolicyDigest: 'sha256:spending-policy',
        correlationRef: input.correlationRef,
      }
    })

    await expect(updateAgentSpendingLimitsServer({ data: update })).resolves.toMatchObject({
      kind: 'completed',
      principalRef: update.principalRef,
      grantRef: 'agt_grant_a',
      generation: 4,
    })
    expect(serverMocks.callSourceQuery).toHaveBeenCalledWith(
      { name: 'agentAccessPolicy:listOwnerGrantReadbacks' },
      { requireAuthority: true },
    )
  })

  it('preserves the canonical authentication refusal for a principal outside the owner authority', async () => {
    serverMocks.callSourceMutation.mockResolvedValue({
      kind: 'refused',
      code: 'authentication_required',
      correlationRef: 'corr-owner-refused',
    })

    await expect(updateAgentSpendingLimitsServer({ data: update })).resolves.toEqual({
      kind: 'refused',
      code: 'authentication_required',
      correlationRef: 'corr-owner-refused',
    })
    expect(serverMocks.callSourceMutation).toHaveBeenCalledWith(
      { name: 'agentSpendingPolicy:updateForServer' },
      expect.objectContaining({ principalRef: update.principalRef }),
    )
  })

  it('degrades a source transport failure to one correlated unavailable refusal', async () => {
    serverMocks.callSourceMutation.mockRejectedValue(new Error('source_down'))

    await expect(updateAgentSpendingLimitsServer({ data: update })).resolves.toEqual({
      kind: 'refused',
      code: 'source_unavailable',
      correlationRef: expect.any(String),
    })
    expect(serverMocks.callSourceMutation).toHaveBeenCalledWith(
      { name: 'agentSpendingPolicy:updateForServer' },
      expect.objectContaining({ idempotencyKey: update.idempotencyKey, correlationRef: expect.any(String) }),
    )
  })
})
