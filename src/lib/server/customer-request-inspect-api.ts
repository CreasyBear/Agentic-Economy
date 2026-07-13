import { callSourceAction, ConvexSourceError, sourceAction } from '@/lib/server/convex-source'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'
import { customerRequestInspectResultSchema } from '@/modules/customer-request/agent-contract'

export type InspectResult = CustomerRequestView | Readonly<{ kind: 'refused'; reason: 'authentication_required' | 'request_not_found' }>
const inspectAction = sourceAction<Record<string, unknown>, InspectResult>('customerRequestApplication:resume')
type HandlerOptions = Readonly<{ inspect?: (args: Record<string, unknown>) => Promise<InspectResult> }>

export async function handleCustomerRequestGet(requestRef: string, options: HandlerOptions = {}): Promise<Response> {
  if (requestRef.trim().length === 0 || requestRef.length > 200) return response({ error: 'invalid_request_ref' }, 400)
  try {
    const result = customerRequestInspectResultSchema.parse(
      await (options.inspect ?? (async (args) => await callSourceAction(inspectAction, args)))({ requestRef }),
    )
    if (result.kind === 'refused') return response(result, result.reason === 'authentication_required' ? 401 : 404)
    return response(result, result.state === 'preparing_options' ? 202 : 200)
  } catch (error) {
    if (error instanceof ConvexSourceError) return response({ error: error.code }, error.status)
    return response({ error: 'request_unavailable' }, 503)
  }
}

function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
