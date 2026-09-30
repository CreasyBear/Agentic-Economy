import { afterEach, describe, expect, it, vi } from 'vitest'

const issuanceMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  callSourceQuery: vi.fn(),
  callSourceMutation: vi.fn(),
  createConvexServerFunctionAssertion: vi.fn(),
  sourceQuery: vi.fn((name: string) => ({ name })),
  sourceMutation: vi.fn((name: string) => ({ name })),
}))

vi.mock('@clerk/tanstack-react-start/server', () => ({
  auth: issuanceMocks.auth,
  clerkClient: issuanceMocks.clerkClient,
}))
vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal()),
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  }),
}))
vi.mock('@/lib/server/convex-source', () => ({
  callSourceQuery: issuanceMocks.callSourceQuery,
  callSourceMutation: issuanceMocks.callSourceMutation,
  createConvexServerFunctionAssertion: issuanceMocks.createConvexServerFunctionAssertion,
  sourceQuery: issuanceMocks.sourceQuery,
  sourceMutation: issuanceMocks.sourceMutation,
}))

import { authenticateAgentAccess, type AgentAccessPrincipalResolver } from '@/lib/server/agent-access-auth'
import { ensureBootEnvironmentValidated, resetBootEnvironmentValidationForTests } from '@/lib/deployment/validate-boot-env.server'
import { readStripeMoneyProviderConfig } from '@/lib/server/stripe-money-provider-config'
import { readFormanceConfiguration } from '@/modules/money/formance'
import { issueAgentAccessKeyServer } from '@/modules/agent-access/agent-access.functions'
import {
  CUSTOMER_REQUEST_READ_ONLY_SCOPE,
  CUSTOMER_REQUEST_UNRESTRICTED_TEST_ONLY_SCOPE,
  MARKET_TOOLS_CALL_SCOPE,
} from '@/modules/agent-access/contract'

const production = { AE_DEPLOYMENT_ENVIRONMENT: 'production' } as const
const productionStripe = {
  ...production,
  STRIPE_SECRET_KEY: 'rk_live_isolated',
  STRIPE_WEBHOOK_SECRET: 'whsec_isolated',
}
const productionFormance = {
  ...production,
  AE_FORMANCE_ENVIRONMENT: 'production',
  AE_FORMANCE_GATEWAY_URL: 'https://formance.example.com',
  AE_FORMANCE_LEDGER: 'agentic-economy-production',
  AE_FORMANCE_ACCESS_CLIENT_ID: 'access-client-id',
  AE_FORMANCE_ACCESS_CLIENT_SECRET: 'access-client-secret',
  AE_FORMANCE_REQUEST_TIMEOUT_MS: '5000',
}

afterEach(() => {
  vi.unstubAllEnvs()
  resetBootEnvironmentValidationForTests()
})

describe('production isolation at server doors', () => {
  it('passes a matching bounded production key to canonical resolution', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const scopes = [MARKET_TOOLS_CALL_SCOPE, CUSTOMER_REQUEST_READ_ONLY_SCOPE]
    const resolvePrincipal = vi.fn<AgentAccessPrincipalResolver>(async (projection) => ({
      ...projection,
      principalId: 'prn_00000000000040008000000000000040',
      ownerId: 'acc_00000000000040008000000000000040',
    }))
    await expect(authenticateAgentAccess({
      authenticate: async () => ({
        isAuthenticated: true, tokenType: 'api_key', id: 'ak_production',
        subject: 'user_production', scopes, claims: { aeEnvironment: 'production' },
      }),
      consequenceResource: 'surface:test:production-isolation',
      resolvePrincipal,
    })).resolves.toMatchObject({ kind: 'authenticated', principal: { environment: 'production', authorityMode: 'read_only' } })
    expect(resolvePrincipal).toHaveBeenCalledOnce()
  })

  it('refuses sandbox issuance override before Clerk or canonical writes', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    vi.clearAllMocks()
    await expect(issueAgentAccessKeyServer({
      data: { name: 'Sandbox override', idempotencyKey: 'production-isolation-12345678', environment: 'sandbox' },
    })).resolves.toEqual({ kind: 'error', code: 'invalid_input', retryable: false })
    expect(issuanceMocks.auth).not.toHaveBeenCalled()
    expect(issuanceMocks.clerkClient).not.toHaveBeenCalled()
    expect(issuanceMocks.callSourceMutation).not.toHaveBeenCalled()
  })

  it.each([
    ['sandbox', [MARKET_TOOLS_CALL_SCOPE, CUSTOMER_REQUEST_READ_ONLY_SCOPE], 401, 'authentication_required'],
    ['preview', [MARKET_TOOLS_CALL_SCOPE, CUSTOMER_REQUEST_READ_ONLY_SCOPE], 401, 'authentication_required'],
    [undefined, [MARKET_TOOLS_CALL_SCOPE, CUSTOMER_REQUEST_READ_ONLY_SCOPE], 401, 'authentication_required'],
    ['production', [MARKET_TOOLS_CALL_SCOPE, CUSTOMER_REQUEST_UNRESTRICTED_TEST_ONLY_SCOPE], 403, 'scope_required'],
  ] as const)('refuses %s credential before canonical resolution', async (environment, scopes, status, reason) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const resolvePrincipal = vi.fn()
    await expect(authenticateAgentAccess({
      authenticate: async () => ({
        isAuthenticated: true, tokenType: 'api_key', id: 'ak_isolated',
        subject: 'user_isolated', scopes,
        ...(environment === undefined ? {} : { claims: { aeEnvironment: environment } }),
      }),
      consequenceResource: 'surface:test:production-isolation',
      resolvePrincipal,
    })).resolves.toEqual({ kind: 'refused', status, reason })
    expect(resolvePrincipal).not.toHaveBeenCalled()
  })

  it('refuses missing and test Stripe keys despite otherwise valid production configuration', () => {
    const refusal = { kind: 'refused', code: 'stripe_setup_required', retryable: false }
    expect(readStripeMoneyProviderConfig({ ...productionStripe, STRIPE_SECRET_KEY: undefined }))
      .toEqual(refusal)
    expect(readStripeMoneyProviderConfig({ ...productionStripe, STRIPE_SECRET_KEY: 'rk_test_isolated' }))
      .toEqual(refusal)
    expect(readStripeMoneyProviderConfig(productionStripe)).toMatchObject({ mode: 'live' })
  })

  it('refuses missing or sandbox Formance configuration with production declared', () => {
    const refusal = { kind: 'setup_required', code: 'formance_configuration_invalid' }
    expect(readFormanceConfiguration({ ...productionFormance, AE_FORMANCE_LEDGER: undefined }))
      .toEqual(refusal)
    expect(readFormanceConfiguration({ ...productionFormance, AE_FORMANCE_ENVIRONMENT: 'sandbox' }))
      .toEqual(refusal)
    expect(readFormanceConfiguration(productionFormance)).toMatchObject({ kind: 'configured', configuration: { environment: 'production' } })
  })

  it.each([undefined, 'Production'] as const)('fails boot with %s deployment declaration', (declaration) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', declaration)
    resetBootEnvironmentValidationForTests()
    expect(() => ensureBootEnvironmentValidated()).toThrow(/AE_DEPLOYMENT_ENVIRONMENT: must be exactly production or development/u)
  })
})
