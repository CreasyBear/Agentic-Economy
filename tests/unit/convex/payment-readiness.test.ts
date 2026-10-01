import { createCustomerRequestServiceAssertion, type CustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import { readPaymentReadinessForServer } from '../../../convex/lib/money/readiness/store'
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backendPaymentReadinessDigest, failedPaymentReadinessChecks, paymentReadinessExpiresAt,
  PAYMENT_READINESS_CHECK_KEYS, PAYMENT_READINESS_MAX_PROBE_AGE_MS, PAYMENT_READINESS_MAX_VALIDITY_MS,
  sealPaymentReadinessSnapshot, type PaymentReadinessChecks, type PaymentReadinessSnapshot,
  type PaymentReadinessView } from '@/modules/money/payment-readiness'
import type { PublishPaymentReadinessResult } from '../../../convex/lib/money/readiness/store'
import schema from '../../../convex/schema'

const modules = Object.fromEntries(Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
  .map(([path, load]) => [path.replace('../../../convex/', './'), load]))
const publish = makeFunctionReference<'mutation', { snapshot: PaymentReadinessSnapshot }, PublishPaymentReadinessResult>('moneyReadiness:publish')
const read = makeFunctionReference<'query', { environment: 'sandbox' | 'production'; now: number }, PaymentReadinessView>('moneyReadiness:readInternal')
const NOW = Date.UTC(2026, 9, 1, 12)

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  for (const [name, value] of Object.entries({
    AE_DEPLOYMENT_ENVIRONMENT: 'production', AE_FORMANCE_ENVIRONMENT: 'production',
    AE_FORMANCE_GATEWAY_URL: 'https://ledger.example.test', AE_FORMANCE_LEDGER: 'production',
    AE_FORMANCE_ACCESS_CLIENT_ID: 'fixture-client', AE_FORMANCE_ACCESS_CLIENT_SECRET: 'private-formance-fixture',
    AE_FORMANCE_REQUEST_TIMEOUT_MS: '5000', CDP_API_KEY_ID: 'fixture-key',
    CDP_API_KEY_SECRET: 'private-cdp-fixture', CDP_WALLET_SECRET: 'private-wallet-fixture',
    AE_X402_CDP_CREDENTIAL_GENERATION: '1', AE_X402_RPC_URLS_JSON: '{"eip155:8453":["https://rpc-a.example.test","https://rpc-b.example.test"]}',
    AE_SITE_URL: 'https://app.example.test', CONVEX_CLOUD_URL: 'https://fixture.convex.cloud',
  })) vi.stubEnv(name, value)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

function passedChecks(validUntil = NOW + 120_000): PaymentReadinessChecks {
  const passed = { kind: 'passed' as const, validUntil }
  return { web_configuration: passed, formance: passed, cdp_custody: passed, base_rpc: passed,
    reference_rate: passed, sanctions: passed, commercial_policy: passed, treasury: passed }
}
function snapshot(options: { startedAt?: number; completedAt?: number; checks?: PaymentReadinessChecks;
  environment?: 'sandbox' | 'production'; configurationDigest?: string } = {}): PaymentReadinessSnapshot {
  const startedAt = options.startedAt ?? NOW - 1000
  const checks = options.checks ?? passedChecks()
  return sealPaymentReadinessSnapshot({ environment: options.environment ?? 'production',
    configurationDigest: options.configurationDigest ?? backendPaymentReadinessDigest(process.env),
    startedAt, completedAt: options.completedAt ?? NOW, expiresAt: paymentReadinessExpiresAt(startedAt, checks), checks })
}
const storedRows = (backend: ReturnType<typeof convexTest>) => backend.run(async ctx =>
  await ctx.db.query('moneyPaymentReadiness').take(2))
const view = (backend: ReturnType<typeof convexTest>, now = NOW) => backend.query(read, { environment: 'production', now })

