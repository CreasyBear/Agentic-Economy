import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActionCtx } from '../../../convex/_generated/server'
import { readWebConfiguration, refreshPaymentReadiness } from '../../../convex/lib/money/readiness/refresh'
import {
  backendPaymentReadinessDigest, validPaymentReadinessSnapshot,
  type PaymentReadinessChecks, type PaymentReadinessSnapshot,
} from '@/modules/money/payment-readiness'
import { readX402PayeeScreeningReadiness } from '@/modules/money/x402-payee-screening.server'

// Only external reads and the ActionCtx persistence boundary are fixtures.
// Environment parsing, snapshot sealing, expiry and sanctions readiness run real code.
const io = vi.hoisted(() => ({ web: vi.fn(), cdp: vi.fn(), ledger: vi.fn(), createLedger: vi.fn(), chain: vi.fn() }))
vi.mock('@/modules/network-guard/server', () => ({ sendGuardedHttpRequest: io.web }))
vi.mock('@/modules/capability-supply/server', async importOriginal => ({
  ...await importOriginal<typeof import('@/modules/capability-supply/server')>(),
  readCdpX402CustodyReadiness: io.cdp,
}))
vi.mock('@/modules/money/formance', async importOriginal => ({
  ...await importOriginal<typeof import('@/modules/money/formance')>(),
  createFormanceContext: io.createLedger,
  readFormanceHealth: io.ledger,
}))
vi.mock('../../../convex/lib/money/treasury/chainObservation', () => ({ readTreasuryChainObservation: io.chain }))

type SourceChecks = Pick<PaymentReadinessChecks, 'reference_rate' | 'commercial_policy' | 'treasury'>
const NOW = Date.UTC(2026, 9, 1, 12)
const ADDRESS = `0x${'11'.repeat(20)}`
const ENVIRONMENT = {
  AE_DEPLOYMENT_ENVIRONMENT: 'development', AE_FORMANCE_ENVIRONMENT: 'sandbox',
  AE_SITE_URL: 'https://app.example.test', SITE_URL: '', CONVEX_CLOUD_URL: 'https://fixture.convex.cloud',
  AE_FORMANCE_GATEWAY_URL: 'https://ledger.example.test', AE_FORMANCE_LEDGER: 'readiness-fixture',
  AE_FORMANCE_ACCESS_CLIENT_ID: 'private-ledger-id', AE_FORMANCE_ACCESS_CLIENT_SECRET: 'private-ledger-secret',
  AE_FORMANCE_REQUEST_TIMEOUT_MS: '5000',
  AE_X402_CUSTODY_ENABLED: 'true', AE_X402_CUSTODY_MAX_ATOMIC: '10000', AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '100000',
  CDP_API_KEY_ID: 'private-cdp-id', CDP_API_KEY_SECRET: 'private-cdp-secret', CDP_WALLET_SECRET: 'private-wallet-secret',
  AE_X402_CDP_ACCOUNT_NAME: 'readiness-fixture', AE_X402_CDP_EXPECTED_EVM_ADDRESS: ADDRESS,
  AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-4111-8111-111111111111',
  AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-4222-8222-222222222222',
  AE_X402_CDP_POLICY_RULES_DIGEST: `sha256:${'a'.repeat(64)}`, AE_X402_CDP_CREDENTIAL_GENERATION: '7',
}
function webBody() {
  return { status: 'ready', checks: { config: 'ready', convex: 'ready' },
    deployment: { paymentEnvironment: 'sandbox', convexOrigin: 'https://fixture.convex.cloud' } }
}
function actionFixture() {
  const sources: SourceChecks = {
    reference_rate: { kind: 'passed', validUntil: NOW + 20_000 },
    commercial_policy: { kind: 'passed', validUntil: NOW + 30_000 },
    treasury: { kind: 'passed', validUntil: NOW + 40_000 },
  }
  const runQuery = vi.fn(async (_reference: Parameters<ActionCtx['runQuery']>[0], _args: unknown) => sources)
  const runMutation = vi.fn(async (_reference: Parameters<ActionCtx['runMutation']>[0], _args: { snapshot: PaymentReadinessSnapshot }): Promise<Awaited<ReturnType<typeof refreshPaymentReadiness>>> =>
    ({ kind: 'published' as const, replayed: false }))
  const ctx = { runQuery, runMutation } as unknown as ActionCtx
  const snapshot = () => {
    const value = runMutation.mock.calls[0]?.[1].snapshot
    if (value === undefined) throw new Error('readiness_snapshot_not_published')
    return value
  }
  return { ctx, sources, runQuery, runMutation, snapshot }
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  for (const [name, value] of Object.entries(ENVIRONMENT)) vi.stubEnv(name, value)
  io.web.mockImplementation(async () => Response.json(webBody()))
  io.cdp.mockResolvedValue({ kind: 'ready', address: ADDRESS, policyRulesDigest: ENVIRONMENT.AE_X402_CDP_POLICY_RULES_DIGEST })
  io.createLedger.mockImplementation(configuration => ({ configuration }))
  io.ledger.mockResolvedValue({ kind: 'ready' })
  io.chain.mockResolvedValue({ kind: 'observed', blockTimestamp: NOW - 20_000 })
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetAllMocks() })

