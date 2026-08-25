import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const serverMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  callSourceMutation: vi.fn(),
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
  callSourceMutation: serverMocks.callSourceMutation,
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
  serverMocks.callSourceMutation.mockResolvedValue({ kind: 'recorded' })
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

  it('registers Convex ownership by token identifier while Clerk keeps the raw user subject', async () => {
    await expect(issueAgentAccessKeyServer({
      data: {
        name: 'Server assistant',
        idempotencyKey: 'server-12345678',
      },
    })).resolves.toMatchObject({ kind: 'created', keyId: 'key_server' })

    const tokenIdentifier = 'https://clerk.example.test|user_123'
    expect(clerkApi.create).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'user_123',
      createdBy: 'user_123',
    }))
    expect(serverMocks.registerAgentAccessGrant).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: tokenIdentifier }),
    )
    expect(serverMocks.registerAgentAccessGrant.mock.calls[0]?.[0].ownerId).not.toBe('user_123')
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
