import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { customerRequestConfirmAction } from '@/modules/customer-request/customer-request.actions'
import type { CustomerRequestProjection } from '@/modules/customer-request/customer-projection'
import {
  customerRequestAgentResultSchema,
  customerRequestRouteConfirmationInputSchema,
} from '@/modules/customer-request/agent-contract'

export type ConfirmationResult = CustomerRequestProjection | Readonly<{
  kind: 'refused'
  reason: 'authentication_required' | 'request_not_found' | 'interpreter_unavailable' | 'capabilities_unavailable'
}>

type HandlerOptions = Readonly<{ confirm?: (args: Record<string, unknown>) => Promise<ConfirmationResult> }>

export async function handleCustomerRequestConfirmationPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  if (requestRef.trim().length === 0 || requestRef.length > 200) return response({ error: 'invalid_request_ref' }, 400)
  const bounded = await readBoundedRequestText(request, 4 * 1024)
  if (!bounded.ok) return response({ error: 'request_too_large' }, 413)
  let body: unknown
  try { body = JSON.parse(bounded.text) } catch { return response({ error: 'invalid_json' }, 400) }
  const parsed = customerRequestRouteConfirmationInputSchema.safeParse(body)
  if (!parsed.success) return response({ error: 'invalid_request' }, 400)
  try {
    const result = customerRequestAgentResultSchema.parse(
      await (options.confirm ?? (async (input) => await customerRequestConfirmAction.run({
        data: customerRequestConfirmAction.schema.parse(input),
        context: { request },
      })))({
        requestRef, ...parsed.data,
      }),
    )
    if (result.kind === 'refused') return response(result, result.reason === 'authentication_required' ? 401 : 404)
    if (result.kind === 'conflict') return response(result, 409)
    return response(result, 200)
  } catch (error) {
    if (error instanceof ConvexSourceError) return response({ error: error.code }, error.status)
    return response({ error: 'confirmation_unavailable' }, 503)
  }
}

function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
