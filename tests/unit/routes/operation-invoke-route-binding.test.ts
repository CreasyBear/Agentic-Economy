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

  it('wires POST invoke on /call and 410 tombstone on /execute', async () => {
    const callHandlers = routeHandlers(OperationCallRoute)
    const callPost = callHandlers[invokeContract.method]
    expect(callPost).toBeTypeOf('function')
    if (callPost === undefined) throw new Error('POST handler missing')
    const callResponse = await callPost({ request, params: {} })
    expect(callResponse.status).toBe(201)

    const callGet = callHandlers.GET
    expect(callGet).toBeTypeOf('function')
    if (callGet === undefined) throw new Error('GET handler missing')
    const callRejected = await callGet({ request, params: {} })
    expect(callRejected.status).toBe(405)
    expect(callRejected.headers.get('allow')).toBe(invokeContract.method)

    const executeHandlers = routeHandlers(OperationExecuteRoute)
    const executePost = executeHandlers.POST
    expect(executePost).toBeTypeOf('function')
    if (executePost === undefined) throw new Error('execute POST handler missing')
    const executeResponse = await executePost({ request, params: {} })
    expect(executeResponse.status).toBe(410)

    const executeGet = executeHandlers.GET
    expect(executeGet).toBeTypeOf('function')
    if (executeGet === undefined) throw new Error('execute GET handler missing')
    const executeRejected = await executeGet({ request, params: {} })
    expect(executeRejected.status).toBe(410)

    expect(mocks.invoke).toHaveBeenCalledTimes(1)
  })
})
