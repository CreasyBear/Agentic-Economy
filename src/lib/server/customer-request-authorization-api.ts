import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { callSourceAction, ConvexSourceError, sourceAction } from '@/lib/server/convex-source'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'
import { customerRequestAgentResultSchema, customerRequestAuthorizationInputSchema } from '@/modules/customer-request/agent-contract'

const bodySchema = customerRequestAuthorizationInputSchema
type AuthorizationResult = CustomerRequestView
  | Readonly<{ kind: 'conflict'; requestRef: string; reason: 'revision_changed' }>
  | Readonly<{ kind: 'refused'; reason: 'authentication_required' | 'request_not_found' }>
const authorizeAction = sourceAction<Record<string, unknown>, AuthorizationResult>('customerRequestApplication:authorizePreparation')
type HandlerOptions = Readonly<{ authorize?: (args: Record<string, unknown>) => Promise<AuthorizationResult> }>

export async function handleCustomerRequestAuthorizationPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  if (requestRef.trim().length === 0 || requestRef.length > 200) return response({ error: 'invalid_request_ref' }, 400)
  const bounded = await readBoundedRequestText(request, 16 * 1024)
  if (!bounded.ok) return response({ error: 'request_too_large' }, 413)
  let body: unknown
  try { body = JSON.parse(bounded.text) } catch { return response({ error: 'invalid_json' }, 400) }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return response({ error: 'invalid_request' }, 400)
  try {
    const result = customerRequestAgentResultSchema.parse(
      await (options.authorize ?? (async (args) => await callSourceAction(authorizeAction, args)))({
        requestRef, ...parsed.data,
      }),
    )
    if (result.kind === 'refused') return response(result, result.reason === 'authentication_required' ? 401 : 404)
    if (result.kind === 'conflict') return response(result, 409)
    return response(result, 200)
  } catch (error) {
    if (error instanceof ConvexSourceError) return response({ error: error.code }, error.status)
    return response({ error: 'request_unavailable' }, 503)
  }
}

function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
