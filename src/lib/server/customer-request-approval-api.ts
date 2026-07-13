import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { callSourceAction, ConvexSourceError, sourceAction } from '@/lib/server/convex-source'
import {
  customerRequestApprovalInputSchema,
  customerRequestApprovalResultSchema,
  type CustomerRequestApprovalResult,
} from '@/modules/customer-request/agent-contract'

const bodySchema = customerRequestApprovalInputSchema
export type { CustomerRequestApprovalResult } from '@/modules/customer-request/agent-contract'

const approveAction = sourceAction<Record<string, unknown>, CustomerRequestApprovalResult>(
  'customerRequestApplication:approvePreparedAction',
)
type HandlerOptions = Readonly<{
  approve?: (args: Record<string, unknown>) => Promise<CustomerRequestApprovalResult>
}>

export async function handleCustomerRequestApprovalPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  if (requestRef.trim().length === 0 || requestRef.length > 200) {
    return response({ error: 'invalid_request_ref' }, 400)
  }
  const bounded = await readBoundedRequestText(request, 8 * 1024)
  if (!bounded.ok) return response({ error: 'request_too_large' }, 413)
  let body: unknown
  try { body = JSON.parse(bounded.text) } catch { return response({ error: 'invalid_json' }, 400) }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return response({ error: 'invalid_request' }, 400)
  try {
    const result = customerRequestApprovalResultSchema.parse(
      await (options.approve ?? (async (args) => await callSourceAction(approveAction, args)))({
        requestRef,
        ...parsed.data,
      }),
    )
    if (result.kind === 'conflict') return response(result, 409)
    if (result.kind === 'refused') return response(
      result,
      result.reason === 'authentication_required' ? 401
        : result.reason === 'request_not_found' ? 404 : 422,
    )
    return response(result, 200)
  } catch (error) {
    if (error instanceof ConvexSourceError) return response({ error: error.code }, error.status)
    return response({ error: 'approval_unavailable' }, 503)
  }
}

function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
