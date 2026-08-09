import { describe, expect, it } from 'vitest'

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
      'convex-scheduled-jobs',
    ])
    expect(result.readinessProbes.map((probe) => probe.path)).toEqual(['/api/health', '/api/ready', '/api/v1/release'])
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
      'AE_SOURCE_WRITE_KEY_INQUIRY',
      'AE_SOURCE_WRITE_KEY_SESSION',
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

  it('closes partially configured optional notification providers', () => {
    const result = validateDeploymentManifest({
      ...productionEnvironment(),
      RESEND_API_KEY: 'resend-secret',
    }, { nodeMajor: 22 })
    const names = result.findings.flatMap((finding) => finding.names)

    expect(result.ok).toBe(false)
    expect(names).toEqual(expect.arrayContaining(['RESEND_FROM', 'RESEND_WEBHOOK_SECRET', 'AE_NOTIFICATION_OUTBOX_SECRET']))
  })

  it('returns no secret values and fingerprints shape rather than secret material', () => {
    const first = productionEnvironment()
    const rotated = { ...first, OPENROUTER_API_KEY: 'rotated-openrouter-secret' }
    const result = validateDeploymentManifest(first, { nodeMajor: 22 })
    const rotatedResult = validateDeploymentManifest(rotated, { nodeMajor: 22 })

    expect(JSON.stringify(result)).not.toContain('openrouter-secret-value')
    expect(JSON.stringify(result)).not.toContain('source-write-secret')
    expect(rotatedResult.fingerprint).toBe(result.fingerprint)

    const modeChanged = validateDeploymentManifest({ ...first, VITE_AE_ANSWER_MODE: 'structured' }, { nodeMajor: 22 })
    const presenceChanged = validateDeploymentManifest({ ...first, VITE_GOOGLE_MAPS_API_KEY: 'maps-public-key' }, { nodeMajor: 22 })
    expect(modeChanged.fingerprint).not.toBe(result.fingerprint)
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