describe('payment readiness evidence publication and admission view', () => {
  it('publishes complete fresh evidence and returns only sanitized status', async () => {
    const backend = convexTest(schema, modules)
    const evidence = snapshot()
    expect(await backend.mutation(publish, { snapshot: evidence })).toEqual({ kind: 'published', replayed: false })
    const result = await view(backend)
    expect(result).toEqual({ kind: 'ready', environment: 'production', checkedAt: NOW,
      expiresAt: evidence.expiresAt, code: null, checks: evidence.checks })
    expect(Object.keys(result).sort()).toEqual(['checkedAt', 'checks', 'code', 'environment', 'expiresAt', 'kind'])
    const outward = JSON.stringify(result)
    expect(outward).not.toContain(evidence.configurationDigest)
    expect(outward).not.toContain(evidence.evidenceDigest)
    expect(outward).not.toContain('private-')
  })

  it('replays exact concurrent publications with one row', async () => {
    const backend = convexTest(schema, modules)
    const evidence = snapshot()
    const results = await Promise.all([
      backend.mutation(publish, { snapshot: evidence }), backend.mutation(publish, { snapshot: evidence }),
    ])
    expect(results).toContainEqual({ kind: 'published', replayed: false })
    expect(results).toContainEqual({ kind: 'published', replayed: true })
    expect(await storedRows(backend)).toHaveLength(1)
  })

  it('retains a newer failed result when an older successful worker completes later', async () => {
    const backend = convexTest(schema, modules)
    const old = snapshot({ startedAt: NOW - 2000 })
    const checks = { ...passedChecks(), formance: { kind: 'failed' as const, code: 'formance_access_unavailable' } }
    const current = snapshot({ startedAt: NOW - 1000, checks })
    await backend.mutation(publish, { snapshot: current })
    expect(await backend.mutation(publish, { snapshot: old })).toEqual({ kind: 'refused', code: 'readiness_snapshot_superseded' })
    expect(await view(backend)).toMatchObject({ kind: 'not_ready', code: 'formance_access_unavailable' })
    expect((await storedRows(backend))[0]?.evidenceDigest).toBe(current.evidenceDigest)
  })

  it('retains the later probe start under competing concurrent publications', async () => {
    const backend = convexTest(schema, modules)
    const old = snapshot({ startedAt: NOW - 2000 })
    const current = snapshot({ checks: { ...passedChecks(), base_rpc: { kind: 'failed', code: 'treasury_rpc_unavailable' } } })
    await Promise.all([backend.mutation(publish, { snapshot: old }), backend.mutation(publish, { snapshot: current })])
    const rows = await storedRows(backend)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.evidenceDigest).toBe(current.evidenceDigest)
    expect(await view(backend)).toMatchObject({ kind: 'not_ready', code: 'treasury_rpc_unavailable' })
  })

  it('refuses different evidence from the same probe start without overwriting', async () => {
    const backend = convexTest(schema, modules)
    const evidence = snapshot()
    await backend.mutation(publish, { snapshot: evidence })
    const competing = snapshot({ checks: { ...passedChecks(), treasury: { kind: 'failed', code: 'treasury_capacity_unavailable' } } })
    expect(await backend.mutation(publish, { snapshot: competing })).toEqual({ kind: 'refused', code: 'readiness_snapshot_superseded' })
    expect(await view(backend)).toMatchObject({ kind: 'ready' })
  })

  it.each(['CDP_API_KEY_SECRET', 'CDP_WALLET_SECRET', 'AE_FORMANCE_ACCESS_CLIENT_SECRET',
    'AE_X402_RPC_URLS_JSON', 'AE_SITE_URL', 'CONVEX_CLOUD_URL', 'CLERK_SECRET_KEY'] as const)(
    'invalidates stored evidence and refuses a late worker when %s changes', async name => {
      const backend = convexTest(schema, modules)
      const evidence = snapshot()
      await backend.mutation(publish, { snapshot: evidence })
      vi.stubEnv(name, 'rotated-runtime-fixture')
      expect(await view(backend)).toMatchObject({ kind: 'not_ready', code: 'readiness_configuration_changed', checkedAt: null })
      expect(await backend.mutation(publish, { snapshot: evidence })).toEqual({ kind: 'refused', code: 'readiness_configuration_changed' })
      expect((await storedRows(backend))[0]?.evidenceDigest).toBe(evidence.evidenceDigest)
    },
  )

  it.each([
    ['AE_FORMANCE_ENVIRONMENT', 'production'], ['AE_X402_CUSTODY_MAX_ATOMIC', '10000'],
  ])('invalidates whitespace changes to exact-value configuration %s', async (name, value) => {
    vi.stubEnv(name, value)
    const backend = convexTest(schema, modules)
    const evidence = snapshot()
    await backend.mutation(publish, { snapshot: evidence })
    expect(await view(backend)).toMatchObject({ kind: 'ready' })
    vi.stubEnv(name, ` ${value} `)
    expect(await view(backend)).toMatchObject({ kind: 'not_ready', code: 'readiness_configuration_changed' })
    expect(await backend.mutation(publish, { snapshot: evidence }))
      .toEqual({ kind: 'refused', code: 'readiness_configuration_changed' })
    expect((await storedRows(backend))[0]?.evidenceDigest).toBe(evidence.evidenceDigest)
  })

  it('does not bind untrusted mirrored web VITE settings as backend truth', () => {
    const before = backendPaymentReadinessDigest(process.env)
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'mirrored-public-key')
    vi.stubEnv('VITE_SENTRY_DSN', 'mirrored-web-setting')
    expect(backendPaymentReadinessDigest(process.env)).toBe(before)
  })

  it('replaces old evidence with fresh evidence for the rotated configuration', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(publish, { snapshot: snapshot({ startedAt: NOW - 2000 }) })
    vi.stubEnv('CDP_API_KEY_SECRET', 'rotated-secret')
    expect(await backend.mutation(publish, { snapshot: snapshot() })).toEqual({ kind: 'published', replayed: false })
    expect(await storedRows(backend)).toHaveLength(1)
    expect(await view(backend)).toMatchObject({ kind: 'ready' })
  })

  it('stores all-failed complete evidence without claiming ready', async () => {
    const backend = convexTest(schema, modules)
    const evidence = snapshot({ checks: failedPaymentReadinessChecks('provider_unavailable') })
    expect(evidence.expiresAt).toBe(evidence.startedAt + PAYMENT_READINESS_MAX_VALIDITY_MS)
    expect(await backend.mutation(publish, { snapshot: evidence })).toEqual({ kind: 'published', replayed: false })
    expect(await view(backend)).toMatchObject({ kind: 'not_ready', code: 'provider_unavailable', checks: evidence.checks })
  })

  it('derives expiry from the earliest check and refuses at the exact expiry', async () => {
    const backend = convexTest(schema, modules)
    const evidence = snapshot({ checks: { ...passedChecks(), reference_rate: { kind: 'passed', validUntil: NOW + 1 } } })
    await backend.mutation(publish, { snapshot: evidence })
    expect(evidence.expiresAt).toBe(NOW + 1)
    const expired = await view(backend, NOW + 1)
    expect(expired).toMatchObject({ kind: 'not_ready', code: 'readiness_expired', expiresAt: NOW + 1 })
    expect(PAYMENT_READINESS_CHECK_KEYS.every(key => expired.checks[key].kind === 'failed')).toBe(true)
    vi.mocked(Date.now).mockReturnValue(NOW + 1)
    expect(await backend.mutation(publish, { snapshot: evidence })).toEqual({ kind: 'refused', code: 'readiness_snapshot_stale' })
  })

  it('caps long-lived checks at ten minutes from start', async () => {
    const backend = convexTest(schema, modules)
    const evidence = snapshot({ checks: passedChecks(NOW + 86_400_000) })
    expect(evidence.expiresAt).toBe(evidence.startedAt + PAYMENT_READINESS_MAX_VALIDITY_MS)
    await backend.mutation(publish, { snapshot: evidence })
    expect(await view(backend, evidence.expiresAt)).toMatchObject({ kind: 'not_ready', code: 'readiness_expired' })
  })

  it.each(['stale_start', 'future_start', 'future_completion', 'slow_probe', 'bad_seal', 'bad_digest', 'bad_code', 'fake_expiry'] as const)(
    'refuses %s publication with no writes', async fault => {
      const backend = convexTest(schema, modules)
      let evidence = snapshot()
      if (fault === 'stale_start') evidence = snapshot({ startedAt: NOW - PAYMENT_READINESS_MAX_PROBE_AGE_MS - 1,
        completedAt: NOW - PAYMENT_READINESS_MAX_PROBE_AGE_MS })
      if (fault === 'future_start') evidence = snapshot({ startedAt: NOW + 1, completedAt: NOW + 1 })
      if (fault === 'future_completion') evidence = snapshot({ completedAt: NOW + 1 })
      if (fault === 'slow_probe') evidence = snapshot({ startedAt: NOW - PAYMENT_READINESS_MAX_PROBE_AGE_MS - 1 })
      if (fault === 'bad_seal') evidence = { ...evidence, evidenceDigest: `sha256:${'0'.repeat(64)}` }
      if (fault === 'bad_digest') evidence = snapshot({ configurationDigest: 'secret-raw-invalid' })
      if (fault === 'bad_code') evidence = snapshot({ checks: { ...passedChecks(), sanctions: { kind: 'failed', code: 'Unsafe Provider Text' } } })
      if (fault === 'fake_expiry') {
        const { evidenceDigest, ...material } = evidence
        void evidenceDigest
        evidence = sealPaymentReadinessSnapshot({ ...material, expiresAt: evidence.expiresAt + 1 })
      }
      expect(await backend.mutation(publish, { snapshot: evidence })).toEqual({ kind: 'refused', code:
        fault === 'stale_start' ? 'readiness_snapshot_stale' : 'readiness_snapshot_invalid' })
      expect(await storedRows(backend)).toHaveLength(0)
    },
  )

  it('refuses an incomplete fixed check set at the registration boundary', async () => {
    const backend = convexTest(schema, modules)
    const evidence = snapshot()
    const { treasury, ...incomplete } = evidence.checks
    void treasury
    const malformed = { ...evidence, checks: incomplete } as unknown as PaymentReadinessSnapshot
    await expect(backend.mutation(publish, { snapshot: malformed })).rejects.toThrow()
    expect(await storedRows(backend)).toHaveLength(0)
  })

  it('refuses wrong environment without creating a row', async () => {
    const backend = convexTest(schema, modules)
    expect(await backend.mutation(publish, { snapshot: snapshot({ environment: 'sandbox' }) }))
      .toEqual({ kind: 'refused', code: 'readiness_environment_mismatch' })
    expect(await backend.query(read, { environment: 'sandbox', now: NOW })).toMatchObject({ kind: 'not_ready', code: 'readiness_environment_mismatch' })
    expect(await storedRows(backend)).toHaveLength(0)
  })

  it('returns explicit missing evidence, and rejects invalid observation clocks', async () => {
    const backend = convexTest(schema, modules)
    expect(await view(backend)).toMatchObject({ kind: 'not_ready', checkedAt: null, code: 'readiness_evidence_missing' })
    expect(await view(backend, -1)).toMatchObject({ kind: 'not_ready', code: 'readiness_clock_invalid' })
    await backend.mutation(publish, { snapshot: snapshot() })
    expect(await view(backend, NOW - 1)).toMatchObject({ kind: 'not_ready', code: 'readiness_snapshot_invalid' })
  })
})

