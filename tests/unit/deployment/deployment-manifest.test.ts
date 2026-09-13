import { describe, expect, it, vi } from 'vitest'

import convexCrons from '../../../convex/crons'
import {
  DEPLOYMENT_MANIFEST,
  SOURCE_WRITE_FAMILIES,
  validateDeploymentManifest,
  type DeploymentEnvironmentInput,
} from '../../../src/lib/deployment/manifest'
import { resolveServiceMode, serviceModeAllowsEnvironment } from '../../../src/lib/deployment/service-mode'

function productionEnvironment(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    AE_CANONICAL_BASE_URL: 'https://app.example.com',
    AE_CANONICAL_HOST_ALLOWLIST: 'app.example.com',
    CONVEX_URL: 'https://example.convex.cloud',
    AE_CONVEX_SERVER_FUNCTION_TOKEN: 'convex-server-function-token-long-enough',
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_example',
    CLERK_SECRET_KEY: 'sk_live_example',
    CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_live_example',
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
    AE_X402_RPC_URLS_JSON: '{"eip155:8453":["https://base.example/rpc"]}',
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

function disabledHostedAlphaEnvironment(): Record<string, string> {
  const environment = productionEnvironment()
  for (const name of Object.keys(environment)) {
    if (name.startsWith('CDP_') || name.startsWith('AE_X402_')) delete environment[name]
  }
  return {
    ...environment,
    AE_SERVICE_MODE: 'hosted_alpha',
    STRIPE_SECRET_KEY: 'rk_test_alpha',
    STRIPE_READBACK_KEY: 'rk_test_alpha_readback',
    AE_FORMANCE_ENVIRONMENT: 'sandbox',
    AE_X402_CUSTODY_ENABLED: 'false',
    AE_PACKAGE5_WRITES_ENABLED: 'false',
    AE_SUPPLY_HTTP_CREDENTIALS_ENABLED: 'false',
    AE_SUPPLY_MCP_OAUTH_ENABLED: 'false',
    AE_PROVIDER_OFFBOARDING_ENABLED: 'false',
    AE_SCHEDULED_WORKLOADS_ENABLED: 'false',
  }
}

describe('deployment manifest validator', () => {
  it('admits a complete production configuration and declares only real resources/probes', () => {
    const result = validateDeploymentManifest(productionEnvironment(), { nodeMajor: 22 })

    expect(result.ok).toBe(true)
    expect(result.findings).toEqual([])
    expect(result.resources.map((resource) => resource.id)).toEqual([
      'web-server',
      'convex-components',
      'agent-access',
      'formance-financial-authority',
      'seller-onboarding-canary-funding',
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
      'workflow',
      'rate-limiter',
      'agent',
      'aggregate:marketEvidence',
      'aggregate:marketOperationEvidence',
      'aggregate:marketOperationRatings',
      'aggregate:marketActiveOperations',
      'aggregate:marketActiveSuppliers',
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

  it.each([undefined, 'true', 'false'])('registers recurring jobs according to the deployment switch %s', async (value) => {
    vi.stubEnv('AE_SCHEDULED_WORKLOADS_ENABLED', value)
    vi.resetModules()
    try {
      const { default: crons } = await import('../../../convex/crons')
      const registered = Object.keys(crons.crons).sort()
      expect(registered).toEqual(value === 'false' ? [] : Object.keys(convexCrons.crons).sort())
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })

  it('refuses to register recurring jobs with an invalid explicit switch', async () => {
    vi.stubEnv('AE_SCHEDULED_WORKLOADS_ENABLED', 'invalid')
    vi.resetModules()
    try {
      await expect(import('../../../convex/crons')).rejects.toThrow('invalid_scheduled_workloads_configuration')
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })

  it('fails closed for missing core source, auth, canonical, model, and source-write configuration', () => {
    const result = validateDeploymentManifest({ NODE_ENV: 'production' }, { nodeMajor: 22 })
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
      'OPENROUTER_API_KEY',
      'AE_LLM_MODEL',
      'AE_CHAT_PROXY_SECRET',
      'AE_SOURCE_WRITE_KEY_BILLING',
      'AE_SOURCE_WRITE_KEY_SESSION',
      'STRIPE_SECRET_KEY',
      'STRIPE_READBACK_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_V2_WEBHOOK_SECRET',
      'STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID',
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

  it('requires every Package 5 rollout switch to be explicitly enabled in controlled deployments', () => {
    const production = validateDeploymentManifest({
      ...productionEnvironment(),
      AE_SUPPLY_MCP_OAUTH_ENABLED: 'false',
    }, { nodeMajor: 22 })
    expect(production.findings).toContainEqual({
      kind: 'malformed',
      code: 'package5_rollout_not_enabled',
      names: ['AE_SUPPLY_MCP_OAUTH_ENABLED'],
      scope: 'package5-rollout',
    })

    const synthetic = validateDeploymentManifest({
      NODE_ENV: 'test',
      AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE: 'synthetic_vps_fixture',
    }, { environment: 'test', nodeMajor: 22 })
    expect(synthetic.findings.filter(({ scope }) => scope === 'package5-rollout').flatMap(({ names }) => names))
      .toEqual(expect.arrayContaining([
        'AE_PACKAGE5_WRITES_ENABLED',
        'AE_SUPPLY_HTTP_CREDENTIALS_ENABLED',
        'AE_SUPPLY_MCP_OAUTH_ENABLED',
        'AE_PROVIDER_OFFBOARDING_ENABLED',
      ]))
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

  it('admits only sandbox identities and remote Formance for the synthetic release profile', () => {
    const environment = {
      ...productionEnvironment(),
      AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE: 'synthetic_vps_fixture',
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_release',
      CLERK_SECRET_KEY: 'sk_test_release',
      STRIPE_SECRET_KEY: 'rk_test_release',
      STRIPE_READBACK_KEY: 'rk_test_readback_release',
      STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID: 'txr_au_gst_10_inclusive',
      AE_FORMANCE_ENVIRONMENT: 'sandbox',
      AE_FORMANCE_LEDGER: 'agentic-economy-release',
    }

    expect(validateDeploymentManifest(environment, { nodeMajor: 22 })).toMatchObject({
      ok: true,
      findings: [],
    })
    expect(validateDeploymentManifest({
      ...environment,
      STRIPE_SECRET_KEY: 'rk_live_wrong-boundary',
      AE_FORMANCE_ENVIRONMENT: 'production',
    }, { nodeMajor: 22 }).findings.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'stripe_secret_key_invalid',
      'formance_environment_mismatch',
    ]))
  })

  it('admits hosted alpha with production identity and sandbox money', () => {
    const environment = {
      ...productionEnvironment(),
      AE_SERVICE_MODE: 'hosted_alpha',
      STRIPE_SECRET_KEY: 'rk_test_alpha',
      STRIPE_READBACK_KEY: 'rk_test_alpha_readback',
      AE_FORMANCE_ENVIRONMENT: 'sandbox',
      AE_SCHEDULED_WORKLOADS_ENABLED: 'false',
    }
    expect(validateDeploymentManifest(environment)).toMatchObject({ ok: true, findings: [] })
    expect(resolveServiceMode(environment)).toBe('hosted_alpha')
    expect(serviceModeAllowsEnvironment(resolveServiceMode(environment), 'sandbox')).toBe(true)
    expect(serviceModeAllowsEnvironment(resolveServiceMode(environment), 'production')).toBe(false)
    for (const readbackKey of [undefined, '', ' ']) {
      const result = validateDeploymentManifest({ ...environment, STRIPE_READBACK_KEY: readbackKey })
      expect(result.ok).toBe(false)
      expect(result.findings).toEqual([{
        kind: 'missing',
        code: 'stripe_configuration_required',
        names: ['STRIPE_READBACK_KEY'],
        scope: 'stripe-money',
      }])
    }
  })

  it('admits hosted alpha with explicitly disabled custody, Provider features, and recurring work', () => {
    expect(validateDeploymentManifest(disabledHostedAlphaEnvironment(), { nodeMajor: 22 }))
      .toMatchObject({ ok: true, findings: [] })
  })

  it.each([
    'AE_X402_CUSTODY_ENABLED',
    'AE_PACKAGE5_WRITES_ENABLED',
    'AE_SUPPLY_HTTP_CREDENTIALS_ENABLED',
    'AE_SUPPLY_MCP_OAUTH_ENABLED',
    'AE_PROVIDER_OFFBOARDING_ENABLED',
  ])('requires an explicit valid hosted alpha switch for %s', (name) => {
    for (const value of [undefined, '', ' ', 'FALSE', '0', 'invalid']) {
      const result = validateDeploymentManifest({ ...disabledHostedAlphaEnvironment(), [name]: value })
      expect(result.ok).toBe(false)
      expect(result.findings).toContainEqual(expect.objectContaining({ names: [name] }))
    }
  })

  it('requires the exact false custody switch to omit hosted alpha custody credentials', () => {
    const result = validateDeploymentManifest({
      ...disabledHostedAlphaEnvironment(), AE_X402_CUSTODY_ENABLED: 'false ',
    })
    expect(result.ok).toBe(false)
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'x402_custody_not_enabled', names: ['AE_X402_CUSTODY_ENABLED'],
    }))
  })

  it('requires full custody configuration when hosted alpha enables custody', () => {
    const result = validateDeploymentManifest({
      ...disabledHostedAlphaEnvironment(), AE_X402_CUSTODY_ENABLED: 'true',
    })
    expect(result.ok).toBe(false)
    expect(result.findings.filter(({ code }) => code === 'x402_payment_custody_required')
      .flatMap(({ names }) => names)).toEqual(expect.arrayContaining([
      'CDP_API_KEY_ID', 'CDP_API_KEY_SECRET', 'CDP_WALLET_SECRET',
      'AE_X402_CDP_ACCOUNT_NAME', 'AE_X402_CDP_EXPECTED_EVM_ADDRESS',
      'AE_X402_CDP_ACCOUNT_POLICY_ID', 'AE_X402_CDP_PROJECT_POLICY_ID',
      'AE_X402_CDP_POLICY_RULES_DIGEST', 'AE_X402_CDP_CREDENTIAL_GENERATION',
      'AE_X402_CUSTODY_MAX_ATOMIC', 'AE_X402_CUSTODY_DAILY_MAX_ATOMIC', 'AE_X402_RPC_URLS_JSON',
    ]))
  })

  it.each([
    'AE_INFISICAL_CUSTOMER_PROJECT_ID',
    'AE_INFISICAL_PLATFORM_MACHINE_IDENTITY_ID',
    ...SOURCE_WRITE_FAMILIES.map((family) => `AE_SOURCE_WRITE_KEY_${family.toUpperCase()}`),
  ])('retains disabled hosted alpha authority requirements for %s', (name) => {
    const result = validateDeploymentManifest({ ...disabledHostedAlphaEnvironment(), [name]: undefined })
    expect(result.ok).toBe(false)
    expect(result.findings).toContainEqual(expect.objectContaining({ kind: 'missing', names: [name] }))
  })

  it.each([false, true])('keeps custody and Provider features required outside hosted alpha (synthetic fixture: %s)', (synthetic) => {
    const result = validateDeploymentManifest({
      ...disabledHostedAlphaEnvironment(),
      AE_SERVICE_MODE: undefined,
      ...(synthetic ? {
        AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE: 'synthetic_vps_fixture',
        VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_release',
        CLERK_SECRET_KEY: 'sk_test_release',
      } : {
        STRIPE_SECRET_KEY: 'rk_live_example',
        STRIPE_READBACK_KEY: 'rk_live_readback',
        AE_FORMANCE_ENVIRONMENT: 'production',
      }),
    })
    expect(result.ok).toBe(false)
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'x402_custody_not_enabled' }))
    expect(result.findings.filter(({ code }) => code === 'package5_rollout_not_enabled')
      .flatMap(({ names }) => names)).toEqual(expect.arrayContaining([
      'AE_PACKAGE5_WRITES_ENABLED', 'AE_SUPPLY_HTTP_CREDENTIALS_ENABLED',
      'AE_SUPPLY_MCP_OAUTH_ENABLED', 'AE_PROVIDER_OFFBOARDING_ENABLED',
    ]))
  })

  it.each([
    ['VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_alpha', 'clerk_publishable_key_invalid'],
    ['CLERK_SECRET_KEY', 'sk_test_alpha', 'clerk_secret_key_invalid'],
    ['STRIPE_SECRET_KEY', 'rk_live_alpha', 'stripe_secret_key_invalid'],
    ['STRIPE_SECRET_KEY', 'sk_test_alpha', 'stripe_secret_key_invalid'],
    ['STRIPE_READBACK_KEY', 'rk_live_alpha', 'stripe_readback_key_invalid'],
    ['AE_FORMANCE_ENVIRONMENT', 'production', 'formance_environment_mismatch'],
  ])('refuses hosted alpha with incompatible %s', (name, value, code) => {
    const result = validateDeploymentManifest({
      ...productionEnvironment(),
      AE_SERVICE_MODE: 'hosted_alpha',
      STRIPE_SECRET_KEY: 'rk_test_alpha',
      STRIPE_READBACK_KEY: 'rk_test_alpha_readback',
      AE_FORMANCE_ENVIRONMENT: 'sandbox',
      [name]: value,
    })
    expect(result.ok).toBe(false)
    expect(result.findings).toContainEqual(expect.objectContaining({ code, names: [name] }))
  })

  it('keeps hosted alpha identity requirements on non-production deployment classes', () => {
    const result = validateDeploymentManifest({
      ...productionEnvironment(),
      NODE_ENV: 'development',
      AE_SERVICE_MODE: 'hosted_alpha',
      STRIPE_SECRET_KEY: 'rk_test_alpha',
      STRIPE_READBACK_KEY: 'rk_test_alpha_readback',
      AE_FORMANCE_ENVIRONMENT: 'sandbox',
      CLERK_SECRET_KEY: undefined,
    })
    expect(result.ok).toBe(false)
    expect(result.findings).toContainEqual(expect.objectContaining({
      kind: 'missing', scope: 'clerk', names: ['CLERK_SECRET_KEY'],
    }))
  })

  it.each([
    { AE_SERVICE_MODE: '' },
    { AE_SERVICE_MODE: ' ' },
    { AE_SERVICE_MODE: 'standard' },
    { AE_SERVICE_MODE: 'hosted_alpha ' },
    { AE_SERVICE_MODE: 'unknown' },
    { AE_SERVICE_MODE: 'hosted_alpha', AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE: 'synthetic_vps_fixture' },
    { AE_SERVICE_MODE: 'hosted_alpha', AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE: '' },
  ])('fails closed for invalid or conflicting explicit service configuration %j', (configuration) => {
    const environment = { ...productionEnvironment(), ...configuration }
    expect(resolveServiceMode(environment)).toBe('invalid')
    expect(serviceModeAllowsEnvironment(resolveServiceMode(environment), 'sandbox')).toBe(false)
    expect(serviceModeAllowsEnvironment(resolveServiceMode(environment), 'production')).toBe(false)
    const result = validateDeploymentManifest(environment)
    expect(result.ok).toBe(false)
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'service_mode_invalid' }))
  })

  it('preserves existing environment checks when service mode is unset', () => {
    const mode = resolveServiceMode(productionEnvironment())
    expect(mode).toBe('standard')
    expect(serviceModeAllowsEnvironment(mode, 'sandbox')).toBe(true)
    expect(serviceModeAllowsEnvironment(mode, 'production')).toBe(true)
  })

  it.each([undefined, 'true', 'false'])('accepts optional scheduled-workload setting %s', (value) => {
    expect(validateDeploymentManifest({
      ...productionEnvironment(), AE_SCHEDULED_WORKLOADS_ENABLED: value,
    }).ok).toBe(true)
  })

  it.each(['', ' ', 'TRUE', '0', '1', 'false ', 'unknown'])('rejects malformed scheduled-workload setting %j', (value) => {
    const result = validateDeploymentManifest({
      ...productionEnvironment(), AE_SCHEDULED_WORKLOADS_ENABLED: value,
    })
    expect(result.ok).toBe(false)
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'ae_scheduled_workloads_enabled_invalid', names: ['AE_SCHEDULED_WORKLOADS_ENABLED'],
    }))
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
    expect(missing.findings.flatMap((finding) => finding.names)).toEqual(expect.arrayContaining([
      'CDP_API_KEY_ID',
      'CDP_API_KEY_SECRET',
      'CDP_WALLET_SECRET',
      'AE_X402_CDP_ACCOUNT_NAME',
      'AE_X402_CDP_EXPECTED_EVM_ADDRESS',
      'AE_X402_CDP_ACCOUNT_POLICY_ID',
      'AE_X402_CDP_PROJECT_POLICY_ID',
      'AE_X402_CDP_POLICY_RULES_DIGEST',
      'AE_X402_CDP_CREDENTIAL_GENERATION',
      'AE_X402_CUSTODY_ENABLED',
      'AE_X402_CUSTODY_MAX_ATOMIC',
      'AE_X402_CUSTODY_DAILY_MAX_ATOMIC',
      'AE_X402_RPC_URLS_JSON',
    ]))

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

    const modelChanged = validateDeploymentManifest({ ...first, AE_LLM_MODEL: 'openai/gpt-5-mini' }, { nodeMajor: 22 })
    const presenceChanged = validateDeploymentManifest({ ...first, VITE_SENTRY_DSN: 'https://public@sentry.example/1' }, { nodeMajor: 22 })
    expect(modelChanged.fingerprint).not.toBe(result.fingerprint)
    expect(presenceChanged.fingerprint).not.toBe(result.fingerprint)
  })

  it('keeps non-production source-write root derivation available without accepting it in production', () => {
    const development: DeploymentEnvironmentInput = {
      NODE_ENV: 'development',
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
})
