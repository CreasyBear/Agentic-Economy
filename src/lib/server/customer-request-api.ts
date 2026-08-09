import { callSourceAction, sourceAction } from '@/lib/server/convex-source'
import { handleCustomerRequestPostBoundary } from '@/lib/server/customer-request-route-action-api'
import type { CustomerRequestProjection } from '@/modules/customer-request/customer-projection'
import {
  customerRequestAgentResultSchema,
  customerRequestSubmitInputSchema,
  type CustomerRequestAgentResult,
} from '@/modules/customer-request/agent-contract'
import { sensitiveCustomerRequestRefusal } from '@/modules/customer-request/sensitive-input-admission'
import { response } from '@/lib/server/no-store-response'

export type SubmitResult = CustomerRequestProjection | Readonly<{
  kind: 'refused'
  reason: 'authentication_required' | 'interpreter_unavailable' | 'capabilities_unavailable' | 'rate_limited'
}>
const submitAction = sourceAction<Record<string, unknown>, SubmitResult>('customerRequestApplication:submit')
type HandlerOptions = Readonly<{ submit?: (args: Record<string, unknown>) => Promise<SubmitResult> }>

export async function handleCustomerRequestPost(request: Request, options: HandlerOptions = {}): Promise<Response> {
  return handleCustomerRequestPostBoundary({
    request,
    maxBodyBytes: 32 * 1024,
    inputSchema: customerRequestSubmitInputSchema,
    resultSchema: customerRequestAgentResultSchema,
    domainAdmission: (input) => {
      const sensitiveRefusal = sensitiveCustomerRequestRefusal(input.request)
      return sensitiveRefusal === undefined ? undefined : response(sensitiveRefusal, 422)
    },
    buildCommand: (input) => ({
      compilationKey: input.idempotencyKey,
      requestId: input.requestRef,
      ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
      delegatedAgentId: input.agentRef,
      customerJob: input.request,
      routing: {
        networkId: input.routing.network,
        ...(input.routing.maximumSpend === undefined ? {} : { maximumSpend: input.routing.maximumSpend }),
        ...(input.routing.optimizeFor === undefined ? {} : { optimizeFor: input.routing.optimizeFor }),
      },
    }),
    run: options.submit ?? (async (args) => await callSourceAction(submitAction, args)),
    unavailableError: 'request_unavailable',
    resultToStatus: submitResultStatus,
    includeInvalidFields: true,
  })
}

function submitResultStatus(result: CustomerRequestAgentResult): number {
  if (result.kind === 'refused') {
    return result.reason === 'authentication_required' ? 401 : result.reason === 'rate_limited' ? 429 : 503
  }
  if (result.kind === 'conflict') return 409
  return 200
}
