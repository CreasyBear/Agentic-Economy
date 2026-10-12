import type { RequestServerNextFn, RequestServerOptions } from '@tanstack/react-start'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { observabilityRequestMiddleware } from '@/start'

const mocks = vi.hoisted(() => ({
  readConfig: vi.fn(() => ({ enabled: true, environment: 'production', posthogHost: 'https://posthog.example' })),
  flushPostHogServer: vi.fn(async () => undefined),
  initSentryServer: vi.fn(() => true),
  captureServerException: vi.fn(),
}))
vi.mock('@/lib/observability/config', () => ({ readObservabilityServerConfig: mocks.readConfig }))
vi.mock('@/lib/observability/posthog.server', () => ({ flushPostHogServer: mocks.flushPostHogServer }))
vi.mock('@/lib/observability/sentry.server', () => ({
  captureServerException: mocks.captureServerException,
  initSentryServer: mocks.initSentryServer,
  Sentry: { withIsolationScope: vi.fn() },
}))

describe('operational probe observability bypass', () => {
  let isolatedMiddleware: typeof observabilityRequestMiddleware

  beforeEach(async () => {
    // Keep cold-start probes isolated from background work in admission tests.
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

