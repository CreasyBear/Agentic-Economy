import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  captureClientError: vi.fn((payload: unknown) => {
    void payload
  }),
  captureServerException: vi.fn(),
}))
vi.mock('@/lib/observability/sentry.server', () => mocks)

import { handleHealthRequest } from '@/routes/api.health'
import { handleReadyRequest, Route as ReadyRoute } from '@/routes/api.ready'
import { handleClientErrorRequest, Route as ClientErrorRoute } from '@/routes/api.observability.client-error'
import { readNamesOnlyReadinessDiagnostics, readServerReadiness } from '@/lib/server/readiness'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { SOURCE_WRITE_FAMILIES } from '@/lib/deployment/manifest'

const secret = 'iak1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

function clientRequest(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request('https://ae.example/api/observability/client-error', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-ae-request-id': 'corr_client_1',
      ...headers,
    },
  })
}
function productionReadinessEnvironment(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    CONVEX_URL: 'https://convex.example',
    AE_CONVEX_SERVER_FUNCTION_TOKEN: 'convex-server-function-token-long-enough',
    AE_CANONICAL_BASE_URL: 'https://ae.example',
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_example',
    CLERK_SECRET_KEY: 'sk_live_example',
    CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_live_example',
    CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.example',
    OPENROUTER_API_KEY: 'openrouter-example',
    AE_LLM_MODEL: 'test/provider-model',
    AE_CHAT_PROXY_SECRET: 'test-chat-proxy-value-long-enough-for-production-shape',
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
    STRIPE_WEBHOOK_SECRET: 'whsec_example',
    STRIPE_V2_WEBHOOK_SECRET: 'whsec_v2_example',
    STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID: 'txr_au_gst_10_inclusive',
    AE_FORMANCE_ENVIRONMENT: 'production',
    AE_FORMANCE_GATEWAY_URL: 'https://formance.example.com',
    AE_FORMANCE_LEDGER: 'agentic-economy-production',
    AE_FORMANCE_REQUEST_TIMEOUT_MS: '10000',
    AE_FORMANCE_ACCESS_CLIENT_ID: 'access-client-id',
    AE_FORMANCE_ACCESS_CLIENT_SECRET: 'access-client-secret',
    ...Object.fromEntries(SOURCE_WRITE_FAMILIES.map((family) => [
      `AE_SOURCE_WRITE_KEY_${family.toUpperCase()}`,
      `${family}:0123456789abcdef0123456789abcdef`,
    ])),
  }
}

