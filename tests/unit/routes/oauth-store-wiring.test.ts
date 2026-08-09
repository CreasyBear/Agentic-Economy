import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorizeGet: vi.fn((_request: Request, options: { store?: unknown }) => Promise.resolve(Response.json({ store: options.store !== undefined }))),
  authorizePost: vi.fn((_request: Request, options: { store?: unknown }) => Promise.resolve(Response.json({ store: options.store !== undefined }))),
  device: vi.fn((_request: Request, options: { store?: unknown }) => Promise.resolve(Response.json({ store: options.store !== undefined }))),
  register: vi.fn((_request: Request, options: { store?: unknown }) => Promise.resolve(Response.json({ store: options.store !== undefined }))),
  token: vi.fn((_request: Request, options: { store?: unknown }) => Promise.resolve(Response.json({ store: options.store !== undefined }))),
  authorizationUnavailable: vi.fn(() => new Response(JSON.stringify({
    type: 'about:blank',
    title: 'Unavailable',
    status: 503,
    kind: 'UNAVAILABLE',
    code: 'oauth_authorization_unavailable',
    detail: 'The authorization request is temporarily unavailable.',
    retryable: true,
  }), { status: 503, headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' } })),
}))

vi.mock('@/lib/server/customer-request-agent-oauth-api', () => ({
  handleOAuthAuthorizeGet: mocks.authorizeGet,
  handleOAuthConsentPost: mocks.authorizePost,
  oauthAuthorizationUnavailableResponse: mocks.authorizationUnavailable,
  handleDeviceAuthorizationPost: mocks.device,
  handleOAuthRegisterPost: mocks.register,
  handleOAuthTokenPost: mocks.token,
}))

import { Route as AuthorizeRoute } from '@/routes/oauth.authorize'
import { Route as DeviceRoute } from '@/routes/oauth.device_authorization'
import { Route as RegisterRoute } from '@/routes/oauth.register'
import { Route as TokenRoute } from '@/routes/oauth.token'

type RouteHandler = (context: { request: Request }) => Promise<Response> | Response
type RouteHandlers = { GET?: RouteHandler; POST?: RouteHandler }

type RouteLike = { options: { server?: { handlers?: unknown } } }

const request = new Request('http://localhost/oauth/test')

function routeHandlers(route: unknown): RouteHandlers {
  const routeValue = route as RouteLike
  const server = routeValue.options.server
  const handlers = server?.handlers
  if (handlers === undefined) throw new Error('OAuth handlers missing')
  const typedHandlers = handlers as RouteHandlers
  return typedHandlers
}

describe('OAuth stateful route wiring', () => {
  it('passes a configured Convex store to every stateful handler', async () => {
    vi.stubEnv('CONVEX_URL', 'https://oauth-store.test.convex.cloud')
    const authorizeHandlers = routeHandlers(AuthorizeRoute)
    const deviceHandlers = routeHandlers(DeviceRoute)
    const registerHandlers = routeHandlers(RegisterRoute)
    const tokenHandlers = routeHandlers(TokenRoute)
    if (authorizeHandlers.GET === undefined || authorizeHandlers.POST === undefined || deviceHandlers.POST === undefined || registerHandlers.POST === undefined || tokenHandlers.POST === undefined) throw new Error('OAuth handlers missing')

    await authorizeHandlers.GET({ request })
    await authorizeHandlers.POST({ request })
    await deviceHandlers.POST({ request })
    await registerHandlers.POST({ request })
    await tokenHandlers.POST({ request })

    expect(mocks.authorizeGet).toHaveBeenCalledWith(request, expect.objectContaining({ store: expect.any(Object) }))
    expect(mocks.authorizePost).toHaveBeenCalledWith(request, expect.objectContaining({ store: expect.any(Object) }))
    expect(mocks.device).toHaveBeenCalledWith(request, expect.objectContaining({ store: expect.any(Object) }))
    expect(mocks.register).toHaveBeenCalledWith(request, expect.objectContaining({ store: expect.any(Object) }))
    expect(mocks.token).toHaveBeenCalledWith(request, expect.objectContaining({ store: expect.any(Object) }))
  })
  it('returns a typed unavailable problem when the OAuth store cannot be created', async () => {
    const authorizeHandlers = routeHandlers(AuthorizeRoute)
    if (authorizeHandlers.GET === undefined) throw new Error('OAuth handlers missing')
    vi.stubEnv('CONVEX_URL', '')
    vi.stubEnv('VITE_CONVEX_URL', '')
    mocks.authorizationUnavailable.mockClear()
    mocks.authorizeGet.mockClear()
    try {
      const response = await authorizeHandlers.GET({ request })

      expect(response.status).toBe(503)
      expect(response.headers.get('content-type')).toBe('application/problem+json')
      expect(await response.json()).toMatchObject({
        kind: 'UNAVAILABLE',
        code: 'oauth_authorization_unavailable',
        retryable: true,
      })
      expect(mocks.authorizationUnavailable).toHaveBeenCalledOnce()
      expect(mocks.authorizeGet).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