const serviceRead = makeFunctionReference<'query', { environment: 'sandbox' | 'production'; serviceAuth: CustomerRequestServiceAssertion }, PaymentReadinessView>('moneyReadiness:readForServer')
const SERVICE_KEY = 'readiness-service-key-0123456789abcdef'
async function serviceProof(options: { operation?: string; environment?: 'sandbox' | 'production'; issuedAt?: number; scope?: string; principalId?: string } = {}) {
  return await createCustomerRequestServiceAssertion({ key: SERVICE_KEY,
    operation: options.operation ?? 'moneyReadiness:readForServer', command: { environment: options.environment ?? 'production' },
    principal: { principalId: options.principalId ?? 'ae:server-function', ownerId: 'ae:server-function', credentialId: 'ae:server-function',
      scopes: [options.scope ?? 'money_readiness:read'] }, issuedAt: options.issuedAt ?? NOW })
}
describe('registered server-authorized payment readiness read', () => {
  beforeEach(() => vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', SERVICE_KEY))
  it('reads exact current evidence without an interactive identity or writes, and expires at backend time', async () => {
    const backend = convexTest(schema, modules)
    const evidence = snapshot({ checks: passedChecks(NOW + 1000) })
    await backend.mutation(publish, { snapshot: evidence })
    const before = await storedRows(backend)
    const args = { environment: 'production' as const, serviceAuth: await serviceProof() }
    expect(await backend.query(serviceRead, args)).toMatchObject({ kind: 'ready', expiresAt: NOW + 1000 })
    expect(await backend.query(serviceRead, args)).toMatchObject({ kind: 'ready' })
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 1000)
    expect(await backend.query(serviceRead, args)).toMatchObject({ kind: 'not_ready', code: 'readiness_expired' })
    expect(await storedRows(backend)).toEqual(before)
  })
  it.each(['operation', 'environment', 'scope', 'principal', 'owner', 'credential', 'signature', 'old', 'future'] as const)(
    'refuses %s assertion before a protected read', async defect => {
      const backend = convexTest(schema, modules)
      let proof = await serviceProof({
        ...(defect === 'operation' ? { operation: 'moneyReadiness:publish' } : {}),
        ...(defect === 'environment' ? { environment: 'sandbox' as const } : {}),
        ...(defect === 'scope' ? { scope: 'market_flow:lookup' } : {}),
        ...(defect === 'principal' ? { principalId: 'foreign-server' } : {}),
        ...(defect === 'old' ? { issuedAt: NOW - 30_001 } : {}),
        ...(defect === 'future' ? { issuedAt: NOW + 5001 } : {}),
      })
      if (defect === 'owner') proof = { ...proof, ownerId: 'foreign-owner' }
      if (defect === 'credential') proof = { ...proof, credentialId: 'foreign-credential' }
      if (defect === 'signature') proof = { ...proof, signature: 'tampered' }
      await expect(backend.query(serviceRead, { environment: 'production', serviceAuth: proof })).rejects.toThrow('authentication_required')
      const db = { get db(): never { throw new Error('protected_db_read') } }
      await expect(readPaymentReadinessForServer(db, { environment: 'production', serviceAuth: proof })).rejects.toThrow('authentication_required')
    },
  )
  it('refuses missing service keys and returns changed-configuration failure after valid newly signed reads', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(publish, { snapshot: snapshot() })
    const proof = await serviceProof()
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', undefined)
    await expect(backend.query(serviceRead, { environment: 'production', serviceAuth: proof })).rejects.toThrow('authentication_required')
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', SERVICE_KEY)
    vi.stubEnv('CDP_WALLET_SECRET', 'rotated-wallet-secret')
    expect(await backend.query(serviceRead, { environment: 'production', serviceAuth: proof }))
      .toMatchObject({ kind: 'not_ready', code: 'readiness_configuration_changed' })
  })
})
