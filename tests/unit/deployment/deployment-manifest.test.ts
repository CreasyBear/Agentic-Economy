import { describe, expect, it } from 'vitest'

import convexCrons from '../../../convex/crons'
import {
  DEPLOYMENT_MANIFEST,
  SOURCE_WRITE_FAMILIES,
  validateDeploymentManifest,
  type DeploymentEnvironmentInput,
} from '../../../src/lib/deployment/manifest'

function productionEnvironment(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    AE_DEPLOYMENT_ENVIRONMENT: 'production',
    AE_CANONICAL_BASE_URL: 'https://app.example.com',
    AE_CANONICAL_HOST_ALLOWLIST: 'app.example.com',
    CONVEX_URL: 'https://example.convex.cloud',
    AE_CONVEX_SERVER_FUNCTION_TOKEN: 'convex-server-function-token-long-enough',
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_example',
    CLERK_SECRET_KEY: 'sk_live_example',
    CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_d2ViaG9vay1zaWduaW5nLXNlY3JldA==',
    CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.example.com',
    OPENROUTER_API_KEY: 'openrouter-secret-value',
    AE_CHAT_PROXY_SECRET: 'chat-proxy-secret-value-long-enough',
    CDP_API_KEY_ID: 'cdp-key-id',
    CDP_API_KEY_SECRET: 'cdp-key-secret',
    CDP_WALLET_SECRET: 'cdp-wallet-secret',
    AE_X402_CDP_ACCOUNT_NAME: 'agentic-economy-x402',
    AE_X402_CDP_EXPECTED_EVM_ADDRESS: '0x0000000000000000000000000000000000000001',
    AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-4111-8111-111111111111',
    AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-4222-8222-222222222222',
    AE_X402_CDP_POLICY_RULES_DIGEST: `sha256:${'a'.repeat(64)}`,
    AE_X402_CDP_CREDENTIAL_GENERATION: '7',
    AE_X402_CUSTODY_ENABLED: 'true',
    AE_X402_CUSTODY_MAX_ATOMIC: '100000000',
    AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '100000000',
    AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC: '100000000',
    AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC: '100000000',
    AE_X402_RPC_URLS_JSON: '{"eip155:8453":["https://base.example/rpc","https://second-base.example/rpc"]}',
    SENTRY_DSN: 'https://publickey@o123.ingest.sentry.io/123',
    VITE_SENTRY_DSN: 'https://browserkey@o123.ingest.sentry.io/123',
    SENTRY_ENVIRONMENT: 'production',
    VITE_SENTRY_ENVIRONMENT: 'production',
    STRIPE_SECRET_KEY: 'rk_live_command_example',
    STRIPE_READBACK_KEY: 'rk_live_readback_example',
    STRIPE_WEBHOOK_SECRET: 'whsec_live_example',
    STRIPE_V2_WEBHOOK_SECRET: 'whsec_v2_live_example',
    STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID: 'txr_au_gst_10_inclusive',
    AE_FORMANCE_ENVIRONMENT: 'production',
    AE_FORMANCE_GATEWAY_URL: 'https://formance.example.com',
    AE_FORMANCE_LEDGER: 'agentic-economy-production',
    AE_FORMANCE_REQUEST_TIMEOUT_MS: '10000',
    AE_FORMANCE_ACCESS_CLIENT_ID: 'access-client-id',
    AE_FORMANCE_ACCESS_CLIENT_SECRET: 'access-client-secret',
    AE_PACKAGE5_WRITES_ENABLED: 'true',
    AE_SUPPLY_HTTP_CREDENTIALS_ENABLED: 'true',
    AE_SUPPLY_MCP_OAUTH_ENABLED: 'true',
    AE_PROVIDER_OFFBOARDING_ENABLED: 'true',
    AE_INFISICAL_BASE_URL: 'https://app.infisical.com',
    AE_INFISICAL_CUSTOMER_PROJECT_ID: 'project-customer',
    AE_INFISICAL_CUSTOMER_ENVIRONMENT: 'production',
    AE_INFISICAL_CUSTOMER_SECRET_PATH: '/agentic-economy/customer',
    AE_INFISICAL_CUSTOMER_MACHINE_IDENTITY_ID: 'identity-customer',
    AE_INFISICAL_PLATFORM_PROJECT_ID: 'project-platform',
    AE_INFISICAL_PLATFORM_ENVIRONMENT: 'production',
    AE_INFISICAL_PLATFORM_SECRET_PATH: '/agentic-economy/platform',
    AE_INFISICAL_PLATFORM_MACHINE_IDENTITY_ID: 'identity-platform',
    AE_LLM_MODEL: 'deepseek/deepseek-v4-flash',
    ...Object.fromEntries(SOURCE_WRITE_FAMILIES.map((family) => [
      `AE_SOURCE_WRITE_KEY_${family.toUpperCase()}`,
      `${family}-key:source-write-secret-${family}-long-enough`,
    ])),
  }
}

