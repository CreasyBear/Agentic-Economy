import { describe, expect, it } from 'vitest'

import { Route } from '@/routes/api.v1.requests.$requestRef.options'

describe('POST /api/v1/requests/:requestRef/options method boundary', () => {
  it('returns a Problem Details 405 that advertises POST for GET', async () => {
    const handlers = Route.options.server?.handlers
    if (handlers === undefined || typeof handlers !== 'object' || handlers === null) {
      throw new Error('customer options handlers are not registered')
    }
    expect(Reflect.get(handlers, 'POST')).toBeTypeOf('function')
    const handler = Reflect.get(handlers, 'GET')
    expect(handler).toBeTypeOf('function')
    if (typeof handler !== 'function') throw new Error('GET handler is not registered')
    const result: unknown = await handler({
      request: new Request('https://ae.example/api/v1/requests/request%3A1/options', { method: 'GET' }),
      params: { requestRef: 'request:1' },
    } as never)
    if (!(result instanceof Response)) {
      throw new Error('GET handler did not return a Response')
    }

    expect(result.status).toBe(405)
    expect(result.headers.get('content-type')).toBe('application/problem+json')
    expect(result.headers.get('allow')).toBe('POST')
    await expect(result.json()).resolves.toMatchObject({
      status: 405,
      kind: 'METHOD_NOT_ALLOWED',
      code: 'method_not_allowed',
    })
  })
})
