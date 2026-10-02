import { CdpClient } from '@coinbase/cdp-sdk'
import { getAuthHeaders } from '@coinbase/cdp-sdk/auth'
import { fetch as guardedFetch } from 'undici'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultDnsResolver } from '@/modules/network-guard/public'

import {
  cdpX402ManagedPolicyRules,
  cdpX402PolicyRulesDigest,
  readCdpX402CustodyReadiness,
  type X402AeEnvironment,
} from '@/modules/capability-supply/server'

vi.mock('@coinbase/cdp-sdk', () => ({ CdpClient: vi.fn() }))
vi.mock('@coinbase/cdp-sdk/auth', () => ({ getAuthHeaders: vi.fn() }))
vi.mock('undici', { spy: true })
const { Headers, Response } = await vi.importActual<typeof import('undici')>('undici')

const ADDRESS = `0x${'11'.repeat(20)}`
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'

function fixture(paymentEnvironment: X402AeEnvironment = 'sandbox') {
  const rules = cdpX402ManagedPolicyRules(ADDRESS, '10000', paymentEnvironment)
  const accountPolicy = { id: ACCOUNT_ID, scope: 'account' as const, rules: structuredClone(rules.accountRules) }
  const projectPolicy = { id: PROJECT_ID, scope: 'project' as const, rules: structuredClone(rules.projectRules) }
  const account = { address: ADDRESS, policies: [ACCOUNT_ID, PROJECT_ID] }
  const environment = {
    AE_X402_CUSTODY_ENABLED: 'true',
    AE_X402_CUSTODY_MAX_ATOMIC: '10000',
    AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '100000',
    CDP_API_KEY_ID: 'fixture-key-id',
    CDP_API_KEY_SECRET: 'fixture-key-secret',
    CDP_WALLET_SECRET: 'fixture-wallet-secret',
    AE_X402_CDP_ACCOUNT_NAME: 'agentic-economy-x402',
    AE_X402_CDP_EXPECTED_EVM_ADDRESS: ADDRESS,
    AE_X402_CDP_ACCOUNT_POLICY_ID: ACCOUNT_ID,
    AE_X402_CDP_PROJECT_POLICY_ID: PROJECT_ID,
    AE_X402_CDP_POLICY_RULES_DIGEST: cdpX402PolicyRulesDigest(accountPolicy, projectPolicy)!,
    AE_X402_CDP_CREDENTIAL_GENERATION: '7',
  }
  const fetch = vi.mocked(guardedFetch).mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname
    const value = path.endsWith(ACCOUNT_ID) ? accountPolicy
      : path.endsWith(PROJECT_ID) ? projectPolicy : account
    return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
  })
  return { environment, accountPolicy, projectPolicy, account, fetch }
}

