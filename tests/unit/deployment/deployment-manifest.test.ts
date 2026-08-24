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
    AE_CANONICAL_BASE_URL: 'https://app.example.com',
    AE_CANONICAL_HOST_ALLOWLIST: 'app.example.com',
    CONVEX_URL: 'https://example.convex.cloud',
    AE_CONVEX_SERVER_FUNCTION_TOKEN: 'convex-server-function-token-long-enough',
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_example',
    CLERK_SECRET_KEY: 'sk_live_example',
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
    AE_X402_CDP_CREDENTIAL_GENERATION: '7',
    AE_X402_CUSTODY_ENABLED: 'true',
    AE_X402_CUSTODY_MAX_ATOMIC: '100000000',
    AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '100000000',
    AE_X402_RPC_URLS_JSON: '{"eip155:8453":["https://base.example/rpc"]}',
    STRIPE_SECRET_KEY: 'sk_live_example',
    STRIPE_WEBHOOK_SECRET: 'whsec_live_example',
    VITE_STRIPE_PUBLISHABLE_KEY: 'pk_live_example',
    AE_LLM_MODEL: 'deepseek/deepseek-v4-flash',
    AE_ANSWER_EVAL_PASSED: '1',
    ...Object.fromEntries(SOURCE_WRITE_FAMILIES.map((family) => [
      `AE_SOURCE_WRITE_KEY_${family.toUpperCase()}`,
      `${family}-key:source-write-secret-${family}-long-enough`,
    ])),
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
      'durable-invocation-workpool',
      'operation-gateway',
      'convex-scheduled-jobs',
    ])
    const components = result.resources.find((resource) => resource.id === 'convex-components')
    expect((components as { components: readonly string[] }).components).toContain('agent')
    expect(result.readinessProbes.map((probe) => probe.path)).toEqual(['/api/health', '/api/ready', '/api/v1/release'])
  })

  it('keeps the scheduled-job manifest inventory aligned with Convex cron registrations', () => {
    const scheduledJobs = DEPLOYMENT_MANIFEST.resources.find((resource) => resource.id === 'convex-scheduled-jobs')
    expect(scheduledJobs).toBeDefined()
    const registeredJobNames = Object.keys(convexCrons.crons).sort()
    const manifestJobNames = [...(scheduledJobs as { jobs: readonly string[] }).jobs].sort()

    expect(manifestJobNames).toEqual(registeredJobNames)
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
      'CLERK_JWT_ISSUER_DOMAIN',
      'AE_CANONICAL_BASE_URL',
      'AE_CANONICAL_HOST_ALLOWLIST',
      'OPENROUTER_API_KEY',
      'AE_LLM_MODEL',
      'AE_CHAT_PROXY_SECRET',
      'AE_SOURCE_WRITE_KEY_BILLING',
      'AE_SOURCE_WRITE_KEY_SESSION',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'VITE_STRIPE_PUBLISHABLE_KEY',
    ]))
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

  it('rejects local auth bypass and fixture flags in production', () => {
    const result = validateDeploymentManifest({
      ...productionEnvironment(),
      VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E: 'true',
      AE_ANSWER_EVAL_REGISTRY_SEED: 'broad',
    }, { nodeMajor: 22 })

    expect(result.findings.filter((finding) => finding.kind === 'forbidden').flatMap((finding) => finding.names))
      .toEqual(expect.arrayContaining(['VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'AE_ANSWER_EVAL_REGISTRY_SEED']))
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

    const modeChanged = validateDeploymentManifest({ ...first, VITE_AE_ANSWER_MODE: 'structured' }, { nodeMajor: 22 })
    const modelChanged = validateDeploymentManifest({ ...first, AE_LLM_MODEL: 'openai/gpt-5-mini' }, { nodeMajor: 22 })
    const presenceChanged = validateDeploymentManifest({ ...first, VITE_SENTRY_DSN: 'https://public@sentry.example/1' }, { nodeMajor: 22 })
    expect(modeChanged.fingerprint).not.toBe(result.fingerprint)
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
