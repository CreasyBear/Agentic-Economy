import { callSourceAction, sourceAction } from '@/lib/server/convex-source'
import { handleCustomerRequestPostBoundary } from '@/lib/server/customer-request-route-action-api'
import type { CustomerRequestProjection, CustomerRequestView } from '@/modules/customer-request/customer-projection'
import {
  customerRequestAgentResultSchema,
  customerRequestFactInputSchema,
  type CustomerRequestAgentResult,
} from '@/modules/customer-request/agent-contract'
import { sensitiveCustomerRequestRefusal } from '@/modules/customer-request/sensitive-input-admission'
import { response } from '@/lib/server/no-store-response'

export type FactsResult = CustomerRequestProjection | CustomerRequestView | Readonly<{
  kind: 'refused'
  reason: 'authentication_required' | 'request_not_found' | 'interpreter_unavailable' | 'capabilities_unavailable'
}>
const factsAction = sourceAction<Record<string, unknown>, FactsResult>('customerRequestApplication:provideFacts')
type HandlerOptions = Readonly<{ provideFacts?: (args: Record<string, unknown>) => Promise<FactsResult> }>

export async function handleCustomerRequestFactsPost(request: Request, requestRef: string, options: HandlerOptions = {}): Promise<Response> {
  return handleCustomerRequestPostBoundary({
    request,
    requestRef,
    maxBodyBytes: 32 * 1024,
    inputSchema: customerRequestFactInputSchema,
    resultSchema: customerRequestAgentResultSchema,
    domainAdmission: (input) => {
      const sensitiveRefusal = sensitiveCustomerRequestRefusal(input.value)
      return sensitiveRefusal === undefined ? undefined : response(sensitiveRefusal, 422)
    },
    run: options.provideFacts ?? (async (args) => await callSourceAction(factsAction, args)),
    unavailableError: 'request_unavailable',
    resultToStatus: factsResultStatus,
  })
}

function factsResultStatus(result: CustomerRequestAgentResult): number {
  if (result.kind === 'refused') {
    return result.reason === 'authentication_required' ? 401 : result.reason === 'request_not_found' ? 404 : 503
  }
  if (result.kind === 'conflict') return 409
  return 200
}