describe('operational diagnostics routes', () => {
  beforeEach(() => {
    vi.stubEnv('SENTRY_DSN', 'https://public@example.ingest.sentry.io/1')
    vi.stubEnv('AE_DISABLE_OBSERVABILITY', 'false')
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    mocks.captureClientError.mockClear()
    mocks.captureServerException.mockClear()
  })

  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
    vi.unstubAllEnvs()
  })

  it('returns liveness without probing Convex and propagates correlation', async () => {
    const response = await handleHealthRequest(new Request('https://ae.example/api/health', {
      headers: { 'x-ae-request-id': 'corr_health_1' },
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-ae-request-id')).toBe('corr_health_1')
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
    const head = await handleHealthRequest(new Request('https://ae.example/api/health', {
      headers: { 'x-ae-request-id': 'corr_health_1' },
    }), true)
    expect(head.status).toBe(200)
    await expect(head.text()).resolves.toBe('')
  })

  it('reports readiness when validated config and Convex reachability pass', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    const result = await readServerReadiness({
      env: productionReadinessEnvironment(),
      fetch: fetchImpl,
      nodeMajor: 22,
    })

    expect(result).toMatchObject({ status: 'ready', checks: { config: { status: 'ready' }, convex: { status: 'ready' } } })
    expect(result.diagnostics.configuration.required).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'convex',
        status: 'ready',
        names: expect.arrayContaining([{ name: 'CONVEX_URL', configured: true }]),
      }),
    ]))
    expect(JSON.stringify(result.diagnostics)).not.toContain('convex.example')
    expect(JSON.stringify(result.diagnostics)).not.toContain('source-write-secret')
    expect(JSON.stringify(result.diagnostics)).not.toContain('rk_live_command_example')
    expect(JSON.stringify(result.diagnostics)).not.toContain('rk_live_readback_example')
    expect(JSON.stringify(result.diagnostics)).not.toContain('cdp-key-secret')
    expect(JSON.stringify(result.diagnostics)).not.toContain('cdp-wallet-secret')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('projects public ready state without internal deployment inventory', async () => {
    const response = await handleReadyRequest(
      new Request('https://ae.example/api/ready'),
      {
        env: { NODE_ENV: 'test', CONVEX_URL: 'https://convex.example' },
        fetch: vi.fn(async () => new Response(null, { status: 200 })),
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(body).toEqual({
      status: 'ready',
      checks: { config: 'ready', convex: 'ready' },
    })
    const serialized = JSON.stringify(body)
    for (const internalName of ['diagnostics', 'CONVEX_URL', 'SENTRY_DSN', 'release-readback', 'source-authority']) {
      expect(serialized).not.toContain(internalName)
    }
  })

  it('projects ready and degraded HEAD responses without a body', async () => {
    const request = (correlationId: string) => new Request('https://ae.example/api/ready', {
      method: 'HEAD',
      headers: { 'x-ae-request-id': correlationId },
    })
    const options = (status: number) => ({
      env: { NODE_ENV: 'test', CONVEX_URL: 'https://convex.example' },
      fetch: vi.fn(async () => new Response(null, { status })),
    })

    const ready = await handleReadyRequest(request('corr_ready_head'), options(200), true)
    expect(ready.status).toBe(200)
    expect(ready.headers.get('cache-control')).toBe('no-store')
    expect(ready.headers.get('content-type')).toBe('application/json')
    expect(ready.headers.get('x-ae-request-id')).toBe('corr_ready_head')
    await expect(ready.text()).resolves.toBe('')

    const degraded = await handleReadyRequest(request('corr_degraded_head'), options(503), true)
    expect(degraded.status).toBe(503)
    expect(degraded.headers.get('cache-control')).toBe('no-store')
    expect(degraded.headers.get('content-type')).toBe('application/problem+json')
    expect(degraded.headers.get('x-ae-request-id')).toBe('corr_degraded_head')
    await expect(degraded.text()).resolves.toBe('')
  })

  it('projects config diagnostics as names and booleans only', () => {
    const configuredSecret = 'openrouter-test-secret-value'
    const diagnostics = readNamesOnlyReadinessDiagnostics({
      NODE_ENV: 'production',
      CONVEX_URL: 'https://convex.example',
      OPENROUTER_API_KEY: configuredSecret,
    }, 22)
    expect(diagnostics.configuration.required).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'convex',
        names: expect.arrayContaining([
          { name: 'CONVEX_URL', configured: true },
          { name: 'VITE_CONVEX_URL', configured: false },
        ]),
      }),
    ]))
    const serialized = JSON.stringify(diagnostics)
    expect(serialized).not.toContain('https://convex.example')
    expect(serialized).not.toContain(configuredSecret)
    expect(serialized).toContain('OPENROUTER_API_KEY')
    expect(serialized).toContain('secret_key_id_without_secret')
  })
  it('fails closed for deployment mode conflicts and credential-bearing Convex URLs', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    await expect(readServerReadiness({
      env: { NODE_ENV: 'test', VERCEL_ENV: 'production', CONVEX_URL: 'https://convex.example' },
      fetch: fetchImpl,
    })).resolves.toMatchObject({
      status: 'not_ready',
      checks: { config: { status: 'failed', code: 'deployment_environment_conflict' } },
    })
    expect(fetchImpl).not.toHaveBeenCalled()

    await expect(readServerReadiness({
      env: { NODE_ENV: 'test', CONVEX_URL: 'https://convex.example?token=secret' },
      fetch: fetchImpl,
    })).resolves.toMatchObject({
      status: 'not_ready',
      checks: { config: { status: 'failed', code: 'convex_url_invalid' } },
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })


  it('fails readiness closed for missing config and Convex probe failure', async () => {
    const skippedFetch = vi.fn()
    await expect(readServerReadiness({ env: {}, fetch: skippedFetch })).resolves.toMatchObject({
      status: 'not_ready',
      checks: { config: { status: 'failed', code: 'convex_url_missing' } },
    })
    expect(skippedFetch).not.toHaveBeenCalled()

    const failedFetch = vi.fn(async () => new Response(null, { status: 503 }))
    const routeResponse = await handleReadyRequest(
      new Request('https://ae.example/api/ready', { headers: { 'x-ae-request-id': 'corr_ready_1' } }),
      { env: { NODE_ENV: 'test', CONVEX_URL: 'https://convex.example' }, fetch: failedFetch },
    )
    expect(routeResponse.status).toBe(503)
    expect(routeResponse.headers.get('content-type')).toBe('application/problem+json')
    expect(routeResponse.headers.get('x-ae-request-id')).toBe('corr_ready_1')
    expect(routeResponse.headers.get('cache-control')).toBe('no-store')
    const body = await routeResponse.json()
    expect(body).toEqual({
      type: 'about:blank',
      title: 'Unavailable',
      status: 503,
      detail: 'Required server readiness checks did not pass.',
      kind: 'UNAVAILABLE',
      code: 'server_not_ready',
      retryable: true,
      checks: {
        config: 'ready',
        convex: { status: 'failed', code: 'convex_probe_failed' },
      },
    })
    const serialized = JSON.stringify(body)
    for (const internalName of ['diagnostics', 'CONVEX_URL', 'SENTRY_DSN', 'release-readback', 'source-authority']) {
      expect(serialized).not.toContain(internalName)
    }
  })

  it('dispatches a normalized client error without retaining secrets or URL query values', async () => {
    const response = await handleClientErrorRequest(clientRequest(JSON.stringify({
      message: [
        `request failed token=${secret}`,
        'OPENROUTER_API_KEY=sk_live_real',
        'Authorization: Bearer bearer-real',
        'Cookie: session=cookie-real',
      ].join(' '),
      name: 'TypeError',
      stack: [
        'TypeError: Authorization: Basic basic-real',
        '-----BEGIN PRIVATE KEY-----',
        'private-key-body',
        '-----END PRIVATE KEY-----',
      ].join('\n'),
      url: `https://user:password-real@ae.example/s/${'a'.repeat(64)}?access_token=url-token&q=private`,
      source: 'window.onerror',
      metadata: { component: 'chat', route: '/t/new?access=secret' },
    })))

    expect(response.status).toBe(204)
    expect(response.headers.get('x-ae-request-id')).toBe('corr_client_1')
    expect(mocks.captureClientError).toHaveBeenCalledOnce()
    const capturedCall = mocks.captureClientError.mock.calls[0]
    if (capturedCall === undefined) throw new Error('client error capture missing')
    const captured = JSON.stringify(capturedCall[0])
    for (const secretValue of [
      secret,
      'sk_live_real',
      'bearer-real',
      'cookie-real',
      'basic-real',
      'private-key-body',
      'password-real',
      'url-token',
    ]) {
      expect(captured).not.toContain(secretValue)
    }
    expect(captured).toContain('chat')
    expect(captured).not.toContain('?access=')
    expect(captured).not.toContain('/s/' + 'a'.repeat(64))
  })

  it('rejects unsupported, oversized, malformed, and rate-limited intake', async () => {
    await expect(handleClientErrorRequest(clientRequest('{}', { 'content-type': 'text/plain' }))).resolves.toMatchObject({ status: 415 })
    await expect(handleClientErrorRequest(clientRequest('x'.repeat(17 * 1024)))).resolves.toMatchObject({ status: 413 })
    await expect(handleClientErrorRequest(clientRequest('{'))).resolves.toMatchObject({ status: 400 })

    setHttpRateLimitAdmissionForTests(async () => ({ ok: false, retryAfter: 2_000 }))
    const rateLimited = await handleClientErrorRequest(clientRequest(JSON.stringify({ message: 'hello' })))
    expect(rateLimited.status).toBe(429)
    expect(rateLimited.headers.get('retry-after')).toBe('2')
    expect(mocks.captureClientError).toHaveBeenCalledTimes(0)
  })

  it('returns 204 when telemetry is disabled and keeps wrong methods on RFC 9457', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    const disabled = await handleClientErrorRequest(clientRequest(JSON.stringify({ message: 'ignored' })))
    expect(disabled.status).toBe(204)
    expect(mocks.captureClientError).not.toHaveBeenCalled()

    const handlers = ClientErrorRoute.options.server?.handlers
    if (handlers === undefined || typeof handlers !== 'object' || handlers === null) throw new Error('client error handlers missing')
    const getHandler = Reflect.get(handlers, 'GET')
    if (typeof getHandler !== 'function') throw new Error('client error GET handler missing')
    const wrongMethod = await getHandler({
      request: new Request('https://ae.example/api/observability/client-error', { method: 'GET' }),
      params: {},
      pathname: '/api/observability/client-error',
      context: undefined,
      next: () => {
        throw new Error('unexpected route continuation')
      },
    })
    if (!(wrongMethod instanceof Response)) throw new Error('client error GET handler did not return a Response')
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('content-type')).toBe('application/problem+json')

    const readyHandlers = ReadyRoute.options.server?.handlers
    if (readyHandlers === undefined || typeof readyHandlers !== 'object' || readyHandlers === null) throw new Error('ready handlers missing')
    const postHandler = Reflect.get(readyHandlers, 'POST')
    if (typeof postHandler !== 'function') throw new Error('ready POST handler missing')
    const readyWrongMethod = await postHandler({
      request: new Request('https://ae.example/api/ready', { method: 'POST' }),
      params: {},
      pathname: '/api/ready',
      context: undefined,
      next: () => {
        throw new Error('unexpected route continuation')
      },
    })
    if (!(readyWrongMethod instanceof Response)) throw new Error('ready POST handler did not return a Response')
    await expect(readyWrongMethod.json()).resolves.toMatchObject({ status: 405, kind: 'METHOD_NOT_ALLOWED' })
  })
})
