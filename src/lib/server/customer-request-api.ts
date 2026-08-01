import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { callSourceAction, ConvexSourceError, sourceAction } from '@/lib/server/convex-source'
import type { CustomerRequestProjection } from '@/modules/customer-request/customer-projection'
import { customerRequestAgentResultSchema, customerRequestSubmitInputSchema } from '@/modules/customer-request/agent-contract'
import {
  sensitiveCustomerRequestRefusal,
} from '@/modules/customer-request/sensitive-input-admission'
import { response } from '@/lib/server/no-store-response'

const bodySchema = customerRequestSubmitInputSchema

export type SubmitResult = CustomerRequestProjection | Readonly<{ kind: 'refused'; reason: 'authentication_required' | 'interpreter_unavailable' | 'capabilities_unavailable' }>
const submitAction = sourceAction<Record<string, unknown>, SubmitResult>('customerRequestApplication:submit')
type HandlerOptions = Readonly<{ submit?: (args: Record<string, unknown>) => Promise<SubmitResult> }>

export async function handleCustomerRequestPost(request: Request, options: HandlerOptions = {}): Promise<Response> {
  const bounded = await readBoundedRequestText(request, 32 * 1024)
  if (!bounded.ok) return response({ error: 'request_too_large' }, 413)
  let unknownBody: unknown
  try { unknownBody = JSON.parse(bounded.text) } catch { return response({ error: 'invalid_json' }, 400) }
  const parsed = bodySchema.safeParse(unknownBody)
  if (!parsed.success) return response({ error: 'invalid_request', fields: parsed.error.issues.map((issue) => issue.path.join('.')) }, 400)
  const sensitiveRefusal = sensitiveCustomerRequestRefusal(parsed.data.request)
  if (sensitiveRefusal !== undefined) return response(sensitiveRefusal, 422)
  try {
    const args = {
      compilationKey: parsed.data.idempotencyKey, requestId: parsed.data.requestRef,
      ...(parsed.data.expectedRevision === undefined ? {} : { expectedRevision: parsed.data.expectedRevision }),
      delegatedAgentId: parsed.data.agentRef, customerJob: parsed.data.request,
      routing: {
        networkId: parsed.data.routing.network,
        ...(parsed.data.routing.currency === undefined ? {} : { currency: parsed.data.routing.currency }),
        ...(parsed.data.routing.maximumSpendMinor === undefined ? {} : { maximumSpendMinor: parsed.data.routing.maximumSpendMinor }),
        ...(parsed.data.routing.optimizeFor === undefined ? {} : { optimizeFor: parsed.data.routing.optimizeFor }),
      },
    }
    const submit = options.submit ?? (async (input: Record<string, unknown>) => await callSourceAction(submitAction, input))
    const result = customerRequestAgentResultSchema.parse(await submit(args))
    if (result.kind === 'refused') return response(result, result.reason === 'authentication_required' ? 401 : 503)
    if (result.kind === 'conflict') return response(result, 409)
    return response(result, 200)
  } catch (error) {
    if (error instanceof ConvexSourceError) return response({ error: error.code }, error.status)
    return response({ error: 'request_unavailable' }, 503)
  }
}

