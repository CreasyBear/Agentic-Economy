import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const serverMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  callSourceQuery: vi.fn(),
  callSourceMutation: vi.fn(),
  createConvexServerFunctionAssertion: vi.fn(),
  sourceQuery: vi.fn((name: string) => ({ name })),
  sourceMutation: vi.fn((name: string) => ({ name })),
  registerAgentAccessGrant: vi.fn(),
  revokeAgentAccessGrant: vi.fn(),
}))

vi.mock('@clerk/tanstack-react-start/server', () => ({
  auth: serverMocks.auth,
  clerkClient: serverMocks.clerkClient,
}))
vi.mock('@tanstack/react-start', () => ({
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
vi.mock('@/modules/agent-access/policy.functions', () => ({
  registerAgentAccessGrant: serverMocks.registerAgentAccessGrant,
  revokeAgentAccessGrant: serverMocks.revokeAgentAccessGrant,
}))

import {
  buildOwnerAgentAccessPolicy,
  issueAgentAccessKeyServer,
} from '@/modules/agent-access/agent-access.functions'

const amount = (units: string) => ({ currency: 'USD', units, exponent: 2 })

const clerkApi = {
  list: vi.fn(),
  create: vi.fn(),
  getSecret: vi.fn(),
  get: vi.fn(),
  revoke: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CLERK_JWT_ISSUER_DOMAIN', 'https://clerk.example.test/')
  serverMocks.auth.mockResolvedValue({ isAuthenticated: true, userId: 'user_123' })
  serverMocks.clerkClient.mockReturnValue({ apiKeys: clerkApi })
  clerkApi.list.mockResolvedValue({ data: [] })
  clerkApi.create.mockResolvedValue({ id: 'key_server', secret: 'secret_server' })
  clerkApi.getSecret.mockResolvedValue({ secret: 'secret_server' })
  serverMocks.callSourceMutation.mockImplementation(async (_reference: unknown, input: { grantRef: string; expiresAt: number }) => ({
    kind: 'recorded',
    grantRef: input.grantRef,
    generation: 1,
    policyDigest: 'sha256:policy',
    lifecycle: 'active',
    expiresAt: input.expiresAt,
  }))
  serverMocks.createConvexServerFunctionAssertion.mockResolvedValue({
    principalId: 'ae:server-function',
    ownerId: 'ae:server-function',
    credentialId: 'ae:server-function',
    scopes: ['market_operations:invoke'],
  })
  serverMocks.callSourceQuery.mockResolvedValue([])
  serverMocks.registerAgentAccessGrant.mockResolvedValue({
    kind: 'recorded',
    grantRef: 'server-12345678',
    generation: 1,
    policyDigest: 'sha256:policy',
    lifecycle: 'active',
    expiresAt: Date.now() + 60_000,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('owner agent-access issuance policy', () => {
  it('builds explicit bounded production spend, rate, and concurrency limits', () => {
    const policy = buildOwnerAgentAccessPolicy({
      environment: 'production',
      maximumSpendPerInvocation: amount('100'),
      maximumDailySpend: amount('500'),
      maximumMonthlySpend: amount('2000'),
      maximumConcurrentInvocations: 2,
      maximumCallsPerMinute: 10,
      maximumCallsPerHour: 100,
    })
    expect(policy.environment).toBe('production')
    expect(policy.budget.maximumSpendPerInvocation).toEqual(amount('100'))
    expect(policy.budget.maximumDailySpend).toEqual(amount('500'))
    expect(policy.budget.maximumMonthlySpend).toEqual(amount('2000'))
    expect(policy.budget.maximumConcurrentInvocations).toBe(2)
    expect(policy.rate.maximumCallsPerMinute).toBe(10)
    expect(policy.rate.maximumCallsPerHour).toBe(100)
  })

  it('keeps the production default fail-safe when no explicit budgets are supplied', () => {
    const policy = buildOwnerAgentAccessPolicy({ environment: 'production' })
    expect(policy.budget.maximumSpendPerInvocation).toEqual(amount('0'))
    expect(policy.budget.maximumDailySpend).toEqual(amount('0'))
    expect(policy.budget.maximumMonthlySpend).toEqual(amount('0'))
  })

  it('does not replace sandbox policy limits with production zero defaults', () => {
    const policy = buildOwnerAgentAccessPolicy({ environment: 'sandbox' })
    expect(policy.budget.maximumSpendPerInvocation.units).not.toBe('0')
  })

  it('requires canonical Convex authority before Clerk effects and keeps provider IDs as locators', async () => {
    await expect(issueAgentAccessKeyServer({
      data: {
        name: 'Server assistant',
        idempotencyKey: 'server-12345678',
      },
    })).resolves.toMatchObject({ kind: 'created', keyId: 'key_server' })

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

  it('creates no Clerk key when canonical account authority is unavailable', async () => {
    serverMocks.callSourceQuery.mockRejectedValue(new Error('canonical_authority_unavailable'))

    await expect(issueAgentAccessKeyServer({
      data: { name: 'Server assistant', idempotencyKey: 'authority-12345678' },
    })).resolves.toEqual({ kind: 'error', code: 'missing_auth', retryable: false })

    expect(clerkApi.create).not.toHaveBeenCalled()
    expect(serverMocks.registerAgentAccessGrant).not.toHaveBeenCalled()
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
})
