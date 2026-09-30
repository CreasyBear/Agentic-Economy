import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEPLOYMENT_MANIFEST, SOURCE_WRITE_FAMILIES, validateDeploymentManifest } from '@/lib/deployment/manifest'
import { validateEnvironment } from '@/lib/deployment/env-schema'

import {
  ensureBootEnvironmentValidated,
  resetBootEnvironmentValidationForTests,
} from '@/lib/deployment/validate-boot-env.server'

function liveConfiguration(): Record<string, string> {
  return {
    NODE_ENV: 'production', AE_DEPLOYMENT_ENVIRONMENT: 'production',
    AE_CANONICAL_BASE_URL: 'https://ae.example', CONVEX_URL: 'https://convex.example',
    AE_CONVEX_SERVER_FUNCTION_TOKEN: 'source-token',
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_example', CLERK_SECRET_KEY: 'sk_live_example',
    CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.example', CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_example',
    AE_FORMANCE_ENVIRONMENT: 'production', AE_FORMANCE_GATEWAY_URL: 'https://formance.example',
    AE_FORMANCE_LEDGER: 'agentic-economy-production',
    AE_FORMANCE_ACCESS_CLIENT_ID: 'access-client', AE_FORMANCE_ACCESS_CLIENT_SECRET: 'private-access-secret',
    CDP_API_KEY_ID: 'cdp-key', CDP_API_KEY_SECRET: 'private-cdp-secret', CDP_WALLET_SECRET: 'private-wallet-secret',
    AE_X402_CDP_ACCOUNT_NAME: 'agentic-economy', AE_X402_CDP_EXPECTED_EVM_ADDRESS: `0x${'1'.repeat(40)}`,
    AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-4111-8111-111111111111',
    AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-4222-8222-222222222222',
    AE_X402_CDP_POLICY_RULES_DIGEST: `sha256:${'a'.repeat(64)}`, AE_X402_CDP_CREDENTIAL_GENERATION: '1',
    AE_X402_CUSTODY_ENABLED: 'true', AE_X402_CUSTODY_MAX_ATOMIC: '1000000', AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '10000000',
    AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC: '5000000', AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC: '500000',
    AE_X402_RPC_URLS_JSON: '{"eip155:8453":["https://first.example/rpc","https://second.example/rpc"]}',
    SENTRY_DSN: 'https://public@o1.ingest.sentry.io/1', VITE_SENTRY_DSN: 'https://browser@o1.ingest.sentry.io/1',
    SENTRY_ENVIRONMENT: 'production', VITE_SENTRY_ENVIRONMENT: 'production',
    AE_PACKAGE5_WRITES_ENABLED: 'true', AE_SUPPLY_HTTP_CREDENTIALS_ENABLED: 'true',
    AE_SUPPLY_MCP_OAUTH_ENABLED: 'true', AE_PROVIDER_OFFBOARDING_ENABLED: 'true',
    AE_INFISICAL_BASE_URL: 'https://app.infisical.com',
    AE_INFISICAL_CUSTOMER_PROJECT_ID: 'customer-project', AE_INFISICAL_CUSTOMER_ENVIRONMENT: 'production',
    AE_INFISICAL_CUSTOMER_SECRET_PATH: '/customer', AE_INFISICAL_CUSTOMER_MACHINE_IDENTITY_ID: 'customer-identity',
    AE_INFISICAL_PLATFORM_PROJECT_ID: 'platform-project', AE_INFISICAL_PLATFORM_ENVIRONMENT: 'production',
    AE_INFISICAL_PLATFORM_SECRET_PATH: '/platform', AE_INFISICAL_PLATFORM_MACHINE_IDENTITY_ID: 'platform-identity',
    ...Object.fromEntries(SOURCE_WRITE_FAMILIES.map(family => [`AE_SOURCE_WRITE_KEY_${family.toUpperCase()}`, `${family}:0123456789abcdef0123456789abcdef`])),
  }
}

afterEach(() => {
  resetBootEnvironmentValidationForTests()
  vi.unstubAllEnvs()
})

