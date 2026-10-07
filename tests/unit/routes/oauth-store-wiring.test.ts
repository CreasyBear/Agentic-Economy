import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorizeGet: vi.fn((_request: Request, options: { store?: unknown }) => Promise.resolve(Response.json({ store: options.store !== undefined }))),
  authorizePost: vi.fn((_request: Request, options: { store?: unknown }) => Promise.resolve(Response.json({ store: options.store !== undefined }))),
  device: vi.fn((_request: Request, options: { store?: unknown }) => Promise.resolve(Response.json({ store: options.store !== undefined }))),
  register: vi.fn((_request: Request, options: { store?: unknown }) => Promise.resolve(Response.json({ store: options.store !== undefined }))),
  revoke: vi.fn((_request: Request, options: { refreshStore?: unknown }) => Promise.resolve(Response.json({ store: options.refreshStore !== undefined }))),
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

vi.mock('@/lib/server/agent-access-oauth-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/server/agent-access-oauth-api')>(),
  handleOAuthAuthorizeGet: mocks.authorizeGet,
  handleOAuthConsentPost: mocks.authorizePost,
  oauthAuthorizationUnavailableResponse: mocks.authorizationUnavailable,
  handleDeviceAuthorizationPost: mocks.device,
  handleOAuthRegisterPost: mocks.register,
  handleOAuthRevokePost: mocks.revoke,
  handleOAuthTokenPost: mocks.token,
}))

import * as oauthStore from '@/lib/server/agent-access-oauth-store'
import { readForm, readJson, readOAuthRequestBody } from '@/lib/server/agent-access-oauth/protocol'

import { Route as AuthorizeRoute } from '@/routes/oauth.authorize'
import { Route as DeviceRoute } from '@/routes/oauth.device_authorization'
import { Route as RegisterRoute } from '@/routes/oauth.register'
import { Route as RevokeRoute } from '@/routes/oauth.revoke'
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
  it.each([
    ['authorize', AuthorizeRoute], ['device_authorization', DeviceRoute],
    ['register', RegisterRoute], ['revoke', RevokeRoute], ['token', TokenRoute],
  ])('rejects oversized %s bodies before constructing an OAuth store', async (name, route) => {
    const createStore = vi.spyOn(oauthStore, 'createConvexAgentAccessOAuthStore')
    const handler = routeHandlers(route).POST
    if (handler === undefined) throw new Error('OAuth POST handler missing')
    try {
      const response = await handler({ request: new Request(`http://localhost/oauth/${name}`, {
        method: 'POST', headers: { 'Content-Type': name === 'register' ? 'application/json' : 'application/x-www-form-urlencoded' },
        body: 'x'.repeat(16 * 1024 + 1),
      }) })
      expect(response.status).toBe(413)
      expect(await response.json()).toMatchObject({ error: 'invalid_request' })
      expect(createStore).not.toHaveBeenCalled()
    } finally {
      createStore.mockRestore()
    }
  })
  it('shares exact bounded form text between request hashing and protocol parsing', async () => {
    const sourceBody = 'client_id=first%20client&scope=a+b&client_id=second'
    const source = new Request('http://localhost/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: sourceBody,
    })
    expect(await readOAuthRequestBody(source)).toEqual({ kind: 'ok', text: sourceBody })
    expect(source.bodyUsed).toBe(true)
    const form = await readForm(source)
    expect(form.kind).toBe('ok')
    if (form.kind !== 'ok') throw new Error('OAuth form unexpectedly rejected')
    expect(form.sourceBody).toBe(sourceBody)
    expect(form.value.getAll('client_id')).toEqual(['first client', 'second'])
  })
  it('shares exact bounded registration text before JSON parsing', async () => {
    const sourceBody = ' { "client_name": "Original text" } '
    const source = new Request('http://localhost/oauth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: sourceBody,
    })
    expect(await readOAuthRequestBody(source)).toEqual({ kind: 'ok', text: sourceBody })
    expect(await readJson(source)).toEqual({ kind: 'ok', value: { client_name: 'Original text' } })
  })

  it('passes a configured Convex store to every stateful handler', async () => {
    vi.stubEnv('CONVEX_URL', 'https://oauth-store.test.convex.cloud')
    const authorizeHandlers = routeHandlers(AuthorizeRoute)
    const deviceHandlers = routeHandlers(DeviceRoute)
    const registerHandlers = routeHandlers(RegisterRoute)
    const revokeHandlers = routeHandlers(RevokeRoute)
    const tokenHandlers = routeHandlers(TokenRoute)
    if (authorizeHandlers.GET === undefined || authorizeHandlers.POST === undefined || deviceHandlers.POST === undefined || registerHandlers.POST === undefined || revokeHandlers.POST === undefined || tokenHandlers.POST === undefined) throw new Error('OAuth handlers missing')

    await authorizeHandlers.GET({ request })
    await authorizeHandlers.POST({ request })
    await deviceHandlers.POST({ request })
    await registerHandlers.POST({ request })
    await revokeHandlers.POST({ request })
    await tokenHandlers.POST({ request })

    expect(mocks.authorizeGet).toHaveBeenCalledWith(request, expect.objectContaining({ store: expect.any(Object) }))
    expect(mocks.authorizePost).toHaveBeenCalledWith(request, expect.objectContaining({ store: expect.any(Object) }))
    expect(mocks.device).toHaveBeenCalledWith(request, expect.objectContaining({ store: expect.any(Object) }))
    expect(mocks.register).toHaveBeenCalledWith(request, expect.objectContaining({ store: expect.any(Object) }))
    expect(mocks.revoke).toHaveBeenCalledWith(request, expect.objectContaining({ store: expect.any(Object), refreshStore: expect.any(Object) }))
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
