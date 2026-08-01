import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { ConvexSourceError } from '@/lib/server/convex-source'
import {
  customerRequestCancelAction,
  customerRequestRunAction,
} from '@/modules/customer-request/customer-request.actions'
import {
  customerRequestAgentResultSchema,
  customerRequestCancellationInputSchema,
  customerRequestRouteActionInputSchema,
  type CustomerRequestAgentResult,
} from '@/modules/customer-request/agent-contract'
import { response } from '@/lib/server/no-store-response'

type HandlerOptions = Readonly<{
  run?: (args: Record<string, unknown>) => Promise<CustomerRequestAgentResult>
  cancel?: (args: Record<string, unknown>) => Promise<CustomerRequestAgentResult>
}>

export async function handleCustomerRequestRunPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return handleRouteAction(
    request, requestRef, options.run,
    async (command) => await customerRequestRunAction.run({
      data: customerRequestRunAction.schema.parse(command), context: { request },
    }),
    customerRequestRouteActionInputSchema, 'run_unavailable',
  )
}

export async function handleCustomerRequestCancelPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return handleRouteAction(
    request, requestRef, options.cancel,
    async (command) => await customerRequestCancelAction.run({
      data: customerRequestCancelAction.schema.parse(command), context: { request },
    }),
    customerRequestCancellationInputSchema, 'cancellation_unavailable',
  )
}

async function handleRouteAction(
  request: Request,
  requestRef: string,
  injected: ((args: Record<string, unknown>) => Promise<CustomerRequestAgentResult>) | undefined,
  runAction: (args: Record<string, unknown>) => Promise<CustomerRequestAgentResult>,
  inputSchema: typeof customerRequestRouteActionInputSchema | typeof customerRequestCancellationInputSchema,
  unavailableError: string,
): Promise<Response> {
  if (requestRef.trim().length === 0 || requestRef.length > 200) return response({ error: 'invalid_request_ref' }, 400)
  const bounded = await readBoundedRequestText(request, 4 * 1024)
  if (!bounded.ok) return response({ error: 'request_too_large' }, 413)
  let body: unknown
  try { body = JSON.parse(bounded.text) } catch { return response({ error: 'invalid_json' }, 400) }
  const parsed = inputSchema.safeParse(body)
  if (!parsed.success) return response({ error: 'invalid_request' }, 400)
  try {
    const command = { requestRef, ...parsed.data }
    const result = customerRequestAgentResultSchema.parse(await (injected ?? runAction)(command))
    if (result.kind === 'refused') return response(result, result.reason === 'authentication_required' ? 401 : 404)
    if (result.kind === 'conflict') return response(result, 409)
    return response(result, 200)
  } catch (error) {
    if (error instanceof ConvexSourceError) return response({ error: error.code }, error.status)
    return response({ error: unavailableError }, 503)
  }
}

