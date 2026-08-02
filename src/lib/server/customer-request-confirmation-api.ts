import { customerRequestResultStatus, handleCustomerRequestPostBoundary } from '@/lib/server/customer-request-route-action-api'
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
  return handleCustomerRequestPostBoundary({
    request,
    requestRef,
    maxBodyBytes: 4 * 1024,
    inputSchema: customerRequestRouteConfirmationInputSchema,
    resultSchema: customerRequestAgentResultSchema,
    run: options.confirm ?? (async (input) => await customerRequestConfirmAction.run({
      data: customerRequestConfirmAction.schema.parse(input),
      context: { request },
    })),
    unavailableError: 'confirmation_unavailable',
    resultToStatus: customerRequestResultStatus,
  })
}


