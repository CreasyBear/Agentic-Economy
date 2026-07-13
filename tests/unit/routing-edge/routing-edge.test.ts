import { describe, expect, it, vi } from 'vitest'

import { handleRoutingEdgeRequest } from '../../../examples/routing-edge/src/routing-edge'

const env = {
  AE_ROUTING_ORIGIN: 'https://kernel.example',
  AE_EDGE_ENVIRONMENT: 'test',
  AE_EDGE_SOURCE_REVISION: 'revision:test',
  AE_EDGE_ORIGIN_HMAC_KEY: 'test-edge-origin-key-with-enough-entropy',
}

describe('retired routing edge', () => {
  it.each([
    ['POST', '/v1/route'],
    ['POST', '/v1/authorize'],
    ['POST', '/v1/execute'],
    ['POST', '/v1/reconcile'],
    ['POST', '/v1/inspect'],
    ['POST', '/v1/cancel'],
    ['POST', '/mcp'],
    ['GET', '/mcp'],
    ['GET', '/.well-known/ae-routing.json'],
    ['GET', '/.well-known/ae-routing-topology.json'],
  ])('returns a typed retirement response and never forwards %s %s', async (method, path) => {
    const fetcher = vi.fn(async () => new Response())
    const response = await handleRoutingEdgeRequest(new Request(`https://route.agentic-economy.test${path}`, { method }), env, fetcher)

    expect(response.status).toBe(410)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      error: { code: 'routing_v1_retired', requestApi: '/api/v1/requests' },
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not claim unrelated paths', async () => {
    const fetcher = vi.fn(async () => new Response())
    const response = await handleRoutingEdgeRequest(new Request('https://route.agentic-economy.test/not-routing'), env, fetcher)

    expect(response.status).toBe(404)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
