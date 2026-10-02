import { createHmac } from 'node:crypto'
import { createMiddleware, type RequestServerNextFn, type RequestServerOptions } from '@tanstack/react-start'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readConfig: vi.fn(() => ({ enabled: true, environment: 'production', posthogHost: 'https://posthog.example' })),
  flushPostHogServer: vi.fn(async () => undefined),
  initSentryServer: vi.fn(() => true),
  captureServerException: vi.fn(),
  clerkFactory: vi.fn(),
}))
const clerkSessionError = new Error('session middleware unexpectedly handled bearer request')
vi.mock('@clerk/tanstack-react-start/server', () => ({
  clerkMiddleware: () => {
    mocks.clerkFactory()
    return createMiddleware().server(() => { throw clerkSessionError })
  },
}))

vi.mock('@/lib/observability/config', () => ({ readObservabilityServerConfig: mocks.readConfig }))
vi.mock('@/lib/observability/posthog.server', () => ({ flushPostHogServer: mocks.flushPostHogServer }))
vi.mock('@/lib/observability/sentry.server', () => ({
  captureServerException: mocks.captureServerException,
  initSentryServer: mocks.initSentryServer,
  Sentry: { withIsolationScope: vi.fn() },
}))

import { clerkPreviewOrProductionMiddleware, observabilityRequestMiddleware, securityHeadersRequestMiddleware, startInstance } from '@/start'
import { handleHealthRequest } from '@/routes/api.health'
import { handleReadyRequest } from '@/routes/api.ready'
import { handleClerkWebhookRequest } from '@/routes/api.clerk.webhook'
import { Route as ReleaseRoute } from '@/routes/api.v1.release'
import type { RouteHandler } from '@/lib/server/gateway-json-route'
import { resetBootEnvironmentValidationForTests } from '@/lib/deployment/validate-boot-env.server'
import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { DEPLOYMENT_MANIFEST, fieldRules, knownNames, SOURCE_WRITE_FAMILIES } from '@/lib/deployment/manifest'
import { CLERK_SECURITY_OBSERVE_OPERATION, type ClerkSecurityObservation, type ClerkSecurityObservationResult } from '@/modules/security/account-security'
import { verifyCustomerRequestServiceAssertion, type CustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'

// Use installed createStart/getOptions and every registered request middleware.
// Only the framework's terminal router dispatch is supplied: real diagnostics
// run behind real boot validation, correlation, security and Clerk admission.
// This harness does not install TanStack's request context. Health/readiness
// self-decorate correlation; release's middleware-only correlation needs HTTP proof.
async function throughStart(request: Request, handlerType: 'router' | 'serverFn' = 'router', terminal = vi.fn(async () => new Response('ordinary route'))): Promise<Response> {
  const options = await startInstance.getOptions()
  const pathname = new URL(request.url).pathname
  const middlewares = options.requestMiddleware ?? []
  const run = async (index: number): Promise<Response> => {
    if (index === middlewares.length) return await terminal()
    const serve = middlewares[index]?.options.server as typeof observabilityRequestMiddleware.options.server
    if (serve === undefined) return await run(index + 1)
    const next: RequestServerNextFn<Record<string, never>, undefined> = vi.fn().mockImplementation(async () => ({
      request, pathname, context: undefined, response: await run(index + 1),
    }))
    const result = await serve({ request, pathname, context: undefined, handlerType, next })
    return result instanceof Response ? result : result.response
  }
  return await run(0)
}

async function releaseResponse(request: Request): Promise<Response> {
  const handlers = ReleaseRoute.options.server?.handlers as { GET: RouteHandler; HEAD: RouteHandler } | undefined
  if (handlers === undefined) throw new Error('release route handlers missing')
  const handler = request.method === 'HEAD' ? handlers.HEAD : handlers.GET
  return await handler({ request, params: {} })
}

describe('boot and auth admission for router diagnostics', () => {
  beforeEach(() => {
    resetBootEnvironmentValidationForTests()
    mocks.clerkFactory.mockReset()
    vi.stubEnv('VERCEL', undefined)
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', undefined)
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    vi.stubEnv('CONVEX_URL', '')
    vi.stubEnv('VITE_CONVEX_URL', '')
    vi.stubEnv('AE_CANONICAL_BASE_URL', '')
    vi.stubEnv('CLERK_SECRET_KEY', 'damaged-secret-key')
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'damaged-publishable-key')
    // Commercial diagnostics use maintained source readers, with their external
    // transport replaced so an invalid-config probe cannot touch a live backend.
    setPublicSourceTransportForTests({
      query: vi.fn(async () => ({ kind: 'unavailable', refreshState: 'none' })),
      mutation: vi.fn(), action: vi.fn(),
    } as never)
  })
  afterEach(() => {
    setPublicSourceTransportForTests(undefined)
    resetBootEnvironmentValidationForTests()
    vi.unstubAllEnvs()
  })

  it.each(['missing', 'damaged', 'wrong_environment'] as const)('serves actual GET/HEAD diagnostics with %s production/auth configuration', async configuration => {
    if (configuration === 'missing') {
      vi.stubEnv('CLERK_SECRET_KEY', '')
      vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '')
    }
    if (configuration === 'wrong_environment') vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'invalid')
    vi.stubEnv('AE_RELEASE_SOURCE_REVISION', 'a'.repeat(40))
    for (const path of ['/api/health', '/api/ready', '/api/v1/release']) {
      for (const method of ['GET', 'HEAD']) {
        const request = new Request(`https://ae.example${path}`, { method, headers: { 'x-ae-request-id': 'corr_start_probe' } })
        const terminal = vi.fn(async () => path === '/api/health'
          ? await handleHealthRequest(request, method === 'HEAD')
          : path === '/api/ready'
            ? await handleReadyRequest(request, { timeoutMs: 1 }, method === 'HEAD')
            : await releaseResponse(request))
        const response = await throughStart(request, 'router', terminal)
        expect(response.status).toBe(path === '/api/ready' ? 503 : 200)
        expect(response.headers.get('cache-control')).toBe('no-store')
        if (path !== '/api/v1/release') expect(response.headers.get('x-ae-request-id')).toBe('corr_start_probe')
        expect(terminal).toHaveBeenCalledOnce()
        if (method === 'HEAD') expect(await response.text()).toBe('')
        else if (path === '/api/health') expect(await response.json()).toEqual({ status: 'ok' })
        else if (path === '/api/ready') expect(await response.json()).toMatchObject({ status: 503, code: 'server_not_ready', checks: { config: { status: 'failed' } } })
        else expect(await response.json()).toEqual({ kind: 'ok', sourceRevision: 'a'.repeat(40) })
      }
    }
    expect(mocks.clerkFactory).not.toHaveBeenCalled()
    // Diagnostics must not make the ordinary boot-validation cache succeed.
    const ordinary = vi.fn(async () => new Response('not reached'))
    await expect(throughStart(new Request('https://ae.example/about'), 'router', ordinary)).rejects.toThrow('Invalid environment configuration')
    expect(ordinary).not.toHaveBeenCalled()
  })

  it.each([
    ['explicit valid', undefined, undefined, 'a'.repeat(40), 'a'.repeat(40)],
    ['missing', undefined, undefined, undefined, undefined],
    ['malformed explicit', undefined, undefined, 'not-a-source-revision', undefined],
    ['provider only', '1', 'b'.repeat(40), undefined, 'b'.repeat(40)],
    ['matching provider', '1', 'b'.repeat(40), 'b'.repeat(40), 'b'.repeat(40)],
    ['conflicting provider', '1', 'b'.repeat(40), 'a'.repeat(40), undefined],
    ['malformed provider', '1', 'bad', 'a'.repeat(40), undefined],
    ['malformed explicit with provider', '1', 'b'.repeat(40), 'bad', undefined],
    ['non-Vercel provider ignored', undefined, 'b'.repeat(40), 'a'.repeat(40), 'a'.repeat(40)],
  ] as const)('serves the actual %s release identity despite invalid production/auth configuration', async (_kind, vercel, provider, revision, expected) => {
    vi.stubEnv('VERCEL', vercel)
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', provider)
    vi.stubEnv('AE_RELEASE_SOURCE_REVISION', revision)
    const status = expected === undefined ? 503 : 200
    for (const method of ['GET', 'HEAD']) {
      const request = new Request('https://ae.example/api/v1/release', {
        method, headers: { 'x-ae-request-id': 'corr_release_probe' },
      })
      const terminal = vi.fn(async () => await releaseResponse(request))
      const response = await throughStart(request, 'router', terminal)
      expect(response.status).toBe(status)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(terminal).toHaveBeenCalledOnce()
      if (method === 'HEAD') expect(await response.text()).toBe('')
      else expect(await response.json()).toEqual(status === 200
        ? { kind: 'ok', sourceRevision: expected }
        : { kind: 'unavailable', reason: 'source_revision_unconfigured' })
    }
    expect(mocks.clerkFactory).not.toHaveBeenCalled()
    const protectedRoute = vi.fn(async () => new Response('not reached'))
    await expect(throughStart(new Request('https://ae.example/account'), 'router', protectedRoute))
      .rejects.toThrow('Invalid environment configuration')
    expect(protectedRoute).not.toHaveBeenCalled()
  })

  it.each([
    ['/', 'GET', 'router'], ['/api/v1/tools/quote', 'POST', 'router'],
    ['/api/ready', 'POST', 'router'], ['/api/health', 'PUT', 'router'],
    ['/api/ready/', 'GET', 'router'], ['/api/ready-extra', 'GET', 'router'],
    ['/api/health/nested', 'GET', 'router'], ['/api/%72eady', 'GET', 'router'],
    ['/api/ready', 'GET', 'serverFn'], ['/api/health', 'HEAD', 'serverFn'],
    ['/api/v1/release', 'POST', 'router'], ['/api/v1/release', 'PUT', 'router'],
    ['/api/v1/release/', 'GET', 'router'], ['/api/v1/release-extra', 'GET', 'router'],
    ['/api/v1/%72elease', 'GET', 'router'], ['/api/v1/release/nested', 'GET', 'router'],
    ['/api/v1/release', 'GET', 'serverFn'], ['/api/v1/release', 'HEAD', 'serverFn'],
  ] as const)('keeps %s %s %s behind real boot validation', async (path, method, handlerType) => {
    const terminal = vi.fn(async () => new Response('not reached'))
    await expect(throughStart(new Request(`https://ae.example${path}`, { method }), handlerType, terminal))
      .rejects.toThrow('Invalid environment configuration')
    expect(terminal).not.toHaveBeenCalled()
  })

  it.each([
    ['/api/ready', '/api/%2e/ready'],
    ['/api/v1/release', '/api/v1/%2e/release'],
  ])('does not admit %s via a raw encoded dot-segment lookalike that the URL parser normalizes', async (path, rawPath) => {
    const request = new Request(`https://ae.example${path}`)
    Object.defineProperty(request, 'runtime', { value: { node: { req: { url: rawPath } } } })
    await expect(throughStart(request)).rejects.toThrow('Invalid environment configuration')
  })

  it('allows later valid ordinary validation while retaining damaged Clerk refusal on protected requests', async () => {
    vi.stubEnv('AE_RELEASE_SOURCE_REVISION', 'b'.repeat(40))
    const diagnostic = new Request('https://ae.example/api/v1/release')
    expect((await throughStart(diagnostic, 'router', vi.fn(async () => await releaseResponse(diagnostic)))).status).toBe(200)
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const ordinary = vi.fn(async () => new Response('valid ordinary request'))
    expect(await (await throughStart(new Request('https://ae.example/about'), 'router', ordinary)).text()).toBe('valid ordinary request')
    expect(ordinary).toHaveBeenCalledOnce()
    const protectedRoute = vi.fn(async () => new Response('not reached'))
    await expect(throughStart(new Request('https://ae.example/account'), 'router', protectedRoute)).rejects.toBe(clerkSessionError)
    expect(protectedRoute).not.toHaveBeenCalled()
    expect(mocks.clerkFactory).toHaveBeenCalledOnce()
  })

  it('retains Clerk for unsupported methods, lookalikes and server functions independently of boot validation', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const options = await startInstance.getOptions()
    const serve = options.requestMiddleware?.at(-1)?.options.server as typeof observabilityRequestMiddleware.options.server
    if (serve === undefined) throw new Error('configured Clerk middleware missing')
    for (const [path, method, handlerType] of [
      ['/api/ready', 'POST', 'router'], ['/api/health', 'PUT', 'router'],
      ['/api/ready-extra', 'GET', 'router'], ['/api/health/nested', 'GET', 'router'],
      ['/api/ready', 'GET', 'serverFn'], ['/api/health', 'HEAD', 'serverFn'],
      ['/api/clerk/webhook', 'GET', 'router'], ['/api/clerk/webhook/', 'POST', 'router'],
      ['/api/clerk/webhook', 'POST', 'serverFn'],
    ] as const) {
      const request = new Request(`https://ae.example${path}`, { method })
      const next: RequestServerNextFn<Record<string, never>, undefined> = vi.fn()
      expect(() => serve({ request, pathname: path, context: undefined, handlerType, next })).toThrow(clerkSessionError)
      expect(next).not.toHaveBeenCalled()
    }
    expect(mocks.clerkFactory).toHaveBeenCalledTimes(9)
  })
})

