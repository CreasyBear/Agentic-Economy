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
import { resetBootEnvironmentValidationForTests } from '@/lib/deployment/validate-boot-env.server'
import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'

// Use installed createStart/getOptions and every registered request middleware.
// Only the framework's terminal router dispatch is supplied: real diagnostics
// run behind real boot validation, correlation, security and Clerk admission.
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

describe('boot and auth admission for router diagnostics', () => {
  beforeEach(() => {
    resetBootEnvironmentValidationForTests()
    mocks.clerkFactory.mockReset()
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
    for (const path of ['/api/health', '/api/ready']) {
      for (const method of ['GET', 'HEAD']) {
        const request = new Request(`https://ae.example${path}`, { method, headers: { 'x-ae-request-id': 'corr_start_probe' } })
        const terminal = vi.fn(async () => path === '/api/health'
          ? await handleHealthRequest(request, method === 'HEAD')
          : await handleReadyRequest(request, { timeoutMs: 1 }, method === 'HEAD'))
        const response = await throughStart(request, 'router', terminal)
        expect(response.status).toBe(path === '/api/health' ? 200 : 503)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('x-ae-request-id')).toBe('corr_start_probe')
        expect(terminal).toHaveBeenCalledOnce()
        if (method === 'HEAD') expect(await response.text()).toBe('')
        else if (path === '/api/health') expect(await response.json()).toEqual({ status: 'ok' })
        else expect(await response.json()).toMatchObject({ status: 503, code: 'server_not_ready', checks: { config: { status: 'failed' } } })
      }
    }
    expect(mocks.clerkFactory).not.toHaveBeenCalled()
    // Diagnostics must not make the ordinary boot-validation cache succeed.
    const ordinary = vi.fn(async () => new Response('not reached'))
    await expect(throughStart(new Request('https://ae.example/about'), 'router', ordinary)).rejects.toThrow('Invalid environment configuration')
    expect(ordinary).not.toHaveBeenCalled()
  })

  it.each([
    ['/', 'GET', 'router'], ['/api/v1/tools/quote', 'POST', 'router'],
    ['/api/ready', 'POST', 'router'], ['/api/health', 'PUT', 'router'],
    ['/api/ready/', 'GET', 'router'], ['/api/ready-extra', 'GET', 'router'],
    ['/api/health/nested', 'GET', 'router'], ['/api/%72eady', 'GET', 'router'],
    ['/api/ready', 'GET', 'serverFn'], ['/api/health', 'HEAD', 'serverFn'],
  ] as const)('keeps %s %s %s behind real boot validation', async (path, method, handlerType) => {
    const terminal = vi.fn(async () => new Response('not reached'))
    await expect(throughStart(new Request(`https://ae.example${path}`, { method }), handlerType, terminal))
      .rejects.toThrow('Invalid environment configuration')
    expect(terminal).not.toHaveBeenCalled()
  })

  it('does not admit a raw encoded dot-segment lookalike that the URL parser normalizes', async () => {
    const request = new Request('https://ae.example/api/ready')
    Object.defineProperty(request, 'runtime', { value: { node: { req: { url: '/api/%2e/ready' } } } })
    await expect(throughStart(request)).rejects.toThrow('Invalid environment configuration')
  })

  it('allows later valid ordinary validation while retaining damaged Clerk refusal on protected requests', async () => {
    const diagnostic = new Request('https://ae.example/api/health')
    expect((await throughStart(diagnostic, 'router', vi.fn(async () => await handleHealthRequest(diagnostic)))).status).toBe(200)
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

  it('retains Clerk for diagnostic writes, lookalikes and server functions independently of boot validation', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const options = await startInstance.getOptions()
    const serve = options.requestMiddleware?.at(-1)?.options.server as typeof observabilityRequestMiddleware.options.server
    if (serve === undefined) throw new Error('configured Clerk middleware missing')
    for (const [path, method, handlerType] of [
      ['/api/ready', 'POST', 'router'], ['/api/health', 'PUT', 'router'],
      ['/api/ready-extra', 'GET', 'router'], ['/api/health/nested', 'GET', 'router'],
      ['/api/ready', 'GET', 'serverFn'], ['/api/health', 'HEAD', 'serverFn'],
    ] as const) {
      const request = new Request(`https://ae.example${path}`, { method })
      const next: RequestServerNextFn<Record<string, never>, undefined> = vi.fn()
      expect(() => serve({ request, pathname: path, context: undefined, handlerType, next })).toThrow(clerkSessionError)
      expect(next).not.toHaveBeenCalled()
    }
    expect(mocks.clerkFactory).toHaveBeenCalledTimes(6)
  })
})

describe('operational probe observability bypass', () => {
  beforeEach(() => {
    mocks.readConfig.mockClear()
    mocks.flushPostHogServer.mockClear()
    mocks.initSentryServer.mockClear()
    mocks.captureServerException.mockClear()
  })

  it('does not initialize or flush external observability for health and readiness', async () => {
    const server = observabilityRequestMiddleware.options.server
    if (typeof server !== 'function') throw new Error('observability server middleware missing')

    for (const path of ['/api/health', '/api/ready']) {
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
    const server = observabilityRequestMiddleware.options.server
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
