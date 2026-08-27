import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { rfc9727LinksetContentType } from '@/lib/http/discovery-response'
import { Route as ApiCatalogRoute, handleApiCatalogRequest } from '@/routes/[.]well-known/api-catalog'

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

    const anchors = body.linkset.map((entry: { anchor: string }) => entry.anchor)
    expect(anchors).toEqual([
      'https://ae.example/api/v1/market-operations/search',
      'https://ae.example/api/v1/market-operations/detail',
      'https://ae.example/api/v1/market-operations/compare',
      'https://ae.example/api/v1/market-operations/inspect-plan',
      'https://ae.example/api/v1/operations/call',
      'https://ae.example/mcp',
    ])
  })

  it('refuses methods the route does not support', async () => {
    const handlers = ApiCatalogRoute.options.server?.handlers
    if (handlers === undefined || typeof handlers !== 'object' || handlers === null)
      throw new Error('api-catalog handlers missing')
    const postHandler = Reflect.get(handlers, 'POST') as () => Response
    const wrongMethod = postHandler()
    if (!(wrongMethod instanceof Response)) throw new Error('POST handler did not return a Response')

    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('GET')
    await expect(wrongMethod.json()).resolves.toMatchObject({ status: 405 })
  })
})