describe('payment readiness read-only refresh', () => {
  it('publishes exactly eight sealed checks retaining each source expiry and real unsupported sanctions', async () => {
    const f = actionFixture()
    expect(await refreshPaymentReadiness(f.ctx)).toEqual({ kind: 'published', replayed: false })
    const snapshot = f.snapshot()
    expect(Object.keys(snapshot.checks).sort()).toEqual([
      'base_rpc', 'cdp_custody', 'commercial_policy', 'formance', 'reference_rate', 'sanctions', 'treasury', 'web_configuration',
    ])
    expect(snapshot).toMatchObject({ environment: 'sandbox', startedAt: NOW, completedAt: NOW, expiresAt: NOW + 20_000,
      configurationDigest: backendPaymentReadinessDigest(process.env), checks: {
        reference_rate: f.sources.reference_rate, commercial_policy: f.sources.commercial_policy, treasury: f.sources.treasury,
        base_rpc: { kind: 'passed', validUntil: NOW + 580_000 },
        cdp_custody: { kind: 'passed', validUntil: NOW + 600_000 },
        sanctions: { kind: 'failed', code: 'trm_tenant_contract_unavailable' },
      } })
    expect(readX402PayeeScreeningReadiness()).toEqual({ kind: 'unavailable', code: 'trm_tenant_contract_unavailable' })
    expect(validPaymentReadinessSnapshot(snapshot, NOW)).toBe(true)
    expect(f.runQuery).toHaveBeenCalledTimes(1)
    expect(getFunctionName(f.runQuery.mock.calls[0]![0])).toBe('moneyReadiness:readSourceChecks')
    expect(f.runQuery.mock.calls[0]?.[1]).toEqual({ environment: 'sandbox', now: NOW })
    expect(f.runMutation).toHaveBeenCalledTimes(1)
    expect(getFunctionName(f.runMutation.mock.calls[0]![0])).toBe('moneyReadiness:publish')
    expect(JSON.stringify(snapshot)).not.toContain('private-')
    expect(io.createLedger.mock.calls[0]?.[0]).toMatchObject({ environment: 'sandbox', requestTimeoutMs: 5_000 })
    expect(io.createLedger.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
    expect(io.chain).toHaveBeenCalledWith({ environment: 'sandbox', address: ADDRESS, now: NOW })
  })

  it('records expiry during I/O as failure without extending surviving evidence', async () => {
    const f = actionFixture()
    io.web.mockImplementation(async () => {
      vi.mocked(Date.now).mockReturnValue(NOW + 25_000)
      return Response.json(webBody())
    })
    await refreshPaymentReadiness(f.ctx)
    expect(f.snapshot()).toMatchObject({ startedAt: NOW, completedAt: NOW + 25_000, expiresAt: NOW + 30_000,
      checks: { reference_rate: { kind: 'failed', code: 'readiness_source_expired' },
        commercial_policy: { kind: 'passed', validUntil: NOW + 30_000 }, treasury: f.sources.treasury } })
    expect(validPaymentReadinessSnapshot(f.snapshot(), NOW + 25_000)).toBe(true)
  })

  it('sends only a bounded unauthenticated GET to the configured web origin', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    expect(await readWebConfiguration(ENVIRONMENT, 'sandbox', NOW + 1000)).toEqual({ kind: 'passed', validUntil: NOW + 1000 })
    const [request, limit] = io.web.mock.calls[0] as [Request, number]
    expect(request.url).toBe('https://app.example.test/api/ready')
    expect(request.method).toBe('GET')
    expect(request.body).toBeNull()
    expect([...request.headers]).toEqual([['accept', 'application/json']])
    expect(limit).toBe(32 * 1024)
    expect(timeout).toHaveBeenCalledWith(5_000)
    expect(request.signal).toBeInstanceOf(AbortSignal)
  })

  it.each(['wrong backend', 'wrong environment', 'unready configuration', 'unready Convex', 'missing deployment', 'non-200', 'malformed JSON', 'network error'] as const)(
    'fails web readiness for %s', async (failure) => {
      const body: Record<string, unknown> = webBody()
      if (failure === 'wrong backend') body.deployment = { paymentEnvironment: 'sandbox', convexOrigin: 'https://other.convex.cloud' }
      if (failure === 'wrong environment') body.deployment = { paymentEnvironment: 'production', convexOrigin: 'https://fixture.convex.cloud' }
      if (failure === 'unready configuration') body.checks = { config: 'unavailable', convex: 'ready' }
      if (failure === 'unready Convex') body.checks = { config: 'ready', convex: 'unavailable' }
      if (failure === 'missing deployment') delete body.deployment
      if (failure === 'network error') io.web.mockRejectedValue(new Error('private-web-error'))
      else io.web.mockResolvedValue(failure === 'malformed JSON' ? new Response('{invalid')
        : Response.json(body, { status: failure === 'non-200' ? 503 : 200 }))
      expect(await readWebConfiguration(ENVIRONMENT, 'sandbox', NOW + 1000)).toMatchObject({ kind: 'failed' })
    },
  )

  it.each(['https://user:private@example.test', 'http://app.example.test', 'https://app.example.test/other', 'https://app.example.test/?secret=value'])(
    'refuses unsafe web URL %s before request', async site => {
      expect(await readWebConfiguration({ ...ENVIRONMENT, AE_SITE_URL: site }, 'sandbox', NOW + 1000)).toEqual({ kind: 'failed', code: 'web_readiness_configuration_invalid' })
      expect(io.web).not.toHaveBeenCalled()
    },
  )

  it.each(['http://fixture.convex.cloud', 'https://user:private@fixture.convex.cloud',
    'https://fixture.convex.cloud/other', 'https://fixture.convex.cloud/?secret=value', 'https://fixture.convex.cloud/#other'])(
    'refuses unsafe expected backend URL %s before request', async convex => {
      expect(await readWebConfiguration({ ...ENVIRONMENT, CONVEX_CLOUD_URL: convex }, 'sandbox', NOW + 1000)).toEqual({ kind: 'failed', code: 'web_readiness_configuration_invalid' })
      expect(io.web).not.toHaveBeenCalled()
    },
  )

  it('publishes an all-failed observation rather than retaining or inventing green checks', async () => {
    const f = actionFixture()
    io.web.mockRejectedValue(new Error('network-down'))
    io.ledger.mockResolvedValue({ kind: 'unavailable', code: 'formance_health_unavailable' })
    io.cdp.mockResolvedValue({ kind: 'unavailable', code: 'cdp_custody_read_unavailable' })
    io.chain.mockResolvedValue({ kind: 'unavailable', code: 'treasury_rpc_unavailable' })
    for (const key of ['reference_rate', 'commercial_policy', 'treasury'] as const) f.sources[key] = { kind: 'failed', code: 'source_unavailable' }
    await refreshPaymentReadiness(f.ctx)
    expect(Object.values(f.snapshot().checks).every(check => check.kind === 'failed')).toBe(true)
    expect(validPaymentReadinessSnapshot(f.snapshot(), NOW)).toBe(true)
    expect(f.runMutation).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, 'preview', ' production '])('requires explicit supported deployment %j and performs no I/O or write otherwise', async deployment => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', deployment)
    const f = actionFixture()
    expect(await refreshPaymentReadiness(f.ctx)).toEqual({ kind: 'refused', code: 'readiness_environment_mismatch' })
    expect(f.runQuery).not.toHaveBeenCalled()
    expect(f.runMutation).not.toHaveBeenCalled()
    expect(io.web).not.toHaveBeenCalled()
    expect(io.cdp).not.toHaveBeenCalled()
    expect(io.ledger).not.toHaveBeenCalled()
    expect(io.chain).not.toHaveBeenCalled()
  })

  it('does not probe the chain when explicit CDP custody configuration is missing', async () => {
    vi.stubEnv('CDP_API_KEY_SECRET', undefined)
    io.cdp.mockResolvedValue({ kind: 'refused', code: 'cdp_custody_configuration_invalid' })
    const f = actionFixture()
    await refreshPaymentReadiness(f.ctx)
    expect(io.chain).not.toHaveBeenCalled()
    expect(f.snapshot().checks.base_rpc).toEqual({ kind: 'failed', code: 'treasury_chain_configuration_invalid' })
    expect(f.snapshot().checks.cdp_custody).toEqual({ kind: 'failed', code: 'cdp_custody_configuration_invalid' })
  })

  it.each(['formance', 'cdp', 'chain', 'source query'] as const)('publishes named failure when %s rejects without exposing provider details', async boundary => {
    const f = actionFixture()
    const cause = new Error('private-provider-key private-wallet-secret')
    if (boundary === 'formance') io.ledger.mockRejectedValue(cause)
    if (boundary === 'cdp') io.cdp.mockRejectedValue(cause)
    if (boundary === 'chain') io.chain.mockRejectedValue(cause)
    if (boundary === 'source query') f.runQuery.mockRejectedValue(cause)
    expect(await refreshPaymentReadiness(f.ctx)).toEqual({ kind: 'published', replayed: false })
    const checks = f.snapshot().checks
    if (boundary === 'formance') expect(checks.formance).toEqual({ kind: 'failed', code: 'formance_readiness_unavailable' })
    if (boundary === 'cdp') expect(checks.cdp_custody).toEqual({ kind: 'failed', code: 'cdp_custody_read_unavailable' })
    if (boundary === 'chain') expect(checks.base_rpc).toEqual({ kind: 'failed', code: 'treasury_rpc_unavailable' })
    if (boundary === 'source query') for (const key of ['reference_rate', 'commercial_policy', 'treasury'] as const) {
      expect(checks[key]).toEqual({ kind: 'failed', code: 'readiness_source_unavailable' })
    }
    expect(JSON.stringify(f.snapshot())).not.toContain('private-provider-key')
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-provider-key')
  })

  it('returns transaction refusal unchanged and never retries an alternative publication', async () => {
    const f = actionFixture()
    f.runMutation.mockResolvedValue({ kind: 'refused', code: 'readiness_configuration_changed' })
    expect(await refreshPaymentReadiness(f.ctx)).toEqual({ kind: 'refused', code: 'readiness_configuration_changed' })
    expect(f.runMutation).toHaveBeenCalledTimes(1)
  })

  it('propagates publication failure without fabricating successful readiness', async () => {
    const f = actionFixture()
    f.runMutation.mockRejectedValue(new Error('publication unavailable'))
    await expect(refreshPaymentReadiness(f.ctx)).rejects.toThrow('publication unavailable')
    expect(f.runMutation).toHaveBeenCalledTimes(1)
  })
})

