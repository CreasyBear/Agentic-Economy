import { describe, expect, it } from 'vitest'

import { Route as ActivityRoute } from '@/routes/api.v1.account.activity'
import { Route as BalanceRoute } from '@/routes/api.v1.account.balance'

type RouteWithHandlers = Readonly<{
  options: Readonly<{
    server: Readonly<{
      handlers: Readonly<Record<string, () => Response | Promise<Response>>>
    }>
  }>
}>

const rejectedMethods = ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'] as const

describe('account money route method contract', () => {
  for (const [label, route] of [
    ['balance', BalanceRoute],
    ['activity', ActivityRoute],
  ] as const) {
    it(`returns one explicit 405 contract for unsupported ${label} methods`, async () => {
      const handlers = (route as unknown as RouteWithHandlers).options.server.handlers

      for (const method of rejectedMethods) {
        const handler = handlers[method]
        expect(handler, `${method} handler`).toBeTypeOf('function')
        if (handler === undefined) continue
        const response = await handler()
        expect(response.status).toBe(405)
        expect(response.headers.get('allow')).toBe('POST')
        await expect(response.json()).resolves.toMatchObject({
          kind: 'METHOD_NOT_ALLOWED',
          code: 'method_not_allowed',
        })
      }
    })
  }
})