describe('Clerk service callback admission', () => {
  const signingKey = Buffer.alloc(32, 251)
  const serverToken = 'clerk-webhook-source-authority-with-at-least-32-characters'
  type SourceObservation = ClerkSecurityObservation & { serviceAuth: CustomerRequestServiceAssertion }
  const mutation = vi.fn(async (_reference: unknown, _args: SourceObservation): Promise<ClerkSecurityObservationResult> => ({
    kind: 'accepted', status: 'applied', eventRef: 'security_event_signed_callback',
  }))

  beforeEach(() => {
    resetBootEnvironmentValidationForTests()
    mutation.mockClear()
    mocks.clerkFactory.mockClear()
    const names = new Set([
      'AE_CLI_PREBUILT',
      ...knownNames, ...fieldRules.map(rule => rule.name),
      ...DEPLOYMENT_MANIFEST.configuration.forbiddenProduction,
      ...Object.keys(process.env).filter(name => name.startsWith('AE_SOURCE_WRITE_') || name.startsWith('VITE_AE_SOURCE_WRITE_')),
    ])
    for (const name of names) vi.stubEnv(name, undefined)
    for (const [name, value] of Object.entries({
      NODE_ENV: 'production', VERCEL_ENV: 'production', AE_DEPLOYMENT_ENVIRONMENT: 'production',
      AE_CANONICAL_BASE_URL: 'https://ae.example', CONVEX_URL: 'https://convex.example',
      AE_CONVEX_SERVER_FUNCTION_TOKEN: serverToken,
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_example', CLERK_SECRET_KEY: 'sk_live_example',
      CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.example',
      CLERK_WEBHOOK_SIGNING_SECRET: `whsec_${signingKey.toString('base64')}`,
      ...Object.fromEntries(SOURCE_WRITE_FAMILIES.map(family =>
        [`AE_SOURCE_WRITE_KEY_${family.toUpperCase()}`, `${family}:0123456789abcdef0123456789abcdef`])),
    })) vi.stubEnv(name, value)
    setPublicSourceTransportForTests({
      query: vi.fn(async () => ({ kind: 'unavailable', refreshState: 'none' })),
      mutation, action: vi.fn(),
    } as never)
  })

  afterEach(() => {
    setPublicSourceTransportForTests(undefined)
    resetBootEnvironmentValidationForTests()
    vi.unstubAllEnvs()
  })

  function signedRequest(path = '/api/clerk/webhook', method = 'POST'): Request {
    const body = JSON.stringify({
      type: 'session.revoked',
      data: { id: 'sess_revoked', user_id: 'user_revoked', updated_at: Date.now() },
    })
    const deliveryRef = 'msg_signed_revocation'
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = createHmac('sha256', signingKey).update(`${deliveryRef}.${timestamp}.${body}`).digest('base64')
    return new Request(`https://ae.example${path}`, {
      method,
      ...(method === 'GET' || method === 'HEAD' ? {} : { body }),
      headers: { 'svix-id': deliveryRef, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` },
    })
  }

  it('verifies a native signed revocation and binds its source authority while money setup is absent', async () => {
    const request = signedRequest()
    const response = await throughStart(request, 'router', vi.fn(() => handleClerkWebhookRequest(request)))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ kind: 'accepted', status: 'applied' })
    expect(mutation).toHaveBeenCalledOnce()
    const observed = mutation.mock.calls[0]?.[1]
    expect(observed).toMatchObject({
      eventType: 'session.revoked', securityAction: 'revoke_interactive_credentials',
      providerIdentifier: 'https://clerk.example|user_revoked',
      serviceAuth: { principalId: 'ae:server-function', scopes: ['account_security:observe'] },
    })
    if (observed === undefined) throw new Error('source observation missing')
    const { serviceAuth, ...command } = observed
    expect(await verifyCustomerRequestServiceAssertion({
      key: serverToken, operation: CLERK_SECURITY_OBSERVE_OPERATION, command, assertion: serviceAuth,
    })).toBe(true)
    expect(mocks.clerkFactory).not.toHaveBeenCalled()

    // Shared configuration admits the control plane; protected pages still use
    // Clerk. New-money admission is exercised at the actual Quote/Call handlers.
    const account = vi.fn(async () => new Response('not admitted'))
    await expect(throughStart(new Request('https://ae.example/account'), 'router', account))
      .rejects.toBe(clerkSessionError)
    expect(account).not.toHaveBeenCalled()
    const publicPage = vi.fn(async () => new Response('available'))
    expect((await throughStart(new Request('https://ae.example/about'), 'router', publicPage)).status).toBe(200)
    expect(publicPage).toHaveBeenCalledOnce()
    const readyRequest = new Request('https://ae.example/api/ready')
    const ready = await throughStart(readyRequest, 'router', vi.fn(() => handleReadyRequest(readyRequest, { timeoutMs: 1 })))
    expect(ready.status).toBe(503)
    expect(await ready.json()).toMatchObject({ code: 'server_not_ready', checks: { config: { status: 'failed' } } })
    expect(mutation).toHaveBeenCalledOnce()
  })

  it.each(['signature', 'body'] as const)('rejects an altered %s before source mutation', async changed => {
    const original = signedRequest()
    let request = original
    if (changed === 'signature') request.headers.set('svix-signature', 'v1,invalid')
    else request = new Request(original.url, {
      method: 'POST', headers: original.headers, body: (await original.text()).replace('user_revoked', 'user_changed'),
    })
    const response = await throughStart(request, 'router', vi.fn(() => handleClerkWebhookRequest(request)))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'clerk_webhook_invalid' })
    expect(mutation).not.toHaveBeenCalled()
  })

  it('retains the native callback body limit before source mutation', async () => {
    const original = signedRequest()
    const request = new Request(original.url, { method: 'POST', headers: original.headers, body: 'x'.repeat(256 * 1024 + 1) })
    const response = await throughStart(request, 'router', vi.fn(() => handleClerkWebhookRequest(request)))
    expect(response.status).toBe(413)
    expect(mutation).not.toHaveBeenCalled()
  })

  it.each([
    ['AE_DEPLOYMENT_ENVIRONMENT', undefined], ['AE_DEPLOYMENT_ENVIRONMENT', 'invalid'],
    ['CLERK_WEBHOOK_SIGNING_SECRET', undefined], ['CLERK_JWT_ISSUER_DOMAIN', 'http://clerk.example'],
    ['VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_wrong'], ['CLERK_SECRET_KEY', 'sk_test_wrong'],
    ['AE_CANONICAL_BASE_URL', 'https://username:password@ae.example'],
    ['CONVEX_URL', 'not-a-url'], ['VITE_CONVEX_URL', 'https://other.example'],
    ['AE_CONVEX_SERVER_FUNCTION_TOKEN', 'short'], ['AE_SOURCE_WRITE_PREVIOUS_KEYS_SESSION', 'invalid'],
    ['VITE_AE_SOURCE_WRITE_DERIVED_KEY_ID_SESSION', 'exposed'],
    ['AE_SOURCE_WRITE_SECRET', 'legacy-root-secret-with-at-least-32-characters'],
  ] as const)('rejects invalid %s before route dispatch or source mutation', async (name, value) => {
    vi.stubEnv(name, value)
    const request = signedRequest()
    const terminal = vi.fn(() => handleClerkWebhookRequest(request))
    await expect(throughStart(request, 'router', terminal)).rejects.toThrow('Invalid environment configuration')
    expect(terminal).not.toHaveBeenCalled()
    expect(mutation).not.toHaveBeenCalled()
  })

  it('retains retryable source failure after successful native verification', async () => {
    mutation.mockRejectedValueOnce(new Error('source unavailable'))
    const request = signedRequest()
    const response = await throughStart(request, 'router', vi.fn(() => handleClerkWebhookRequest(request)))
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
    expect(await response.json()).toMatchObject({ code: 'security_history_unavailable' })
    expect(mutation).toHaveBeenCalledOnce()
  })

  it.each([
    ['/api/clerk/webhook', 'GET', 'router'], ['/api/clerk/webhook', 'HEAD', 'router'],
    ['/api/clerk/webhook', 'PUT', 'router'], ['/api/clerk/webhook', 'PATCH', 'router'],
    ['/api/clerk/webhook', 'DELETE', 'router'], ['/api/clerk/webhook', 'OPTIONS', 'router'],
    ['/api/clerk/webhook', 'POST', 'serverFn'], ['/api/clerk/webhook/', 'POST', 'router'],
    ['/api/clerk/webhook-extra', 'POST', 'router'], ['/api/clerk/webhook/nested', 'POST', 'router'],
    ['/api/clerk/%77ebhook', 'POST', 'router'], ['/api/stripe/webhook', 'POST', 'router'],
  ] as const)('keeps %s %s %s behind session or CSRF admission', async (path, method, handlerType) => {
    const request = signedRequest(path, method)
    const terminal = vi.fn(() => handleClerkWebhookRequest(request))
    if (handlerType === 'serverFn') expect((await throughStart(request, handlerType, terminal)).status).toBe(403)
    else await expect(throughStart(request, handlerType, terminal)).rejects.toBe(clerkSessionError)
    expect(terminal).not.toHaveBeenCalled()
    expect(mutation).not.toHaveBeenCalled()
  })

  it('rejects a normalized raw dot-segment callback path', async () => {
    const request = signedRequest()
    Object.defineProperty(request, 'runtime', { value: { node: { req: { url: '/api/clerk/%2e/webhook' } } } })
    const terminal = vi.fn(() => handleClerkWebhookRequest(request))
    const response = await throughStart(request, 'router', terminal)
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'api_not_found' })
    expect(terminal).not.toHaveBeenCalled()
    expect(mutation).not.toHaveBeenCalled()
  })
})

describe('operational probe observability bypass', () => {
  let isolatedMiddleware: typeof observabilityRequestMiddleware

  beforeEach(async () => {
    // Ordinary requests above can finish the process-wide telemetry setup.
    // Exercise each cold-start guarantee with a fresh module, after draining it.
    await vi.dynamicImportSettled()
    vi.resetModules()
    mocks.readConfig.mockReset().mockReturnValue({ enabled: true, environment: 'production', posthogHost: 'https://posthog.example' })
    mocks.flushPostHogServer.mockClear()
    mocks.initSentryServer.mockClear()
    mocks.captureServerException.mockClear()
    isolatedMiddleware = (await import('@/start')).observabilityRequestMiddleware
  })

  afterEach(async () => {
    await vi.dynamicImportSettled()
  })

  it('does not initialize or flush external observability for health, readiness and release identity', async () => {
    const server = isolatedMiddleware.options.server
    if (typeof server !== 'function') throw new Error('observability server middleware missing')

    for (const path of ['/api/health', '/api/ready', '/api/v1/release']) {
      const request = new Request(`https://ae.example${path}`)
      let nextCalls = 0
      const nextError = new Error(`next:${path}`)
      const next: RequestServerNextFn<Record<string, never>, undefined> = () => {
        nextCalls += 1
        throw nextError
      }
      const options: RequestServerOptions<Record<string, never>, undefined> = {
        request,
        pathname: new URL(request.url).pathname,
        context: undefined,
        next,
        handlerType: 'router',
      }
      await expect(server(options)).rejects.toBe(nextError)
      expect(nextCalls).toBe(1)
    }

    await vi.dynamicImportSettled()
    expect(mocks.readConfig).not.toHaveBeenCalled()
    expect(mocks.initSentryServer).not.toHaveBeenCalled()
    expect(mocks.flushPostHogServer).not.toHaveBeenCalled()
  })

  it('serves a public request while telemetry initialization is broken', async () => {
    mocks.readConfig.mockImplementationOnce(() => {
      throw new Error('telemetry config unavailable')
    })
    const request = new Request('https://ae.example/about')
    const next: RequestServerNextFn<Record<string, never>, undefined> = vi.fn().mockResolvedValue({
      request,
      pathname: '/about',
      context: undefined,
      response: new Response('public content', { status: 200 }),
    })
    const server = isolatedMiddleware.options.server
    if (typeof server !== 'function') throw new Error('observability server middleware missing')
    const result = await server({
      request,
      pathname: '/about',
      context: undefined,
      next,
      handlerType: 'router',
    })
    if (result instanceof Response) throw new Error('middleware returned a bare response')
    expect(result.response.status).toBe(200)
    expect(await result.response.text()).toBe('public content')
    expect(next).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(mocks.readConfig).toHaveBeenCalled())
    expect(mocks.flushPostHogServer).not.toHaveBeenCalled()
  })
})