describe('web static subset from aggregate readiness diagnostics', () => {
  function diagnostic() {
    return { type: 'about:blank', title: 'Unavailable', detail: 'Required server readiness checks did not pass.',
      status: 503, kind: 'UNAVAILABLE', code: 'server_not_ready', retryable: true,
      checks: { config: 'ready', convex: 'ready', payments: { status: 'failed', code: 'payments_unavailable' } },
      deployment: { paymentEnvironment: 'sandbox', convexOrigin: 'https://fixture.convex.cloud' } }
  }
  it('publishes static web pass from a genuine aggregate503 while preserving unsupported sanctions failure', async () => {
    io.web.mockResolvedValue(Response.json(diagnostic(), { status: 503, headers: { 'content-type': 'application/problem+json' } }))
    const f = actionFixture()
    await refreshPaymentReadiness(f.ctx)
    expect(f.snapshot().checks.web_configuration).toEqual({ kind: 'passed', validUntil: NOW + 600_000 })
    expect(f.snapshot().checks.sanctions).toEqual({ kind: 'failed', code: 'trm_tenant_contract_unavailable' })
  })
  it.each(['code', 'type', 'kind', 'body_status', 'content_type', 'static', 'world', 'origin', 'redirect'] as const)(
    'refuses an invalid503 %s without converting it into static readiness', async defect => {
      const body = diagnostic()
      if (defect === 'code') body.code = 'gateway_unavailable'
      if (defect === 'type') body.type = 'https://foreign.example/problem'
      if (defect === 'kind') body.kind = 'INVALID_ARGUMENT'
      if (defect === 'body_status') body.status = 500
      if (defect === 'static') body.checks.config = 'failed'
      if (defect === 'world') body.deployment.paymentEnvironment = 'production'
      if (defect === 'origin') body.deployment.convexOrigin = 'https://foreign.convex.cloud'
      const response = Response.json(body, { status: 503, headers: { 'content-type': defect === 'content_type' ? 'application/json' : 'application/problem+json' } })
      if (defect === 'redirect') Object.defineProperty(response, 'redirected', { value: true })
      io.web.mockResolvedValue(response)
      expect(await readWebConfiguration(process.env, 'sandbox', NOW + 60_000)).toMatchObject({ kind: 'failed' })
    },
  )
})