beforeEach(() => {
  vi.mocked(getAuthHeaders).mockImplementation(async ({ apiKeyId }) => ({ Authorization: `Bearer ${apiKeyId}` }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('read-only CDP custody readiness', () => {
  it('refuses private provider DNS answers through the actual guarded transport', async () => {
    const f = fixture()
    vi.mocked(guardedFetch).mockImplementation((await vi.importActual<typeof import('undici')>('undici')).fetch)
    const dns = vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    expect(await readCdpX402CustodyReadiness(f.environment, 'sandbox')).toEqual({
      kind: 'unavailable', code: 'cdp_custody_read_unavailable',
    })
    expect(dns).toHaveBeenCalledWith('api.cdp.coinbase.com')
    expect(CdpClient).not.toHaveBeenCalled()
  })

  it('cancels stalled provider DNS at the shared deadline and releases its transport', async () => {
    const f = fixture()
    vi.mocked(guardedFetch).mockImplementation((await vi.importActual<typeof import('undici')>('undici')).fetch)
    const controller = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    let started!: () => void
    const lookupStarted = new Promise<void>(resolve => { started = resolve })
    vi.spyOn(defaultDnsResolver, 'lookup').mockImplementation(async () => {
      started()
      return await new Promise(() => {})
    })
    const pending = readCdpX402CustodyReadiness(f.environment, 'sandbox')
    await lookupStarted
    controller.abort(new Error('fixture_deadline'))
    expect(await pending).toEqual({ kind: 'unavailable', code: 'cdp_custody_read_unavailable' })
    expect(CdpClient).not.toHaveBeenCalled()
  })

  it.each(['sandbox', 'production'] as const)('reads exact live %s custody without signing or provisioning', async (paymentEnvironment) => {
    const f = fixture(paymentEnvironment)
    expect(await readCdpX402CustodyReadiness(f.environment, paymentEnvironment)).toEqual({
      kind: 'ready', address: ADDRESS, policyRulesDigest: f.environment.AE_X402_CDP_POLICY_RULES_DIGEST,
    })
    expect(f.fetch.mock.calls.map(([input]) => String(input)).sort()).toEqual([
      `https://api.cdp.coinbase.com/platform/v2/evm/accounts/by-name/agentic-economy-x402`,
      `https://api.cdp.coinbase.com/platform/v2/policy-engine/policies/${ACCOUNT_ID}`,
      `https://api.cdp.coinbase.com/platform/v2/policy-engine/policies/${PROJECT_ID}`,
    ].sort())
    const signal = f.fetch.mock.calls[0]?.[1]?.signal
    for (const [, options] of f.fetch.mock.calls) {
      expect(options).toMatchObject({ method: 'GET', redirect: 'error', signal })
    }
    expect(vi.mocked(getAuthHeaders).mock.calls.every(([options]) => options.walletSecret === undefined)).toBe(true)
    expect(CdpClient).not.toHaveBeenCalled()
  })

  it.each(['disabled', 'missing secret', 'unsafe account name', 'unsupported environment'] as const)(
    'refuses %s before network access', async (failure) => {
      const f = fixture()
      const environment = { ...f.environment,
        ...(failure === 'disabled' ? { AE_X402_CUSTODY_ENABLED: 'false' } : {}),
        ...(failure === 'missing secret' ? { CDP_API_KEY_SECRET: '' } : {}),
        ...(failure === 'unsafe account name' ? { AE_X402_CDP_ACCOUNT_NAME: '../accounts' } : {}),
      }
      expect(await readCdpX402CustodyReadiness(environment,
        failure === 'unsupported environment' ? 'other' as X402AeEnvironment : 'sandbox')).toMatchObject({ kind: 'refused' })
      expect(f.fetch).not.toHaveBeenCalled()
      expect(getAuthHeaders).not.toHaveBeenCalled()
    },
  )

  it.each(['policy id', 'policy scope', 'policy digest'] as const)('refuses %s drift before account lookup', async (failure) => {
    const f = fixture()
    if (failure === 'policy id') f.accountPolicy.id = PROJECT_ID
    if (failure === 'policy scope') Object.assign(f.accountPolicy, { scope: 'project' })
    if (failure === 'policy digest') f.environment.AE_X402_CDP_POLICY_RULES_DIGEST = `sha256:${'f'.repeat(64)}`
    expect(await readCdpX402CustodyReadiness(f.environment, 'sandbox')).toEqual({ kind: 'refused', code: 'cdp_custody_policy_mismatch' })
    expect(f.fetch).toHaveBeenCalledTimes(2)
  })

  it.each(['missing account policy', 'missing project policy', 'wrong address'] as const)('refuses %s', async (failure) => {
    const f = fixture()
    if (failure === 'missing account policy') f.account.policies = [PROJECT_ID]
    if (failure === 'missing project policy') f.account.policies = [ACCOUNT_ID]
    if (failure === 'wrong address') f.account.address = `0x${'22'.repeat(20)}`
    expect(await readCdpX402CustodyReadiness(f.environment, 'sandbox')).toEqual({ kind: 'refused', code: 'cdp_custody_account_mismatch' })
  })

  it.each(['crossed network', 'changed maximum', 'broad accept'] as const)(
    'refuses %s even when its document digest is resealed', async (failure) => {
      const f = fixture()
      if (failure === 'crossed network') {
        const rules = cdpX402ManagedPolicyRules(ADDRESS, '10000', 'production')
        f.accountPolicy.rules = rules.accountRules
        f.projectPolicy.rules = rules.projectRules
      }
      if (failure === 'changed maximum') f.environment.AE_X402_CUSTODY_MAX_ATOMIC = '10001'
      if (failure === 'broad accept') f.projectPolicy.rules = [{ action: 'accept', operation: 'signEvmTypedData', criteria: [] }]
      f.environment.AE_X402_CDP_POLICY_RULES_DIGEST = cdpX402PolicyRulesDigest(f.accountPolicy, f.projectPolicy)!
      expect(await readCdpX402CustodyReadiness(f.environment, 'sandbox')).toEqual({ kind: 'refused', code: 'cdp_custody_policy_mismatch' })
    },
  )

  it.each([404, 403, 429, 503])('handles provider HTTP %s with a safe typed result and no retries', async (status) => {
    const f = fixture()
    f.fetch.mockImplementation(async () => new Response('private provider response', { status }))
    expect(await readCdpX402CustodyReadiness(f.environment, 'sandbox')).toEqual(status === 404
      ? { kind: 'refused', code: 'cdp_custody_not_found' }
      : { kind: 'unavailable', code: 'cdp_custody_read_unavailable' })
    expect(f.fetch).toHaveBeenCalledTimes(2)
  })

  it('returns unavailable on malformed policy JSON without logging its contents', async () => {
    const f = fixture()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    f.fetch.mockImplementation(async () => new Response('{private-fixture-key-secret'))
    expect(await readCdpX402CustodyReadiness(f.environment, 'sandbox')).toEqual({ kind: 'unavailable', code: 'cdp_custody_response_invalid' })
    expect(JSON.stringify(error.mock.calls)).not.toContain('private-fixture-key-secret')
  })

  it('narrows a malformed policy response before using its fields', async () => {
    const f = fixture()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    f.fetch.mockImplementation(async () => new Response(JSON.stringify({ id: 123, scope: 'account', rules: [] })))
    expect(await readCdpX402CustodyReadiness(f.environment, 'sandbox')).toEqual({ kind: 'unavailable', code: 'cdp_custody_response_invalid' })
    expect(f.fetch).toHaveBeenCalledTimes(2)
  })

  it('does not expose authentication failure details in results or logs', async () => {
    const f = fixture()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(getAuthHeaders).mockRejectedValue(new Error('fixture-key-secret fixture-wallet-secret'))
    expect(await readCdpX402CustodyReadiness(f.environment, 'sandbox')).toEqual({ kind: 'unavailable', code: 'cdp_custody_read_unavailable' })
    expect(f.fetch).not.toHaveBeenCalled()
    expect(JSON.stringify(error.mock.calls)).not.toContain('fixture-key-secret')
    expect(JSON.stringify(error.mock.calls)).not.toContain('fixture-wallet-secret')
  })

  it('rejects an oversized body before accepting any custody data', async () => {
    const f = fixture()
    f.fetch.mockImplementation(async () => new Response(' '.repeat(64 * 1024 + 1)))
    expect(await readCdpX402CustodyReadiness(f.environment, 'sandbox')).toEqual({ kind: 'unavailable', code: 'cdp_custody_response_invalid' })
  })

  it('cancels a partial response body at the one shared deadline and never reads the account', async () => {
    const f = fixture()
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let bodyStarted!: () => void
    const started = new Promise<void>((resolve) => { bodyStarted = resolve })
    f.fetch.mockImplementation(async (_input, options) => new Response(new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new TextEncoder().encode('{"id":'))
        options?.signal?.addEventListener('abort', () => stream.error(options?.signal?.reason), { once: true })
        bodyStarted()
      },
    })))
    const pending = readCdpX402CustodyReadiness(f.environment, 'sandbox')
    await started
    controller.abort(new Error('private-provider-detail'))
    expect(await pending).toEqual({ kind: 'unavailable', code: 'cdp_custody_read_unavailable' })
    expect(timeout).toHaveBeenCalledTimes(1)
    expect(timeout).toHaveBeenCalledWith(10_000)
    expect(f.fetch).toHaveBeenCalledTimes(2)
    expect(CdpClient).not.toHaveBeenCalled()
  })

  it('keeps concurrent readiness credentials isolated', async () => {
    const f = fixture()
    const dns = vi.spyOn(defaultDnsResolver, 'lookup').mockRejectedValue(new Error('unexpected_live_dns'))
    const results = await Promise.all([
      readCdpX402CustodyReadiness({ ...f.environment, CDP_API_KEY_ID: 'first-key' }, 'sandbox'),
      readCdpX402CustodyReadiness({ ...f.environment, CDP_API_KEY_ID: 'second-key' }, 'sandbox'),
    ])
    expect(dns).not.toHaveBeenCalled()
    expect(getAuthHeaders).toHaveBeenCalledTimes(6)
    expect(f.fetch).toHaveBeenCalledTimes(6)
    expect(results.map((result) => result.kind)).toEqual(['ready', 'ready'])
    expect(f.fetch.mock.calls.map(([, options]) => new Headers(options?.headers).get('Authorization')).sort())
      .toEqual(['Bearer first-key', 'Bearer first-key', 'Bearer first-key', 'Bearer second-key', 'Bearer second-key', 'Bearer second-key'].sort())
  })
})
