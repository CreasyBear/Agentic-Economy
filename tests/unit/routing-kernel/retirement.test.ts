import { describe, expect, it } from 'vitest'

import { ROUTING_V1_RETIRED_PATHS, routingV1RetiredResponse } from '@/modules/routing-kernel/retirement'

/**
 * Replaces the retirement coverage that lived in the deleted
 * `examples/routing-edge` worker test. That suite asserted the edge shim
 * answered every retired V1 path with a typed 410 and never forwarded. The
 * worker is gone; the same contract now lives in this helper and is registered
 * by `convex/http.ts`, so the contract is asserted against live source here.
 */
describe('routing V1 retirement', () => {
  it('answers with an uncacheable 410 naming the replacement API', async () => {
    const response = routingV1RetiredResponse()
    expect(response.status).toBe(410)
    expect(response.headers.get('Cache-Control')).toBe('no-store')

    expect(response.headers.get('Content-Type')).toBe('application/problem+json')
    expect(await response.json()).toEqual({
      type: 'about:blank',
      title: 'Not found',
      status: 410,
      kind: 'NOT_FOUND',
      code: 'routing_v1_retired',
      requestApi: '/api/v1/requests',
    })
  })

  it('enumerates the retired surface so a revived V1 path cannot go unlisted', () => {
    expect([...ROUTING_V1_RETIRED_PATHS]).toEqual([
      '/v1/route',
      '/v1/authorize',
      '/v1/execute',
      '/v1/reconcile',
      '/v1/inspect',
      '/v1/cancel',
      '/mcp',
      '/.well-known/ae-routing.json',
      '/.well-known/ae-routing-topology.json',
    ])
  })

  it('returns a fresh body per call so one retired route cannot consume another response', async () => {
    const first = routingV1RetiredResponse()
    await first.json()

    expect(first.bodyUsed).toBe(true)
    expect(routingV1RetiredResponse().bodyUsed).toBe(false)
  })
})
