import type { RequestServerNextFn, RequestServerOptions } from '@tanstack/react-start'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { observabilityRequestMiddleware, securityHeadersRequestMiddleware } from '@/start'

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