describe('deployment manifest validator', () => {
  it('validates and fingerprints an explicit recovery lineage without changing the active backend', () => {
    const environment = productionEnvironment()
    const inherited = validateDeploymentManifest({ ...environment,
      VITE_AE_ADMIN_RECOVERY_DEPLOYMENT_URL: 'https://original.convex.cloud' })
    expect(inherited.findings).toEqual([])
    expect(inherited.fingerprint).not.toBe(validateDeploymentManifest(environment).fingerprint)
    expect(validateDeploymentManifest({ ...environment,
      VITE_AE_ADMIN_RECOVERY_DEPLOYMENT_URL: 'javascript:alert(1)' }).ok).toBe(false)
    expect(validateDeploymentManifest({ ...environment,
      VITE_AE_ADMIN_RECOVERY_DEPLOYMENT_URL: 'https://original.convex.cloud/another-scope' }).ok).toBe(false)
  })

  it('includes the regional Convex site binding in deployment evidence', () => {
    const environment = {
      ...productionEnvironment(),
      CONVEX_URL: 'https://upbeat-cricket-954.ap-southeast-2.convex.cloud',
      VITE_CONVEX_URL: 'https://upbeat-cricket-954.ap-southeast-2.convex.cloud',
    }
    const withoutSite = validateDeploymentManifest(environment)
    const current = validateDeploymentManifest({ ...environment,
      CONVEX_SITE_URL: 'https://upbeat-cricket-954.ap-southeast-2.convex.site' })
    const stale = validateDeploymentManifest({ ...environment,
      CONVEX_SITE_URL: 'https://cautious-zebra-473.convex.site' })

    expect(current.findings).toEqual([])
    expect(DEPLOYMENT_MANIFEST.configuration.optional).toContain('CONVEX_SITE_URL')
    expect(current.fingerprint).not.toBe(withoutSite.fingerprint)
    expect(current.fingerprint).not.toBe(stale.fingerprint)
  })

  it.each(['not-a-url', 'javascript:alert(1)', 'http://example.convex.site',
    'https://secret@example.convex.site', 'https://example.convex.site?other=deployment'])('rejects a malformed production Convex site URL %s', CONVEX_SITE_URL => {
    const result = validateDeploymentManifest({ ...productionEnvironment(), CONVEX_SITE_URL })

    expect(result.ok).toBe(false)
    expect(result.findings).toContainEqual({ kind: 'malformed', code: 'convex_site_url_invalid',
      names: ['CONVEX_SITE_URL'], scope: 'configuration' })
  })

  it('declares the exact optional alpha screening policy and rejects unknown modes', () => {
    expect(validateDeploymentManifest({ ...productionEnvironment(), AE_X402_PAYEE_SCREENING_POLICY: 'alpha_not_screened_v1' }).ok).toBe(true)
    expect(DEPLOYMENT_MANIFEST.configuration.optional).toContain('AE_X402_PAYEE_SCREENING_POLICY')
    const invalid = validateDeploymentManifest({ ...productionEnvironment(), AE_X402_PAYEE_SCREENING_POLICY: 'unknown' })
    expect(invalid.findings).toContainEqual({ kind: 'malformed', code: 'x402_payee_screening_policy_invalid',
      names: ['AE_X402_PAYEE_SCREENING_POLICY'], scope: 'x402-payment' })
  })
  it.each([undefined, 'true', 'false'])('accepts the optional discovery rollback setting %s', value => {
    expect(validateDeploymentManifest({ ...productionEnvironment(), AE_JEV_DISCOVERY_ENABLED: value }).ok).toBe(true)
    expect(DEPLOYMENT_MANIFEST.configuration.optional).toContain('AE_JEV_DISCOVERY_ENABLED')
  })

  it.each(['', ' ', 'FALSE', '0', 'false ', 'unknown'])('rejects ambiguous discovery rollback setting %j', value => {
    const result = validateDeploymentManifest({ ...productionEnvironment(), AE_JEV_DISCOVERY_ENABLED: value })
    expect(result.ok).toBe(false)
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'ae_jev_discovery_enabled_invalid' }))
  })

  it('admits a complete production configuration and declares only real resources/probes', () => {
    const result = validateDeploymentManifest(productionEnvironment(), { nodeMajor: 22 })

    expect(result.ok).toBe(true)
    expect(result.findings).toEqual([])
    expect(result.resources.map((resource) => resource.id)).toEqual([
      'web-server',
      'convex-components',
      'agent-access',
      'formance-financial-authority',
      'durable-invocation-workpool',
      'durable-stripe-webhook-inbox',
      'provider-tools-rollout',
      'operation-gateway',
      'convex-scheduled-jobs',
    ])
    const components = result.resources.find((resource) => resource.id === 'convex-components')
    expect((components as { components: readonly string[] }).components).toEqual([
      'workpool',
      'workpool:stripeWebhookWorkpool',
      'workpool:notificationWorkpool',
      'workflow',
      'rate-limiter',
      'agent',
      'migrations',
      'aggregate:marketEvidence',
      'aggregate:marketOperationEvidence',
      'aggregate:marketToolRatings',
      'aggregate:marketActiveTools',
      'aggregate:marketActiveProviders',
      'aggregate:marketDirectoryFacets',
    ])
    const stripeInbox = result.resources.find((resource) => resource.id === 'durable-stripe-webhook-inbox')
    expect((stripeInbox as { workerEnvironment: readonly string[] }).workerEnvironment).toEqual([
      'STRIPE_READBACK_KEY',
      'STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID',
    ])
    expect(result.readinessProbes.map((probe) => probe.path)).toEqual(['/api/health', '/api/ready', '/api/v1/release'])
  })

  it('keeps the scheduled-job manifest inventory aligned with Convex cron registrations', () => {
    const scheduledJobs = DEPLOYMENT_MANIFEST.resources.find((resource) => resource.id === 'convex-scheduled-jobs')
    expect(scheduledJobs).toBeDefined()
    const registeredJobNames = Object.keys(convexCrons.crons).sort()
    const manifestJobNames = [...(scheduledJobs as { jobs: readonly string[] }).jobs].sort()

    expect(manifestJobNames).toEqual(registeredJobNames)
  })

  it('fails closed for missing shared source, identity, canonical, and source-write configuration', () => {
    const result = validateDeploymentManifest({ NODE_ENV: 'production', AE_DEPLOYMENT_ENVIRONMENT: 'production' }, { nodeMajor: 22 })
    const names = result.findings.flatMap((finding) => finding.names)

    expect(result.ok).toBe(false)
    expect(names).toEqual(expect.arrayContaining([
      'CONVEX_URL',
      'VITE_CONVEX_URL',
      'AE_CONVEX_SERVER_FUNCTION_TOKEN',
      'VITE_CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'CLERK_WEBHOOK_SIGNING_SECRET',
      'CLERK_JWT_ISSUER_DOMAIN',
      'AE_CANONICAL_BASE_URL',
      'AE_SOURCE_WRITE_KEY_BILLING',
      'AE_SOURCE_WRITE_KEY_SESSION',
      'AE_PACKAGE5_WRITES_ENABLED',
      'AE_SUPPLY_HTTP_CREDENTIALS_ENABLED',
      'AE_SUPPLY_MCP_OAUTH_ENABLED',
      'AE_PROVIDER_OFFBOARDING_ENABLED',
      'AE_INFISICAL_BASE_URL',
      'AE_INFISICAL_CUSTOMER_PROJECT_ID',
      'AE_INFISICAL_CUSTOMER_ENVIRONMENT',
      'AE_INFISICAL_CUSTOMER_SECRET_PATH',
      'AE_INFISICAL_CUSTOMER_MACHINE_IDENTITY_ID',
      'AE_INFISICAL_PLATFORM_PROJECT_ID',
      'AE_INFISICAL_PLATFORM_ENVIRONMENT',
      'AE_INFISICAL_PLATFORM_SECRET_PATH',
      'AE_INFISICAL_PLATFORM_MACHINE_IDENTITY_ID',
    ]))
  })

  it.each([
    'AE_PACKAGE5_WRITES_ENABLED',
    'AE_SUPPLY_HTTP_CREDENTIALS_ENABLED',
    'AE_SUPPLY_MCP_OAUTH_ENABLED',
    'AE_PROVIDER_OFFBOARDING_ENABLED',
  ])('accepts an explicit disabled rollout while still requiring a valid decision for %s', name => {
    expect(validateDeploymentManifest({ ...productionEnvironment(), [name]: 'false' }, { nodeMajor: 22 }).ok).toBe(true)
    for (const value of [undefined, '', 'FALSE', '0', 'enabled']) {
      const result = validateDeploymentManifest({ ...productionEnvironment(), [name]: value }, { nodeMajor: 22 })
      expect(result.ok).toBe(false)
      expect(result.findings).toContainEqual(expect.objectContaining({ names: [name] }))
    }
  })

  it('admits independent Provider rollouts without enabling unused features', () => {
    expect(validateDeploymentManifest({
      ...productionEnvironment(),
      AE_SUPPLY_HTTP_CREDENTIALS_ENABLED: 'false',
      AE_SUPPLY_MCP_OAUTH_ENABLED: 'false',
      AE_PROVIDER_OFFBOARDING_ENABLED: 'false',
    }, { nodeMajor: 22 }).ok).toBe(true)
  })

  it('requires both Infisical scopes before live Provider Invocation can be enabled', () => {
    for (const name of [
      'AE_INFISICAL_CUSTOMER_PROJECT_ID',
      'AE_INFISICAL_CUSTOMER_ENVIRONMENT',
      'AE_INFISICAL_CUSTOMER_SECRET_PATH',
      'AE_INFISICAL_CUSTOMER_MACHINE_IDENTITY_ID',
      'AE_INFISICAL_PLATFORM_PROJECT_ID',
      'AE_INFISICAL_PLATFORM_ENVIRONMENT',
      'AE_INFISICAL_PLATFORM_SECRET_PATH',
      'AE_INFISICAL_PLATFORM_MACHINE_IDENTITY_ID',
    ]) {
      const result = validateDeploymentManifest({
        ...productionEnvironment(),
        [name]: '',
      }, { nodeMajor: 22 })

      expect(result.findings).toContainEqual({
        kind: 'missing',
        code: 'provider_secret_plane_required',
        names: [name],
        scope: 'provider-secret-plane',
      })
    }
  })

  it('reuses canonical source-write authority validation', () => {
    const result = validateDeploymentManifest({
      ...productionEnvironment(),
      AE_SOURCE_WRITE_KEY_SESSION: 'not-rotation-addressable',
    }, { nodeMajor: 22 })

    expect(result.findings).toContainEqual({
      kind: 'malformed',
      code: 'source_write_authority_invalid',
      names: ['AE_SOURCE_WRITE_KEY_SESSION'],
      scope: 'source-write',
    })
  })

  it('rejects test Clerk credentials in production', () => {
    const result = validateDeploymentManifest({
      ...productionEnvironment(),
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_example',
      CLERK_SECRET_KEY: 'sk_test_example',
    }, { nodeMajor: 22 })

    expect(result.ok).toBe(false)
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'malformed', code: 'clerk_publishable_key_invalid', names: ['VITE_CLERK_PUBLISHABLE_KEY'] }),
      expect.objectContaining({ kind: 'malformed', code: 'clerk_secret_key_invalid', names: ['CLERK_SECRET_KEY'] }),
    ]))
  })

  it.each(['whsec_+/8=', 'whsec_+w==', 'whsec_+/v7'])(
    'accepts the standard Base64 alphabet and padding in a Clerk webhook secret: %s', secret => {
      expect(validateDeploymentManifest({ ...productionEnvironment(), CLERK_WEBHOOK_SIGNING_SECRET: secret }).ok).toBe(true)
    },
  )

  it.each(['whsec_', 'whsec_live_example', 'whsec_abc', 'whsec_abc==', 'whsec_ab=c', 'whsec_abcd====', 'whsec_ab cd', 'other_abcd'])(
    'rejects malformed Clerk webhook secret encoding: %s', secret => {
      const result = validateDeploymentManifest({ ...productionEnvironment(), CLERK_WEBHOOK_SIGNING_SECRET: secret })
      expect(result.ok).toBe(false)
      expect(result.findings).toContainEqual({
        kind: 'malformed', code: 'clerk_webhook_signing_secret_invalid', names: ['CLERK_WEBHOOK_SIGNING_SECRET'], scope: 'clerk',
      })
      expect(JSON.stringify(result)).not.toContain(secret)
    },
  )

  it('requires a canonical origin and a valid Clerk webhook signing secret', () => {
    const result = validateDeploymentManifest({
      ...productionEnvironment(),
      AE_CANONICAL_BASE_URL: '',
      CLERK_WEBHOOK_SIGNING_SECRET: 'not-a-webhook-secret',
    }, { nodeMajor: 22 })

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'missing', code: 'canonical_origin_required', names: ['AE_CANONICAL_BASE_URL'] }),
      expect.objectContaining({ kind: 'malformed', code: 'clerk_webhook_signing_secret_invalid', names: ['CLERK_WEBHOOK_SIGNING_SECRET'] }),
    ]))
  })

  it('rejects test or malformed Stripe credentials in production', () => {
    const result = validateDeploymentManifest({
      ...productionEnvironment(),
      STRIPE_SECRET_KEY: 'sk_live_example',
      STRIPE_READBACK_KEY: 'sk_live_readback_example',
      STRIPE_WEBHOOK_SECRET: 'not-a-webhook-secret',
      STRIPE_V2_WEBHOOK_SECRET: 'not-a-v2-webhook-secret',
      STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID: 'not-a-tax-rate',
    }, { nodeMajor: 22 })

    expect(result.ok).toBe(false)
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'malformed', code: 'stripe_secret_key_invalid', names: ['STRIPE_SECRET_KEY'] }),
      expect.objectContaining({ kind: 'malformed', code: 'stripe_readback_key_invalid', names: ['STRIPE_READBACK_KEY'] }),
      expect.objectContaining({ kind: 'malformed', code: 'stripe_webhook_secret_invalid', names: ['STRIPE_WEBHOOK_SECRET'] }),
      expect.objectContaining({ kind: 'malformed', code: 'stripe_v2_webhook_secret_invalid', names: ['STRIPE_V2_WEBHOOK_SECRET'] }),
      expect.objectContaining({ kind: 'malformed', code: 'stripe_tax_rate_invalid', names: ['STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID'] }),
    ]))
  })

  it.each(['production', 'preview', 'development', 'test'] as const)(
    'requires an explicit payment declaration in %s hosting', (hosting) => {
      const result = validateDeploymentManifest({ NODE_ENV: hosting }, { environment: hosting })
      expect(result.findings).toContainEqual({
        kind: 'missing', code: 'deployment_environment_invalid',
        names: ['AE_DEPLOYMENT_ENVIRONMENT'], scope: 'environment',
      })
    },
  )

  it.each(['', ' production ', 'Production', 'sandbox', 'preview'])(
    'rejects malformed payment declaration %j', (declaration) => {
      const result = validateDeploymentManifest({
        NODE_ENV: 'development', AE_DEPLOYMENT_ENVIRONMENT: declaration,
      }, { environment: 'development' })
      expect(result.findings).toContainEqual(expect.objectContaining({
        kind: declaration === '' ? 'missing' : 'malformed',
        code: 'deployment_environment_invalid', names: ['AE_DEPLOYMENT_ENVIRONMENT'],
      }))
    },
  )

  it('accepts preview hosting with development money and no production identity secrets', () => {
    const result = validateDeploymentManifest({
      NODE_ENV: 'production',
      AE_DEPLOYMENT_ENVIRONMENT: 'development',
      AE_FORMANCE_ENVIRONMENT: 'sandbox',
    }, { environment: 'preview', nodeMajor: 22 })
    expect(result).toMatchObject({ ok: true, environment: 'preview', findings: [] })
  })

  it('rejects supplied money rails that conflict with the explicit declaration', () => {
    const sandbox = validateDeploymentManifest({
      NODE_ENV: 'production',
      AE_DEPLOYMENT_ENVIRONMENT: 'development',
      STRIPE_SECRET_KEY: 'rk_live_wrong',
      STRIPE_READBACK_KEY: 'sk_test_unrestricted',
      AE_FORMANCE_ENVIRONMENT: 'production',
    }, { environment: 'preview' })
    expect(sandbox.findings.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'stripe_secret_key_invalid', 'stripe_readback_key_invalid', 'formance_environment_mismatch',
    ]))

    const production = validateDeploymentManifest({
      ...productionEnvironment(),
      STRIPE_SECRET_KEY: 'rk_test_wrong',
      AE_FORMANCE_ENVIRONMENT: 'sandbox',
    })
    expect(production.findings.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'stripe_secret_key_invalid', 'formance_environment_mismatch',
    ]))
  })

  it.each(['development', 'production'] as const)(
    'requires a Formance environment declaration for %s money', declaration => {
      const result = validateDeploymentManifest({
        ...productionEnvironment(), AE_DEPLOYMENT_ENVIRONMENT: declaration, AE_FORMANCE_ENVIRONMENT: undefined,
      }, { environment: 'preview' })
      expect(result.findings).toContainEqual({
        kind: 'missing', code: 'formance_environment_required', names: ['AE_FORMANCE_ENVIRONMENT'], scope: 'formance',
      })
    },
  )

  it.each([' production ', 'PRODUCTION', 'development'])(
    'refuses malformed Formance environment %j without normalization', formanceEnvironment => {
      const result = validateDeploymentManifest({ ...productionEnvironment(), AE_FORMANCE_ENVIRONMENT: formanceEnvironment })
      expect(result.findings).toContainEqual({
        kind: 'conflict', code: 'formance_environment_mismatch', names: ['AE_FORMANCE_ENVIRONMENT'], scope: 'formance',
      })
    },
  )

  it('allows a local Formance gateway only for a development payment declaration', () => {
    const gateway = 'http://localhost:3068'
    const development = validateDeploymentManifest({
      NODE_ENV: 'development',
      AE_DEPLOYMENT_ENVIRONMENT: 'development',
      AE_FORMANCE_GATEWAY_URL: gateway,
    })
    expect(development.findings.filter(({ code }) => code === 'formance_gateway_invalid')).toEqual([])

    const production = validateDeploymentManifest({
      ...productionEnvironment(),
      AE_FORMANCE_GATEWAY_URL: gateway,
    })
    expect(production.findings).toContainEqual(expect.objectContaining({
      kind: 'malformed', code: 'formance_gateway_invalid', names: ['AE_FORMANCE_GATEWAY_URL'],
    }))
  })

  it('accepts an absent Stripe rail for a declared production promotional-credit deployment', () => {
    const result = validateDeploymentManifest({
      ...productionEnvironment(),
      STRIPE_SECRET_KEY: undefined,
      STRIPE_READBACK_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: undefined,
      STRIPE_V2_WEBHOOK_SECRET: undefined,
      STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID: undefined,
    })
    expect(result.findings.filter(({ scope }) => scope === 'stripe-money')).toEqual([])
  })

  it('does not allow production CSP enforcement to be downgraded', () => {
    const reportOnly = validateDeploymentManifest({
      ...productionEnvironment(),
      AE_CSP_REPORT_ONLY: 'true',
    }, { nodeMajor: 22 })

    expect(reportOnly.findings).toContainEqual({
      kind: 'forbidden',
      code: 'production_csp_must_enforce',
      names: ['AE_CSP_REPORT_ONLY'],
      scope: 'browser-security',
    })
    expect(validateDeploymentManifest({
      ...productionEnvironment(),
      AE_CSP_REPORT_ONLY: 'false',
    }, { nodeMajor: 22 }).findings).toEqual([])
  })

  it('rejects unenumerated AE-owned credential and bypass keys', () => {
    const result = validateDeploymentManifest({
      ...productionEnvironment(),
      AE_CUSTOMER_REQUEST_TOKEN: 'unexpected',
      AE_DIRECT_AUTH_BYPASS: 'true',
      VITE_AE_TEST_SECRET: 'unexpected',
    }, { nodeMajor: 22 })

    expect(result.findings.filter((finding) => finding.kind === 'unknown').flatMap((finding) => finding.names))
      .toEqual(expect.arrayContaining(['AE_CUSTOMER_REQUEST_TOKEN', 'AE_DIRECT_AUTH_BYPASS', 'VITE_AE_TEST_SECRET']))
  })

  it('admits the configured secret lifecycle RPC token without exposing its value', () => {
    const environment = {
      ...productionEnvironment(),
      AE_SECRET_LIFECYCLE_RPC_TOKEN: 'secret-lifecycle-token-one',
    }
    const result = validateDeploymentManifest(environment, { nodeMajor: 22 })
    const rotated = validateDeploymentManifest({
      ...environment,
      AE_SECRET_LIFECYCLE_RPC_TOKEN: 'secret-lifecycle-token-two',
    }, { nodeMajor: 22 })

    expect(result.findings).toEqual([])
    expect(result.fingerprint).toBe(rotated.fingerprint)
    expect(JSON.stringify(result)).not.toContain(environment.AE_SECRET_LIFECYCLE_RPC_TOKEN)
  })

  it('rejects malformed canonical URLs and host allowlists', () => {
    const result = validateDeploymentManifest({
      ...productionEnvironment(),
      AE_CANONICAL_BASE_URL: 'not-a-url',
      AE_CANONICAL_HOST_ALLOWLIST: 'https://app.example.com/path, bad host',
    }, { nodeMajor: 22 })

    expect(result.ok).toBe(false)
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'url_configuration_invalid',
      'canonical_host_allowlist_invalid',
    ]))
  })

  it('requires chat sharing configuration as an all-or-none pair', () => {
    const partial = validateDeploymentManifest({
      ...productionEnvironment(),
      AE_CHAT_SHARE_KEY_ID: 'chat-share-v1',
    }, { nodeMajor: 22 })

    expect(partial.findings).toContainEqual({
      kind: 'missing',
      code: 'secret_key_id_without_secret',
      names: ['AE_CHAT_SHARE_SECRET'],
      scope: 'security:chat-share',
    })

    const complete = validateDeploymentManifest({
      ...productionEnvironment(),
      AE_CHAT_SHARE_SECRET: 'chat-share-secret-value-long-enough',
      AE_CHAT_SHARE_KEY_ID: 'chat-share-v1',
    }, { nodeMajor: 22 })
    expect(complete.findings.filter(({ scope }) => scope === 'security:chat-share')).toEqual([])
    expect(complete.findings.filter(({ kind }) => kind === 'unknown')).toEqual([])
    expect(JSON.stringify(complete)).not.toContain('chat-share-secret-value')
  })

  it('treats retired answer, model-catalogue, and eval configuration as unknown', () => {
    const retiredNames = [
      'AE_ANSWER_EVAL_REGISTRY_SEED',
      'AE_ANSWER_EVAL_PASSED',
      'AE_LLM_MODELS',
      'VITE_AE_ANSWER_MODE',
      'AE_ANSWER_THREAD_SHARE_SECRET',
      'AE_ANSWER_THREAD_SHARE_KEY_ID',
      'AE_BRAINTRUST_PROJECT',
      'AE_BRAINTRUST_DATASET',
    ]
    const result = validateDeploymentManifest({
      NODE_ENV: 'development',
      ...Object.fromEntries(retiredNames.map((name) => [name, 'retired'])),
    }, { nodeMajor: 22 })

    expect(result.findings.filter(({ kind }) => kind === 'unknown').flatMap(({ names }) => names))
      .toEqual(expect.arrayContaining(retiredNames))
  })

  it('requires CDP custody, forbids raw production keys, and redacts custody secrets', () => {
    const missing = validateDeploymentManifest({
      ...productionEnvironment(),
      CDP_API_KEY_ID: '',
      CDP_API_KEY_SECRET: '',
      CDP_WALLET_SECRET: '',
      AE_X402_CDP_ACCOUNT_NAME: '',
      AE_X402_CDP_EXPECTED_EVM_ADDRESS: '',
      AE_X402_CDP_ACCOUNT_POLICY_ID: '',
      AE_X402_CDP_PROJECT_POLICY_ID: '',
      AE_X402_CDP_POLICY_RULES_DIGEST: '',
      AE_X402_CDP_CREDENTIAL_GENERATION: '',
      AE_X402_CUSTODY_ENABLED: '',
      AE_X402_CUSTODY_MAX_ATOMIC: '',
      AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '',
      AE_X402_RPC_URLS_JSON: '',
    }, { nodeMajor: 22 })
    expect(missing.findings.some((finding) => finding.scope === 'x402-payment' && finding.kind === 'missing')).toBe(true)

    const forbidden = validateDeploymentManifest({
      ...productionEnvironment(),
      AE_X402_PAYMENT_CREDENTIAL_REF: 'env:AE_X402_PAYMENT_PRIVATE_KEY',
      AE_X402_PAYMENT_PRIVATE_KEY: 'raw-private-key',
    }, { nodeMajor: 22 })
    expect(forbidden.findings.filter((finding) => finding.kind === 'forbidden').flatMap((finding) => finding.names))
      .toEqual(expect.arrayContaining(['AE_X402_PAYMENT_CREDENTIAL_REF', 'AE_X402_PAYMENT_PRIVATE_KEY']))
    expect(JSON.stringify(forbidden)).not.toContain('raw-private-key')
    const malformedCustody = validateDeploymentManifest({
      ...productionEnvironment(),
      AE_X402_CUSTODY_ENABLED: 'false',
      AE_X402_CUSTODY_MAX_ATOMIC: '0',
    }, { nodeMajor: 22 })
    expect(malformedCustody.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'x402_custody_not_enabled',
      'x402_custody_cap_invalid',
    ]))
    const malformedRpc = validateDeploymentManifest({
      ...productionEnvironment(),
      AE_X402_RPC_URLS_JSON: '{"eip155:8453":["http://localhost:8545"]}',
    }, { nodeMajor: 22 })
    expect(malformedRpc.findings).toContainEqual(expect.objectContaining({
      kind: 'malformed',
      code: 'x402_rpc_urls_invalid',
      names: ['AE_X402_RPC_URLS_JSON'],
    }))
    expect(JSON.stringify(malformedRpc)).not.toContain('base.example')
  })


  it('requires the whole production live-gateway fixture when spend is confirmed', () => {
    const partial = validateDeploymentManifest({
      ...productionEnvironment(),
      AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND: 'true',
    }, { nodeMajor: 22 })
    const missingLiveGatewayNames = partial.findings
      .filter(({ code }) => code === 'live_gateway_smoke_configuration_incomplete')
      .flatMap(({ names }) => names)
    expect(missingLiveGatewayNames).toEqual(expect.arrayContaining([
      'AE_GATEWAY_SMOKE_RUN_ID',
      'AE_GATEWAY_SMOKE_API_KEY',
      'AE_GATEWAY_SMOKE_RELEASE_API_KEY',
      'AE_RELEASE_CONVEX_URL',
      'AE_GATEWAY_SMOKE_OWNER_OPENAPI_DOCUMENT_JSON',
      'AE_GATEWAY_SMOKE_OWNER_OPENAPI_PATH',
      'AE_GATEWAY_SMOKE_OWNER_OPENAPI_METHOD',
    ]))

    const group = DEPLOYMENT_MANIFEST.configuration.conditional.find(({ scope }) => scope === 'release:live-gateway-smoke')
    expect(group).toBeDefined()
    const liveGatewayEnvironment = Object.fromEntries(group!.names.map((name) => [
      name,
      name === 'AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND'
        ? 'true'
        : name.endsWith('_URL') || name === 'AE_GATEWAY_SMOKE_BASE_URL'
          ? 'https://example.com'
          : name === 'CLERK_SECRET_KEY'
            ? 'sk_live_example'
            : 'configured',
    ]))
    const complete = validateDeploymentManifest({
      ...productionEnvironment(),
      ...liveGatewayEnvironment,
    }, { nodeMajor: 22 })
    expect(complete.findings.filter(({ scope }) => scope === 'release:live-gateway-smoke')).toEqual([])
    expect(complete.findings.filter(({ kind }) => kind === 'unknown')).toEqual([])
  })
  it('retires the parallel gateway Convex URL alias', () => {
    const alias = 'AE_GATEWAY_SMOKE_CONVEX_URL'
    const result = validateDeploymentManifest({
      ...productionEnvironment(),
      [alias]: 'https://parallel.example.convex.cloud',
    }, { nodeMajor: 22 })

    expect(result.findings).toContainEqual(expect.objectContaining({
      kind: 'unknown',
      names: [alias],
    }))
    expect(DEPLOYMENT_MANIFEST.configuration.conditional
      .find(({ scope }) => scope === 'release:live-gateway-smoke')
      ?.names).not.toContain(alias)
  })

  it('returns no secret values and fingerprints shape rather than secret material', () => {
    const first = productionEnvironment()
    const rotated = {
      ...first,
      OPENROUTER_API_KEY: 'rotated-openrouter-secret',
      AE_CHAT_PROXY_SECRET: 'rotated-chat-proxy-secret-long-enough',
    }
    const result = validateDeploymentManifest(first, { nodeMajor: 22 })
    const rotatedResult = validateDeploymentManifest(rotated, { nodeMajor: 22 })

    expect(JSON.stringify(result)).not.toContain('openrouter-secret-value')
    expect(JSON.stringify(result)).not.toContain('chat-proxy-secret-value')
    expect(JSON.stringify(result)).not.toContain('source-write-secret')
    expect(rotatedResult.fingerprint).toBe(result.fingerprint)

  })

  it('keeps non-production source-write root derivation available without accepting it in production', () => {
    const development: DeploymentEnvironmentInput = {
      NODE_ENV: 'development',
      AE_DEPLOYMENT_ENVIRONMENT: 'development',
      AE_FORMANCE_ENVIRONMENT: 'sandbox',
      AE_SOURCE_WRITE_SECRET: 'development-source-write-secret-that-is-long-enough',
    }
    expect(validateDeploymentManifest(development, { environment: 'development', nodeMajor: 22 }).findings).toEqual([])
    expect(validateDeploymentManifest({
      ...productionEnvironment(),
      AE_SOURCE_WRITE_SECRET: 'development-source-write-secret-that-is-long-enough',
    }, { nodeMajor: 22 }).findings.some((finding) => finding.kind === 'forbidden')).toBe(true)
  })

  it('keeps the manifest schema version stable for import consumers', () => {
    expect(DEPLOYMENT_MANIFEST.schemaVersion).toBe('ae.deployment-manifest:v1')
    expect(DEPLOYMENT_MANIFEST.runtime.nodeMajor).toBe(22)
  })

  it('requires every live group under an explicit production declaration, independently of hosting', () => {
    for (const hosting of ['production', 'preview', 'development', 'test'] as const) {
      for (const scope of ['formance', 'x402-payment', 'observability', 'clerk', 'source-write']) {
        for (const group of DEPLOYMENT_MANIFEST.configuration.requiredProduction.filter(group => group.scope === scope)) {
          for (const name of group.names) {
            const result = validateDeploymentManifest({ ...productionEnvironment(), [name]: undefined }, { environment: hosting })
            expect(result.ok, `${hosting}:${name}`).toBe(false)
            expect(result.findings).toContainEqual(expect.objectContaining({ kind: 'missing', names: [name], scope }))
          }
        }
      }
    }
  })

  it('does not infer live configuration from production bundling for development money', () => {
    const result = validateDeploymentManifest({
      NODE_ENV: 'production', AE_DEPLOYMENT_ENVIRONMENT: 'development', AE_FORMANCE_ENVIRONMENT: 'sandbox',
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_example', CLERK_SECRET_KEY: 'sk_test_example',
    }, { environment: 'production' })
    expect(result.findings).toEqual([])
  })

  it.each([
    { AE_X402_CDP_EXPECTED_EVM_ADDRESS: 'not-an-address' },
    { AE_X402_CDP_ACCOUNT_POLICY_ID: 'not-a-uuid' },
    { AE_X402_CDP_PROJECT_POLICY_ID: 'not-a-uuid' },
    { AE_X402_CDP_POLICY_RULES_DIGEST: 'sha256:wrong' },
    { AE_X402_CDP_CREDENTIAL_GENERATION: '9007199254740992' },
    { AE_X402_CDP_CREDENTIAL_GENERATION: '0' },
    { AE_X402_CUSTODY_MAX_ATOMIC: '100000001' },
  ])('rejects custody material refused by the real pure parser: %j', override => {
    expect(validateDeploymentManifest({ ...productionEnvironment(), ...override }).findings)
      .toContainEqual(expect.objectContaining({ code: 'x402_custody_configuration_invalid' }))
  })

  it.each([
    { AE_FORMANCE_LEDGER: 'INVALID_LEDGER' },
    { AE_FORMANCE_GATEWAY_URL: 'https://formance.example.com/path' },
    { AE_FORMANCE_GATEWAY_URL: 'https://user:private-password@formance.example.com' },
    { AE_FORMANCE_GATEWAY_URL: 'https://formance.example.com?access=private-token' },
  ])('rejects configuration refused by the native Formance boundary: %j', override => {
    const result = validateDeploymentManifest({ ...productionEnvironment(), ...override })
    expect(result.ok).toBe(false)
    expect(result.findings.some(finding => finding.scope === 'formance')).toBe(true)
    for (const secret of ['private-password', 'private-token', 'private-one', 'private-two']) expect(JSON.stringify(result)).not.toContain(secret)
  })

  it.each([
    { 'eip155:84532': ['https://first.example/rpc', 'https://second.example/rpc'] },
    { 'eip155:8453': ['https://first.example/rpc'] },
    { 'eip155:8453': ['https://first.example/key-one', 'https://first.example/key-two'] },
    { 'eip155:8453': ['https://first.example/rpc', 'https://FIRST.EXAMPLE.:8443/rpc'] },
    { 'eip155:8453': ['https://first.example/rpc', 'http://second.example/rpc'] },
    { 'eip155:8453': ['https://first.example/rpc', 'https://user:private-token@second.example/rpc'] },
  ])('requires two distinct Base mainnet RPC hosts: %j', configuration => {
    const result = validateDeploymentManifest({ ...productionEnvironment(), AE_X402_RPC_URLS_JSON: JSON.stringify(configuration) })
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'x402_rpc_urls_invalid' }))
    expect(JSON.stringify(result)).not.toContain('private-token')
  })

  it('accepts token-bearing RPC query endpoints without exposing them', () => {
    const result = validateDeploymentManifest({ ...productionEnvironment(),
      AE_X402_RPC_URLS_JSON: '{"eip155:8453":["https://first.example/rpc?key=private-one","https://second.example/rpc?key=private-two"]}',
    })
    expect(result.ok).toBe(true)
    for (const secret of ['private-password', 'private-token', 'private-one', 'private-two']) expect(JSON.stringify(result)).not.toContain(secret)
  })

  it.each([
    { SENTRY_DSN: 'https://sentry.example/123' },
    { SENTRY_DSN: 'https://public:private-password@sentry.example/123' },
    { VITE_SENTRY_DSN: 'http://public@sentry.example/123' },
    { VITE_SENTRY_DSN: 'https://public@sentry.example/not-a-project' },
    { SENTRY_ENVIRONMENT: 'development' },
    { VITE_SENTRY_ENVIRONMENT: ' production ' },
    { AE_DISABLE_OBSERVABILITY: 'true' },
    { VITE_AE_DISABLE_OBSERVABILITY: 'true' },
  ])('refuses malformed, wrong-world or disabled production Sentry: %j', override => {
    const result = validateDeploymentManifest({ ...productionEnvironment(), ...override })
    expect(result.ok).toBe(false)
    expect(result.findings.some(finding => finding.scope === 'observability')).toBe(true)
    expect(JSON.stringify(result)).not.toContain('private-password')
  })
})
