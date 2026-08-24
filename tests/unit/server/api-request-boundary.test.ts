import { describe, expect, it } from 'vitest'

import { apiRequestBoundaryResponse } from '@/lib/server/api-request-boundary'

describe('raw API request boundary', () => {
  it('keeps encoded dot-segment API misses on the canonical problem response', async () => {
    const response = apiRequestBoundaryResponse({
      url: 'https://ae.example/g19-unknown-route',
      runtime: { node: { req: { url: '/api/%2e%2e/g19-unknown-route' } } },
    })

    expect(response).toBeDefined()
    if (response === undefined) throw new Error('encoded API path was not rejected')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    const body = await response.json()
    expect(body).toMatchObject({
      status: 404,
      kind: 'NOT_FOUND',
      code: 'api_not_found',
    })
    expect(JSON.stringify(body)).not.toContain('<!DOCTYPE html>')
  })

  it('leaves normal API paths to their route handlers', () => {
    expect(apiRequestBoundaryResponse({ url: 'https://ae.example/api/unknown' })).toBeUndefined()
  })
})
