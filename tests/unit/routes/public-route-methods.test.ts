import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async () => new Response('invoked', { status: 201 })),
  prepare: vi.fn(async () => new Response('prepared', { status: 202 })),
  readOfferingManifest: vi.fn(async () => ({
    kind: 'published' as const,
    manifest: { businessId: 'private-business', routes: [] },
  })),
  readLlmsTxt: vi.fn(async () => ({ body: 'llms body' })),
}))

vi.mock('@/lib/server/business-tool-api', () => ({
  handleBusinessToolInvoke: mocks.invoke,
  handleBusinessToolPrepare: mocks.prepare,
}))

vi.mock('@/modules/discovery/discovery.functions', () => ({
  readPublicOfferingDiscoveryManifest: mocks.readOfferingManifest,
  readPublicLlmsTxt: mocks.readLlmsTxt,
}))

import { Route as ToolInvokeRoute } from '@/routes/$slug.tools.$toolId'
import { Route as ToolPrepareRoute } from '@/routes/$slug.tools.$toolId.prepare'
import { Route as UcpRoute } from '@/routes/$slug.ucp'
import { Route as SkillRoute } from '@/routes/SKILL[.]md'
import { Route as SiteUcpRoute } from '@/routes/[.]well-known/ucp'
import { Route as LlmsRoute } from '@/routes/llms[.]txt'
import { Route as RobotsRoute } from '@/routes/robots[.]txt'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'TRACE' | 'CONNECT'
type RouteContext = { request: Request; params: Record<string, string> }
type RouteHandler = (context: RouteContext) => Response | Promise<Response>
type RouteHandlers = Partial<Record<Method, RouteHandler>>
type RouteCase = {
  name: string
  route: unknown
  allowed: Method
  params?: Record<string, string>
}
type RouteLike = { options: { server?: { handlers?: unknown } } }

const request = new Request('https://ae.example/public-route')
const routeCases: RouteCase[] = [
  { name: 'tool invoke', route: ToolInvokeRoute, allowed: 'POST', params: { slug: 'demo', toolId: 'quote' } },
  { name: 'tool prepare', route: ToolPrepareRoute, allowed: 'POST', params: { slug: 'demo', toolId: 'quote' } },
  { name: 'business UCP', route: UcpRoute, allowed: 'GET', params: { slug: 'demo' } },
  { name: 'SKILL.md', route: SkillRoute, allowed: 'GET' },
  { name: 'site UCP', route: SiteUcpRoute, allowed: 'GET' },
  { name: 'llms.txt', route: LlmsRoute, allowed: 'GET' },
  { name: 'robots.txt', route: RobotsRoute, allowed: 'GET' },
]

function routeHandlers(route: unknown): RouteHandlers {
  const routeValue = route as RouteLike
  const handlers = routeValue.options.server?.handlers
  if (handlers === undefined) throw new Error('Public route handlers missing')
  return handlers as RouteHandlers
}

async function assertMethodNotAllowed(response: Response, allowed: Method): Promise<void> {
  expect(response.status).toBe(405)
  expect(response.headers.get('content-type')).toBe('application/problem+json')
  expect(response.headers.get('allow')).toBe(allowed)
  await expect(response.json()).resolves.toMatchObject({
    status: 405,
    kind: 'METHOD_NOT_ALLOWED',
    code: 'method_not_allowed',
    detail: `Only ${allowed} are supported by this route.`,
  })
}

describe('public route method contracts', () => {
  it('keeps each route allowed handler wired to its current content handler', async () => {
    const expectedStatus: Record<string, number> = {
      'tool invoke': 201,
      'tool prepare': 202,
      'business UCP': 200,
      'SKILL.md': 200,
      'site UCP': 200,
      'llms.txt': 200,
      'robots.txt': 200,
    }

    for (const routeCase of routeCases) {
      const handlers = routeHandlers(routeCase.route)
      const handler = handlers[routeCase.allowed]
      if (handler === undefined) throw new Error(`${routeCase.name} allowed handler missing`)
      const response = await handler({ request, params: routeCase.params ?? {} })
      expect(response.status, routeCase.name).toBe(expectedStatus[routeCase.name])
    }

    expect(mocks.invoke).toHaveBeenCalledWith(request, 'demo', 'quote')
    expect(mocks.prepare).toHaveBeenCalledWith(request, 'demo', 'quote')
    expect(mocks.readOfferingManifest).toHaveBeenCalledWith(expect.objectContaining({ slug: 'demo' }))
    expect(mocks.readLlmsTxt).toHaveBeenCalledWith(expect.objectContaining({ canonicalBaseUrl: expect.any(String) }))
  })

  it('returns RFC 9457 405 responses with an exact Allow header for every wrong method', async () => {
    const methods: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT']

    for (const routeCase of routeCases) {
      const handlers = routeHandlers(routeCase.route)
      for (const method of methods) {
        if (method === routeCase.allowed) continue
        const handler = handlers[method]
        if (handler === undefined) throw new Error(`${routeCase.name} missing explicit ${method} handler`)
        const response = await handler({ request, params: routeCase.params ?? {} })
        await assertMethodNotAllowed(response, routeCase.allowed)
      }
    }
  })
})