describe('ensureBootEnvironmentValidated', () => {
  it('does not demand production secrets on a Vercel Preview', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    vi.stubEnv('AE_SOURCE_WRITE_SECRET', 'preview-source-write-secret-that-is-long-enough')
    delete process.env.AE_CANONICAL_BASE_URL
    delete process.env.CLERK_SECRET_KEY

    expect(() => ensureBootEnvironmentValidated()).not.toThrow()
  })

  it('keeps hosted production fail-closed and repeats the same error', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    delete process.env.AE_CANONICAL_BASE_URL

    expect(() => ensureBootEnvironmentValidated()).toThrow(/AE_CANONICAL_BASE_URL: canonical_origin_required/)
    expect(() => ensureBootEnvironmentValidated()).toThrow(/AE_CANONICAL_BASE_URL: canonical_origin_required/)
  })

  it('preserves hosted development shared checks without demanding live operation configuration', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://ae.example')
    vi.stubEnv('CONVEX_URL', 'https://convex.example')
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'source-token')
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_live_example')
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_live_example')
    vi.stubEnv('CLERK_JWT_ISSUER_DOMAIN', 'https://clerk.example')
    vi.stubEnv('CLERK_WEBHOOK_SIGNING_SECRET', 'whsec_example')
    for (const family of ['BILLING', 'PROTECTED', 'CATALOG', 'OPERATOR', 'REPAIR', 'SESSION']) {
      vi.stubEnv(`AE_SOURCE_WRITE_KEY_${family}`, `${family.toLowerCase()}:0123456789abcdef0123456789abcdef`)
    }
    vi.stubEnv('AE_INFISICAL_BASE_URL', 'malformed-optional-url')
    vi.stubEnv('OPENROUTER_API_KEY', '')
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    vi.stubEnv('CDP_API_KEY_ID', '')

    expect(() => ensureBootEnvironmentValidated()).not.toThrow()
  })

  it('preserves hosted development shared presence and forbidden checks', () => {
    const environment = { ...liveConfiguration(), AE_DEPLOYMENT_ENVIRONMENT: 'development',
      AE_CANONICAL_BASE_URL: undefined, AE_SOURCE_WRITE_SECRET: 'private-root-secret' }
    const result = validateEnvironment(environment, 'production')
    expect(result).toMatchObject({ ok: false, problems: expect.arrayContaining([
      { name: 'AE_CANONICAL_BASE_URL', reason: 'required in production but missing' },
      { name: 'AE_SOURCE_WRITE_SECRET', reason: 'forbidden in production but present' },
    ]) })
    expect(JSON.stringify(result)).not.toContain('private-root-secret')
  })

  it.each(['development', 'production'] as const)('uses the exact manifest verdict for live money in %s boot', hosting => {
    const complete = liveConfiguration()
    expect(validateDeploymentManifest(complete, { environment: hosting }).ok).toBe(true)
    expect(validateEnvironment(complete, hosting)).toEqual({ ok: true })
    for (const override of [
      { CDP_WALLET_SECRET: undefined }, { AE_FORMANCE_ACCESS_CLIENT_SECRET: undefined },
      { VITE_SENTRY_DSN: 'https://public:private-password@sentry.example/1' },
      { VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_wrong' },
      { AE_SOURCE_WRITE_KEY_BILLING: 'private-invalid-key' },
      { AE_X402_RPC_URLS_JSON: '{"eip155:8453":["https://first.example/rpc"]}' },
    ]) {
      const environment = { ...complete, ...override }
      const manifest = validateDeploymentManifest(environment, { environment: hosting })
      const result = validateEnvironment(environment, hosting)
      expect(result).toEqual({ ok: false, problems: manifest.findings.flatMap(finding =>
        finding.names.map(name => ({ name, reason: finding.code }))) })
      expect(JSON.stringify(result)).not.toContain('private-')
    }
  })

  it('runs semantic live checks on preview boot and does not cache a refusal', () => {
    for (const name of new Set([...DEPLOYMENT_MANIFEST.configuration.requiredProduction.flatMap(group => group.names),
      ...DEPLOYMENT_MANIFEST.configuration.forbiddenProduction])) vi.stubEnv(name, undefined)
    for (const [name, value] of Object.entries(liveConfiguration())) vi.stubEnv(name, value)
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('AE_X402_CDP_CREDENTIAL_GENERATION', '0')
    expect(() => ensureBootEnvironmentValidated()).toThrow(/x402_custody_configuration_invalid/)
    vi.stubEnv('AE_X402_CDP_CREDENTIAL_GENERATION', '1')
    expect(() => ensureBootEnvironmentValidated()).not.toThrow()
  })

  it('rejects a missing declaration on preview repeatedly until corrected and reset', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', undefined)

    expect(() => ensureBootEnvironmentValidated()).toThrow(
      /AE_DEPLOYMENT_ENVIRONMENT: must be exactly production or development/,
    )
    expect(() => ensureBootEnvironmentValidated()).toThrow(
      /AE_DEPLOYMENT_ENVIRONMENT: must be exactly production or development/,
    )

    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    resetBootEnvironmentValidationForTests()
    expect(() => ensureBootEnvironmentValidated()).not.toThrow()
  })

  it.each(['', 'preview', ' production ', 'Production', 'sandbox'])(
    'rejects malformed deployment declaration %j without echoing it',
    (declaration) => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VERCEL_ENV', 'preview')
      vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', declaration)

      let message = ''
      try {
        ensureBootEnvironmentValidated()
      } catch (error) {
        message = (error as Error).message
      }
      expect(message).toBe('Invalid environment configuration:\nAE_DEPLOYMENT_ENVIRONMENT: must be exactly production or development')
      expect(() => ensureBootEnvironmentValidated()).toThrow(
        /AE_DEPLOYMENT_ENVIRONMENT: must be exactly production or development/,
      )
    },
  )
})
