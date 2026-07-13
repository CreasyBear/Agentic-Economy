import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { callSourceAction, ConvexSourceError, sourceAction } from '@/lib/server/convex-source'
import { customerRequestActionAttemptInputSchema } from '@/modules/customer-request/agent-contract'

const bodySchema = customerRequestActionAttemptInputSchema

export type CustomerRequestActionAttemptResult = Readonly<
  | {
      kind: 'accepted'; requestRef: string; revision: number; actionAttemptRef: string
      state: 'admitted'; expiresAt: number
      recovery: Readonly<{ unknownOutcome: 'reconcile_only'; automaticRetry: false }>
    }
  | {
      kind: 'conflict'; requestRef: string
      reason: 'revision_changed' | 'idempotency_key_reused' | 'approval_used'
    }
  | { kind: 'refused'; reason: 'authentication_required' | 'request_not_found' | 'admission_invalid' }
>

const admitAction = sourceAction<Record<string, unknown>, CustomerRequestActionAttemptResult>(
  'customerRequestApplication:admitApprovedAction',
)
type HandlerOptions = Readonly<{
  admit?: (args: Record<string, unknown>) => Promise<CustomerRequestActionAttemptResult>
}>

export async function handleCustomerRequestActionAttemptPost(
  request: Request, requestRef: string, options: HandlerOptions = {},
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
    const result = await (options.admit ?? (async (args) => await callSourceAction(admitAction, args)))({
      requestRef, ...parsed.data,
    })
    if (result.kind === 'conflict') return response(result, 409)
    if (result.kind === 'refused') return response(
      result,
      result.reason === 'authentication_required' ? 401
        : result.reason === 'request_not_found' ? 404 : 422,
    )
    return response(result, 202)
  } catch (error) {
    if (error instanceof ConvexSourceError) return response({ error: error.code }, error.status)
    return response({ error: 'admission_unavailable' }, 503)
  }
}

function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