describe('root machine discovery', () => {
  it('advertises discovery on the root response without adding it to other pages', async () => {
    const server = securityHeadersRequestMiddleware.options.server
    if (typeof server !== 'function') throw new Error('security headers middleware missing')
    for (const path of ['/', '/about']) {
      const request = new Request(`https://ae.example${path}`)
      const next: RequestServerNextFn<Record<string, never>, undefined> = vi.fn().mockResolvedValue({
        request,
        pathname: path,
        context: undefined,
        response: new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
      })
      const options: RequestServerOptions<Record<string, never>, undefined> = {
        request,
        pathname: path,
        context: undefined,
        handlerType: 'router',
        next,
      }
      const result = await server(options)
      if (result instanceof Response) throw new Error('security headers middleware returned a bare response')
      expect(result.response.headers.get('Link')).toBe(path === '/'
        ? '</llms.txt>; rel="describedby"; type="text/plain", </.well-known/api-catalog>; rel="api-catalog"'
        : null)
    }
  })
})

describe('machine bearer routes', () => {
  it('bypasses Clerk session middleware for API/MCP regardless of User-Agent but retains it for browser pages', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_development')
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_development')
    try {
      const middleware = clerkPreviewOrProductionMiddleware()[0]
      const serve = middleware?.options.server
      if (serve === undefined) throw new Error('Clerk middleware is not configured')
      for (const [path, userAgent] of [
        ['/api/v1/account/self', 'Python-urllib/3.14'],
        ['/api/v1/account/self', 'curl/8.0'],
        ['/mcp', 'Python-urllib/3.14'],
      ] as const) {
        const request = new Request(`https://ae.example${path}`, { headers: { 'User-Agent': userAgent } })
        const next = vi.fn().mockResolvedValue({ request, response: new Response('handled') })
        await expect(serve({ request, pathname: path, context: undefined, handlerType: 'router', next }))
          .resolves.toMatchObject({ response: expect.any(Response) })
        expect(next).toHaveBeenCalledOnce()
      }
      const bearerChat = new Request('https://ae.example/api/v1/chat/turns', {
        headers: { Authorization: 'Bearer ae_test_secret', 'User-Agent': 'Python-urllib/3.14' },
      })
      const bearerNext = vi.fn().mockResolvedValue({ request: bearerChat, response: new Response('handled') })
      await expect(serve({
        request: bearerChat, pathname: '/api/v1/chat/turns', context: undefined, handlerType: 'router', next: bearerNext,
      })).resolves.toMatchObject({ response: expect.any(Response) })
      expect(bearerNext).toHaveBeenCalledOnce()
      for (const path of ['/', '/market', '/about', '/privacy', '/tools/operation%3Av1%3Aref', '/providers/host', '/business-slug']) {
        const request = new Request(`https://ae.example${path}`)
        const next = vi.fn().mockResolvedValue({ request, response: new Response('public content') })
        await expect(serve({ request, pathname: path, context: undefined, handlerType: 'router', next }))
          .resolves.toMatchObject({ response: expect.any(Response) })
        expect(next).toHaveBeenCalledOnce()
      }
      const publicWrite = new Request('https://ae.example/market', { method: 'POST' })
      expect(() => serve({
        request: publicWrite, pathname: '/market', context: undefined, handlerType: 'router', next: vi.fn(),
      })).toThrow(clerkSessionError)
      const sessionChat = new Request('https://ae.example/api/v1/chat/turns', {
        headers: { Cookie: '__session=browser-session' },
      })
      expect(() => serve({
        request: sessionChat, pathname: '/api/v1/chat/turns', context: undefined, handlerType: 'router', next: vi.fn(),
      })).toThrow(clerkSessionError)
      const activity = new Request('https://ae.example/activity?agent=prn_invalid')
      expect(() => serve({
        request: activity, pathname: '/activity', context: undefined, handlerType: 'router', next: vi.fn(),
      })).toThrow(clerkSessionError)
      const browser = new Request('https://ae.example/account')
      expect(() => serve({
        request: browser, pathname: '/account', context: undefined, handlerType: 'router',
        next: vi.fn(),
      })).toThrow(clerkSessionError)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
