import { callSourceAction, sourceAction } from '@/lib/server/convex-source'
import { handleCustomerRequestPostBoundary } from '@/lib/server/customer-request-route-action-api'
import type { CustomerRequestProjection } from '@/modules/customer-request/customer-projection'
import {
  customerRequestAgentResultSchema,
  customerRequestOptionsInputSchema,
  type CustomerRequestAgentResult,
} from '@/modules/customer-request/agent-contract'

const compareAction = sourceAction<Record<string, unknown>, CustomerRequestProjection>('customerRequestApplication:compare')
type HandlerOptions = Readonly<{ compare?: (args: Record<string, unknown>) => Promise<CustomerRequestProjection> }>

export async function handleCustomerOptionsPost(request: Request, requestRef: string, options: HandlerOptions = {}): Promise<Response> {
  return handleCustomerRequestPostBoundary({
    request,
    requestRef,
    maxBodyBytes: 4 * 1024,
    inputSchema: customerRequestOptionsInputSchema,
    resultSchema: customerRequestAgentResultSchema,
    run: options.compare ?? (async (args) => await callSourceAction(compareAction, args)),
    unavailableError: 'options_unavailable',
    resultToStatus: optionsResultStatus,
  })
}

function optionsResultStatus(result: CustomerRequestAgentResult): number {
  if (result.kind === 'refused') return 401
  if (result.kind === 'conflict') return 409
  return result.state === 'preparing_options' ? 202 : 200
}
