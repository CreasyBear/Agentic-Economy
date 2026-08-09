import { describe, expect, it } from 'vitest'

import { Route as OAuthTokenRoute } from '@/routes/oauth.token'
import { methodNotAllowed } from '@/lib/server/method-guard'

describe('method not allowed response', () => {
  it('projects a target-accurate Allow header and problem body', async () => {
    const response = methodNotAllowed(['POST'])

    expect(response.status).toBe(405)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(response.headers.get('allow')).toBe('POST')
    await expect(response.json()).resolves.toMatchObject({
      status: 405,
      kind: 'METHOD_NOT_ALLOWED',
      code: 'method_not_allowed',
      detail: 'Only POST are supported by this route.',
    })
  })

  it('preserves the exact order of methods supported by a target', () => {
    const response = methodNotAllowed(['GET', 'DELETE'])
    expect(response.headers.get('allow')).toBe('GET, DELETE')
  })

  it('lets explicit TRACE handlers own the target Allow and body', async () => {
    const handlers = OAuthTokenRoute.options.server?.handlers
    if (handlers === undefined || typeof handlers !== 'object' || handlers === null) {
      throw new Error('OAuth token handlers are missing.')
    }
    const handler = Reflect.get(handlers, 'TRACE')
    if (typeof handler !== 'function') throw new Error('OAuth token TRACE handler is missing.')

    const response = await handler()

    expect(response.status).toBe(405)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(response.headers.get('allow')).toBe('POST')
    await expect(response.json()).resolves.toMatchObject({
      status: 405,
      kind: 'METHOD_NOT_ALLOWED',
      code: 'method_not_allowed',
    })
  })
})
