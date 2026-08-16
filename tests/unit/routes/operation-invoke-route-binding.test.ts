import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async () => new Response('invoked', { status: 201 })),
}))

vi.mock('@/lib/server/operation-invoke-api', () => ({
  handleOperationInvokePost: mocks.invoke,
}))

import { Route as OperationCallRoute } from '@/routes/api.v1.operations.call'
import { Route as OperationExecuteRoute } from '@/routes/api.v1.operations.execute'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'TRACE' | 'CONNECT'
type RouteContext = { request: Request; params: Record<string, string> }
type RouteHandler = (context: RouteContext) => Response | Promise<Response>
type RouteHandlers = Partial<Record<Method, RouteHandler>>
type RouteLike = { options: { server?: { handlers?: unknown } } }

const invokeContract = OPERATION_INVOKE_ROUTE_CONTRACT.invoke
const request = new Request('https://ae.example/api/v1/operations/call', { method: 'POST' })

function routeHandlers(route: unknown): RouteHandlers {
  const routeValue = route as RouteLike
  const handlers = routeValue.options.server?.handlers
  if (handlers === undefined) throw new Error('Operation invoke route handlers missing')
  return handlers as RouteHandlers
}

describe('operation invoke route binding', () => {
  it('registers each served file at the contract router path', () => {
    expect(readFileSync('src/routes/api.v1.operations.call.ts', 'utf8'))
      .toContain(`createFileRoute('${invokeContract.routerPath}')`)
    expect(readFileSync('src/routes/api.v1.operations.execute.ts', 'utf8'))
      .toContain(`createFileRoute('${invokeContract.legacyRouterPath}')`)
  })

  it('wires POST and rejects at least one non-POST verb on both routes', async () => {
    for (const route of [OperationCallRoute, OperationExecuteRoute]) {
      const handlers = routeHandlers(route)
      const postHandler = handlers[invokeContract.method]
      expect(postHandler).toBeTypeOf('function')
      if (postHandler === undefined) throw new Error('POST handler missing')

      const response = await postHandler({ request, params: {} })
      expect(response.status).toBe(201)

      const getHandler = handlers.GET
      expect(getHandler).toBeTypeOf('function')
      if (getHandler === undefined) throw new Error('GET handler missing')

      const rejected = await getHandler({ request, params: {} })
      expect(rejected.status).toBe(405)
      expect(rejected.headers.get('allow')).toBe(invokeContract.method)
    }

    expect(mocks.invoke).toHaveBeenCalledTimes(2)
  })
})
