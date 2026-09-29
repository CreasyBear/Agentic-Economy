import { createMiddleware, type RequestServerNextFn, type RequestServerOptions } from '@tanstack/react-start'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readConfig: vi.fn(() => ({ enabled: true, environment: 'production', posthogHost: 'https://posthog.example' })),
  flushPostHogServer: vi.fn(async () => undefined),
  initSentryServer: vi.fn(() => true),
  captureServerException: vi.fn(),
}))
const clerkSessionError = new Error('session middleware unexpectedly handled bearer request')
vi.mock('@clerk/tanstack-react-start/server', () => ({
  clerkMiddleware: () => createMiddleware().server(() => { throw clerkSessionError }),
}))

vi.mock('@/lib/observability/config', () => ({ readObservabilityServerConfig: mocks.readConfig }))
vi.mock('@/lib/observability/posthog.server', () => ({ flushPostHogServer: mocks.flushPostHogServer }))
vi.mock('@/lib/observability/sentry.server', () => ({
  captureServerException: mocks.captureServerException,
  initSentryServer: mocks.initSentryServer,
  Sentry: { withIsolationScope: vi.fn() },
}))

import { clerkPreviewOrProductionMiddleware, observabilityRequestMiddleware, securityHeadersRequestMiddleware } from '@/start'

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
