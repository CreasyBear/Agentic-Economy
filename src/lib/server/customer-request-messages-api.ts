import { callSourceAction, sourceAction } from '@/lib/server/convex-source'
import { handleCustomerRequestPostBoundary } from '@/lib/server/customer-request-route-action-api'
import type { CustomerRequestProjection, CustomerRequestView } from '@/modules/customer-request/customer-projection'
import {
  customerRequestAgentResultSchema,
  customerRequestMessageInputSchema,
  type CustomerRequestAgentResult,
} from '@/modules/customer-request/agent-contract'
import { sensitiveCustomerRequestRefusal } from '@/modules/customer-request/sensitive-input-admission'
import { response } from '@/lib/server/no-store-response'

export type MessageResult = CustomerRequestProjection | CustomerRequestView | Readonly<{
  kind: 'refused'
  reason: 'authentication_required' | 'request_not_found' | 'interpreter_unavailable'
    | 'capabilities_unavailable' | 'invalid_amendment'
}>

const refineAction = sourceAction<Record<string, unknown>, MessageResult>('customerRequestApplication:refine')
type HandlerOptions = Readonly<{ refine?: (args: Record<string, unknown>) => Promise<MessageResult> }>

export async function handleCustomerRequestMessagePost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return handleCustomerRequestPostBoundary({
    request,
    requestRef,
    maxBodyBytes: 32 * 1024,
    inputSchema: customerRequestMessageInputSchema,
    resultSchema: customerRequestAgentResultSchema,
    domainAdmission: (input) => {
      const sensitiveRefusal = sensitiveCustomerRequestRefusal(input.message)
      return sensitiveRefusal === undefined ? undefined : response(sensitiveRefusal, 422)
    },
    run: options.refine ?? (async (args) => await callSourceAction(refineAction, args)),
    unavailableError: 'request_unavailable',
    resultToStatus: messageResultStatus,
  })
}

function messageResultStatus(result: CustomerRequestAgentResult): number {
  if (result.kind === 'refused') {
    return result.reason === 'authentication_required'
      ? 401
      : result.reason === 'request_not_found'
        ? 404
        : result.reason === 'invalid_amendment'
          ? 400
          : 503
  }
  if (result.kind === 'conflict') return 409
  return 200
}
