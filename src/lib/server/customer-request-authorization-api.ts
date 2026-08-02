import { callSourceAction, sourceAction } from '@/lib/server/convex-source'
import { customerRequestResultStatus, handleCustomerRequestPostBoundary } from '@/lib/server/customer-request-route-action-api'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'
import {
  customerRequestAgentResultSchema,
  customerRequestAuthorizationInputSchema,
} from '@/modules/customer-request/agent-contract'

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
  return handleCustomerRequestPostBoundary({
    request,
    requestRef,
    maxBodyBytes: 16 * 1024,
    inputSchema: customerRequestAuthorizationInputSchema,
    resultSchema: customerRequestAgentResultSchema,
    run: options.authorize ?? (async (args) => await callSourceAction(authorizeAction, args)),
    unavailableError: 'request_unavailable',
    resultToStatus: customerRequestResultStatus,
  })
}


