import { describe, expect, it } from 'vitest'

import { handleCustomerRequestPost } from '@/lib/server/customer-request-api'
import { handleCustomerRequestEvidenceGet } from '@/lib/server/customer-request-recovery-api'
import { handleWorkTreeAgentAction } from '@/lib/server/work-tree-agent-api'
import { Route as OperationCallRoute } from '@/routes/api.v1.operations.call'
import { Route as OperationExecuteRoute } from '@/routes/api.v1.operations.execute'
import {
  DEPRECATION_NOTICE_EPOCH_SECONDS,
  DEPRECATION_SUCCESSOR_PATH,
  RFC9745_DEPRECATION_HEADER,
  RFC9745_DEPRECATION_LINK,
  SUNSET_HTTP_DATE,
  sunsetIsAfterDeprecation,
} from '@/modules/product-frontier/deprecation-notice'
import { postJsonRequest } from '../../helpers/http'

type Method = 'GET' | 'POST'
type RouteHandlers = Partial<Record<Method, (context: { request: Request; params: Record<string, string> }) => Response | Promise<Response>>>

function routeHandlers(route: unknown): RouteHandlers {
  const handlers = (route as { options: { server?: { handlers?: unknown } } }).options.server?.handlers
  if (handlers === undefined) throw new Error('route_handlers_missing')
  return handlers as RouteHandlers
}

function expectRfc9745Notice(response: Response) {
  expect(response.headers.get('Deprecation')).toBe(RFC9745_DEPRECATION_HEADER)
  expect(response.headers.get('Deprecation')).toMatch(/^@\d+$/u)
  expect(response.headers.get('Sunset')).toBe(SUNSET_HTTP_DATE)
  expect(response.headers.get('Link')).toBe(RFC9745_DEPRECATION_LINK)
  expect(response.headers.get('Link')).toContain(`<${DEPRECATION_SUCCESSOR_PATH}>`)
  expect(response.headers.get('Link')).toContain('rel="deprecation"')
  const sunsetMs = Date.parse(SUNSET_HTTP_DATE)
  const deprecationMs = DEPRECATION_NOTICE_EPOCH_SECONDS * 1_000
  expect(Number.isFinite(sunsetMs)).toBe(true)
  expect(sunsetMs).toBeGreaterThanOrEqual(deprecationMs)
}

describe('RFC 9745/8594 deprecation notice', () => {
  it('keeps Sunset after Deprecation as RFC 9745 section 4 requires', () => {
    expect(sunsetIsAfterDeprecation()).toBe(true)
    expect(SUNSET_HTTP_DATE).toBe('Tue, 18 Aug 2026 23:59:59 GMT')
  })

  it('advertises notice on /execute and never on /call', async () => {
    const executeHandlers = routeHandlers(OperationExecuteRoute)
    const callHandlers = routeHandlers(OperationCallRoute)
    const executeGet = executeHandlers.GET
    const callGet = callHandlers.GET
    if (executeGet === undefined || callGet === undefined) throw new Error('get_handlers_missing')

    const executeRejected = await executeGet({
      request: new Request('https://ae.example/api/v1/operations/execute'),
      params: {},
    })
    expectRfc9745Notice(executeRejected)
    expect(executeRejected.status).toBe(410)
    const executePost = executeHandlers.POST
    if (executePost === undefined) throw new Error('post_handlers_missing')
    const executePosted = await executePost({
      request: new Request('https://ae.example/api/v1/operations/execute', { method: 'POST' }),
      params: {},
    })
    expectRfc9745Notice(executePosted)
    expect(executePosted.status).toBe(410)

    const callRejected = await callGet({
      request: new Request('https://ae.example/api/v1/operations/call'),
      params: {},
    })
    expect(callRejected.headers.get('Deprecation')).toBeNull()
    expect(callRejected.headers.get('Sunset')).toBeNull()
    expect(callRejected.headers.get('Link')).toBeNull()
    expect(callRejected.status).toBe(405)
  })

  it('advertises notice on quarantined family doors including reads', async () => {
    const frozen = await handleCustomerRequestPost(postJsonRequest('/api/requests', {
      idempotencyKey: 'notice:1', requestRef: 'request:1', agentRef: 'agent:claude', request: 'Find a suitable option',
    }), { submit: async () => { throw new Error('submit_must_not_run') } })
    expectRfc9745Notice(frozen)
    expect(frozen.status).toBe(410)

    const evidence = await handleCustomerRequestEvidenceGet(
      new Request('https://ae.example/api/requests/request:1/evidence'),
      'request:1',
      { inspect: async () => ({ kind: 'refused', reason: 'request_not_found' }) },
    )
    expectRfc9745Notice(evidence)
    expect(evidence.status).not.toBe(410)

    const inspect = await handleWorkTreeAgentAction(
      postJsonRequest('https://ae.example/api/v1/work-tree/inspect', { projectId: 'project:1' }),
      'inspect',
    )
    expectRfc9745Notice(inspect)
  })
})
