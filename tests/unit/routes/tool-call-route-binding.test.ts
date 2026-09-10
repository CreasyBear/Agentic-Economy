import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  call: vi.fn(async () => new Response('called', { status: 201 })),
}))

vi.mock('@/lib/server/call-api', () => ({
  handleToolCallPost: mocks.call,
}))

import { Route as ToolCallRoute } from '@/routes/api.v1.tools.call'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'TRACE' | 'CONNECT'
type RouteContext = { request: Request; params: Record<string, string> }
type RouteHandler = (context: RouteContext) => Response | Promise<Response>
type RouteHandlers = Partial<Record<Method, RouteHandler>>
type RouteLike = { options: { server?: { handlers?: unknown } } }

const callContract = CALL_ROUTE_CONTRACT.call
const request = new Request('https://ae.example/api/v1/tools/call', { method: 'POST' })

function routeHandlers(route: unknown): RouteHandlers {
  const routeValue = route as RouteLike
  const handlers = routeValue.options.server?.handlers
  if (handlers === undefined) throw new Error('Tool Call route handlers missing')
  return handlers as RouteHandlers
}

describe('Tool Call route binding', () => {
  it('registers the canonical route at the contract router path', () => {
    expect(readFileSync('src/routes/api.v1.tools.call.ts', 'utf8'))
      .toContain(`createFileRoute('${callContract.routerPath}')`)
  })

  it('wires POST Call on /tools/call', async () => {
    const callHandlers = routeHandlers(ToolCallRoute)
    const callPost = callHandlers[callContract.method]
    expect(callPost).toBeTypeOf('function')
    if (callPost === undefined) throw new Error('POST Call handler missing')
    const callResponse = await callPost({ request, params: {} })
    expect(callResponse.status).toBe(201)

    const callGet = callHandlers.GET
    expect(callGet).toBeTypeOf('function')
    if (callGet === undefined) throw new Error('GET handler missing')
    const callRejected = await callGet({ request, params: {} })
    expect(callRejected.status).toBe(405)
    expect(callRejected.headers.get('allow')).toBe(callContract.method)

    expect(mocks.call).toHaveBeenCalledTimes(1)
  })
})
