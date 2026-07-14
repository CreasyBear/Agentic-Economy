import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { ConvexSourceError } from '@/lib/server/convex-source'
import {
  customerRequestCancelAction,
  customerRequestRunAction,
} from '@/modules/customer-request/customer-request.actions'
import {
  customerRequestAgentResultSchema,
  customerRequestRouteActionInputSchema,
  type CustomerRequestAgentResult,
} from '@/modules/customer-request/agent-contract'

type HandlerOptions = Readonly<{
  run?: (args: Record<string, unknown>) => Promise<CustomerRequestAgentResult>
  cancel?: (args: Record<string, unknown>) => Promise<CustomerRequestAgentResult>
}>

export async function handleCustomerRequestRunPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return handleRouteAction(request, requestRef, options.run, customerRequestRunAction, 'run_unavailable')
}

export async function handleCustomerRequestCancelPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return handleRouteAction(request, requestRef, options.cancel, customerRequestCancelAction, 'cancellation_unavailable')
}

async function handleRouteAction(
  request: Request,
  requestRef: string,
  injected: ((args: Record<string, unknown>) => Promise<CustomerRequestAgentResult>) | undefined,
  action: typeof customerRequestRunAction | typeof customerRequestCancelAction,
  unavailableError: string,
): Promise<Response> {
  if (requestRef.trim().length === 0 || requestRef.length > 200) return response({ error: 'invalid_request_ref' }, 400)
  const bounded = await readBoundedRequestText(request, 4 * 1024)
  if (!bounded.ok) return response({ error: 'request_too_large' }, 413)
  let body: unknown
  try { body = JSON.parse(bounded.text) } catch { return response({ error: 'invalid_json' }, 400) }
  const parsed = customerRequestRouteActionInputSchema.safeParse(body)
  if (!parsed.success) return response({ error: 'invalid_request' }, 400)
  try {
    const command = { requestRef, ...parsed.data }
    const result = customerRequestAgentResultSchema.parse(await (injected === undefined
      ? action.run({ data: action.schema.parse(command), context: { request } })
      : injected(command)))
    if (result.kind === 'refused') return response(result, result.reason === 'authentication_required' ? 401 : 404)
    if (result.kind === 'conflict') return response(result, 409)
    return response(result, 200)
  } catch (error) {
    if (error instanceof ConvexSourceError) return response({ error: error.code }, error.status)
    return response({ error: unavailableError }, 503)
  }
}

function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
