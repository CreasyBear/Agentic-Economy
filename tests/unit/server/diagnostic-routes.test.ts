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
    CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.example',
    OPENROUTER_API_KEY: 'openrouter-example',
    AE_X402_PAYMENT_CREDENTIAL_REF: 'env:AE_X402_PAYMENT_PRIVATE_KEY',
    AE_X402_PAYMENT_PRIVATE_KEY: 'test-only-x402-payer-placeholder',
    AE_X402_RPC_URLS_JSON: '{"eip155:8453":"https://base.example/rpc"}',
    STRIPE_SECRET_KEY: 'test-only-stripe-secret',
    STRIPE_WEBHOOK_SECRET: 'test-only-stripe-webhook-secret',
    VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_example',
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
    expect(JSON.stringify(result.diagnostics)).not.toContain('test-only-x402-payer-placeholder')
    expect(JSON.stringify(result.diagnostics)).not.toContain('env:AE_X402_PAYMENT_PRIVATE_KEY')
    expect(fetchImpl).toHaveBeenCalledOnce()
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
    await expect(routeResponse.json()).resolves.toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'server_not_ready',
      checks: {
        config: 'ready',
        convex: { status: 'failed', code: 'convex_probe_failed' },
      },
    })
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
