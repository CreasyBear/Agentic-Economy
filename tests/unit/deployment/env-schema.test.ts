import { describe, expect, it } from 'vitest'

import { validateEnvironment } from '../../../src/lib/deployment/env-schema'

function disabledHostedAlphaEnvironment(): NodeJS.ProcessEnv {
  return {
    AE_SERVICE_MODE: 'hosted_alpha',
    AE_CANONICAL_BASE_URL: 'https://alpha.example.com',
    CONVEX_URL: 'https://alpha.convex.cloud',
    AE_CONVEX_SERVER_FUNCTION_TOKEN: 'server-token',
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_example',
    CLERK_SECRET_KEY: 'sk_live_example',
    CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.example.com',
    CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_example',
    OPENROUTER_API_KEY: 'model-key',
    AE_LLM_MODEL: 'example/model',
    AE_CHAT_PROXY_SECRET: 'chat-secret',
    AE_SOURCE_WRITE_KEY_BILLING: 'billing-key',
    AE_SOURCE_WRITE_KEY_PROTECTED: 'protected-key',
    AE_SOURCE_WRITE_KEY_CATALOG: 'catalog-key',
    AE_SOURCE_WRITE_KEY_OPERATOR: 'operator-key',
    AE_SOURCE_WRITE_KEY_REPAIR: 'repair-key',
    AE_SOURCE_WRITE_KEY_SESSION: 'session-key',
    STRIPE_SECRET_KEY: 'rk_test_example',
    STRIPE_READBACK_KEY: 'rk_test_readback',
    STRIPE_WEBHOOK_SECRET: 'whsec_example',
    STRIPE_V2_WEBHOOK_SECRET: 'whsec_v2_example',
    STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID: 'txr_example',
    AE_FORMANCE_ENVIRONMENT: 'sandbox',
    AE_FORMANCE_GATEWAY_URL: 'https://formance-alpha.example.com',
    AE_FORMANCE_LEDGER: 'alpha',
    AE_FORMANCE_REQUEST_TIMEOUT_MS: '10000',
    AE_FORMANCE_ACCESS_CLIENT_ID: 'access-client',
    AE_FORMANCE_ACCESS_CLIENT_SECRET: 'access-secret',
    AE_X402_CUSTODY_ENABLED: 'false',
    AE_PACKAGE5_WRITES_ENABLED: 'false',
    AE_SUPPLY_HTTP_CREDENTIALS_ENABLED: 'false',
    AE_SUPPLY_MCP_OAUTH_ENABLED: 'false',
    AE_PROVIDER_OFFBOARDING_ENABLED: 'false',
    AE_INFISICAL_BASE_URL: 'https://app.infisical.com',
    AE_INFISICAL_CUSTOMER_PROJECT_ID: 'customer-project',
    AE_INFISICAL_CUSTOMER_ENVIRONMENT: 'alpha',
    AE_INFISICAL_CUSTOMER_SECRET_PATH: '/customer',
    AE_INFISICAL_CUSTOMER_MACHINE_IDENTITY_ID: 'customer-identity',
    AE_INFISICAL_PLATFORM_PROJECT_ID: 'platform-project',
    AE_INFISICAL_PLATFORM_ENVIRONMENT: 'alpha',
    AE_INFISICAL_PLATFORM_SECRET_PATH: '/platform',
    AE_INFISICAL_PLATFORM_MACHINE_IDENTITY_ID: 'platform-identity',
  }
}

describe('boot environment validator', () => {
  it('accepts disabled hosted alpha without custody credentials', () => {
    expect(validateEnvironment(disabledHostedAlphaEnvironment(), 'production')).toEqual({ ok: true })
  })

  it.each([
    { AE_SERVICE_MODE: undefined },
    { AE_X402_CUSTODY_ENABLED: 'true' },
  ])('requires custody credentials for ordinary production or enabled alpha: %j', (override) => {
    const result = validateEnvironment({ ...disabledHostedAlphaEnvironment(), ...override }, 'production')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'CDP_API_KEY_ID', 'CDP_API_KEY_SECRET', 'CDP_WALLET_SECRET',
      'AE_X402_CDP_ACCOUNT_NAME', 'AE_X402_RPC_URLS_JSON',
    ]))
  })

  it.each([
    ['AE_X402_CUSTODY_ENABLED', undefined],
    ['AE_X402_CUSTODY_ENABLED', 'invalid'],
    ['AE_PACKAGE5_WRITES_ENABLED', undefined],
    ['AE_SUPPLY_HTTP_CREDENTIALS_ENABLED', 'invalid'],
    ['AE_INFISICAL_CUSTOMER_PROJECT_ID', undefined],
    ['AE_SOURCE_WRITE_KEY_BILLING', undefined],
    ['AE_CANONICAL_BASE_URL', 'invalid-url'],
    ['AE_DEV_WBA_SMOKE_ENABLED', 'true'],
  ] as const)('preserves boot validation for %s', (name, value) => {
    const result = validateEnvironment({ ...disabledHostedAlphaEnvironment(), [name]: value }, 'production')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems).toContainEqual(expect.objectContaining({ name }))
  })
})
