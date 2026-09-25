import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { rfc9727LinksetContentType } from '@/lib/http/discovery-response'
import { Route as ApiCatalogRoute, handleApiCatalogRequest } from '@/routes/[.]well-known/api-catalog'
import { Route as UcpRoute } from '@/routes/[.]well-known/ucp'
import { Route as OAuthProtectedResourceRoute } from '@/routes/[.]well-known/oauth-protected-resource'
import { Route as OAuthAuthorizationServerRoute } from '@/routes/[.]well-known/oauth-authorization-server'

beforeEach(() => {
  vi.stubEnv('AE_CANONICAL_HOST_ALLOWLIST', 'ae.example')
  vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://ae.example')
  vi.stubEnv('AE_ROUTING_PUBLIC_BASE_URL', 'https://ae.example')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('api-catalog route handler', () => {
  it('serves the RFC 9727 linkset with the shared discovery header discipline', async () => {
    const response = handleApiCatalogRequest(new Request('https://ae.example/.well-known/api-catalog'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe(rfc9727LinksetContentType)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Link')).toBe('</.well-known/api-catalog>; rel="api-catalog"')

    const anchors = body.linkset.map((entry: { anchor: string }) => entry.anchor)
    expect(anchors).toEqual([
      'https://ae.example/api/v1/market-tools/search',
      'https://ae.example/api/v1/market-tools/list',
      'https://ae.example/api/v1/market-tools/describe',
      'https://ae.example/api/v1/market-tools/compare',
      'https://ae.example/api/v1/tools/call',
      'https://ae.example/mcp',
    ])
  })

  it('serves HEAD with the GET status and representation headers but no body', async () => {
    for (const { route, path } of [
      { route: ApiCatalogRoute, path: '/.well-known/api-catalog' },
      { route: UcpRoute, path: '/.well-known/ucp' },
      { route: OAuthProtectedResourceRoute, path: '/.well-known/oauth-protected-resource' },
      { route: OAuthAuthorizationServerRoute, path: '/.well-known/oauth-authorization-server' },
    ]) {
      const handlers = route.options.server?.handlers
      const getHandler: unknown = handlers && Reflect.get(handlers, 'GET')
      const headHandler: unknown = handlers && Reflect.get(handlers, 'HEAD')
      if (typeof getHandler !== 'function' || typeof headHandler !== 'function') {
        throw new Error(`${path} GET/HEAD handlers missing`)
      }
      const ctx = (method: 'GET' | 'HEAD') => ({
        request: new Request(`https://ae.example${path}`, { method }),
        pathname: path,
        params: {},
        context: {},
        next: () => { throw new Error(`unexpected next from ${path}`) },
      })
      const get: unknown = await getHandler(ctx('GET'))
      const head: unknown = await headHandler(ctx('HEAD'))
      if (!(get instanceof Response) || !(head instanceof Response)) {
        throw new Error(`${path} GET/HEAD did not return a Response`)
      }
      expect(head.status, path).toBe(get.status)
      expect(head.headers.get('content-type'), path).toBe(get.headers.get('content-type'))
      expect(head.headers.get('cache-control'), path).toBe(get.headers.get('cache-control'))
      expect(head.headers.get('link'), path).toBe(get.headers.get('link'))
      expect(head.body, path).toBeNull()
    }
  })

  it('refuses methods the route does not support', async () => {
    const handlers = ApiCatalogRoute.options.server?.handlers
    if (handlers === undefined || typeof handlers !== 'object' || handlers === null)
      throw new Error('api-catalog handlers missing')
    const postHandler: unknown = Reflect.get(handlers, 'POST')
    if (typeof postHandler !== 'function') throw new Error('POST handler missing')
    const wrongMethod: unknown = postHandler()
    if (!(wrongMethod instanceof Response)) throw new Error('POST handler did not return a Response')

    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('GET, HEAD')
    await expect(wrongMethod.json()).resolves.toMatchObject({ status: 405 })
  })
})
