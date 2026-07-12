import { describe, expect, it, vi } from 'vitest'

import { handleRoutingEdgeRequest } from '../../../examples/routing-edge/src/routing-edge'

const env = {
  AE_ROUTING_ORIGIN: 'https://kernel.example',
  AE_EDGE_ENVIRONMENT: 'test',
  AE_EDGE_SOURCE_REVISION: 'revision:test',
  AE_EDGE_ORIGIN_HMAC_KEY: 'test-edge-origin-key-with-enough-entropy',
}

describe('routing edge Fetch contract', () => {
  it('projects a signed agent request to the canonical origin without changing its body', async () => {
    const body = JSON.stringify({ protocolVersion: 'ae-routing:v1', networkId: 'registered-businesses' })
    const fetcher = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://kernel.example/v1/route')
      expect(request.headers.get('Signature')).toBe('sig1=:YWJjZA==:')
      expect(request.headers.get('X-AE-Edge-Authority')).toBe('route.agentic-economy.test')
      expect(request.headers.get('X-AE-Edge-Signature')).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(await request.text()).toBe(body)
      return Response.json({ protocolVersion: 'ae-routing:v1', operation: 'route', result: { kind: 'quoted' } })
    })
    const response = await handleRoutingEdgeRequest(new Request('https://route.agentic-economy.test/v1/route', {
      method: 'POST', body, headers: { 'Content-Type': 'application/json', Signature: 'sig1=:YWJjZA==:', 'Content-Digest': 'sha-256=:digest:' },
    }), env, fetcher)

    expect(response.status).toBe(200)
    expect(response.headers.get('X-AE-Edge-Request-Id')).toMatch(/\S+/)
    expect(response.headers.get('Server-Timing')).toMatch(/^ae-edge;dur=\d+$/)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('refuses unknown paths, wrong methods, and oversized bodies before origin fetch', async () => {
    const fetcher = vi.fn(async () => new Response())
    const unknown = await handleRoutingEdgeRequest(new Request('https://route.agentic-economy.test/not-kernel'), env, fetcher)
    const wrongMethod = await handleRoutingEdgeRequest(new Request('https://route.agentic-economy.test/v1/route'), env, fetcher)
    const oversized = await handleRoutingEdgeRequest(new Request('https://route.agentic-economy.test/mcp', {
      method: 'POST', body: 'x'.repeat(65 * 1024), headers: { 'Content-Type': 'application/json' },
    }), env, fetcher)

    expect([unknown.status, wrongMethod.status, oversized.status]).toEqual([404, 405, 413])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('publishes source-bound topology without exposing the origin HMAC key', async () => {
    const response = await handleRoutingEdgeRequest(new Request('https://route.agentic-economy.test/.well-known/ae-routing-topology.json'), env)
    const raw = await response.clone().text()
    expect(await response.json()).toEqual({
      schemaVersion: 'ae-routing-topology:v1', environment: 'test', sourceRevision: 'revision:test',
      edge: { authority: 'route.agentic-economy.test', state: 'stateless', requestId: expect.any(String) },
      canonicalAuthority: { runtime: 'convex', origin: 'https://kernel.example' },
      admission: { authority: 'convex', contract: 'transactional-fixed-window-and-lease:v1' },
      telemetry: { protocolRecordsSeparated: true, providerWaitSeparated: true, retentionDays: 7 },
      evidenceDomains: [
        { id: 'protocol', authority: 'convex', retention: 'authoritative' },
        { id: 'operational', authority: 'convex', retention: 'bounded', retentionDays: 7 },
        { id: 'edge', authority: 'cloudflare', retention: 'platform-configured' },
      ],
    })
    expect(raw).not.toContain(env.AE_EDGE_ORIGIN_HMAC_KEY)
  })

  it('returns a stable origin failure without leaking the upstream exception', async () => {
    const response = await handleRoutingEdgeRequest(new Request('https://route.agentic-economy.test/v1/route', {
      method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' },
    }), env, async () => { throw new Error('private upstream detail') })

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      protocolVersion: 'ae-routing:v1',
      edge: { requestId: expect.any(String) },
      error: { code: 'origin_unavailable', retryable: true },
    })
  })
})
