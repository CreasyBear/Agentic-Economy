import { callSourceAction, sourceAction } from '@/lib/server/convex-source'

import type {
  CustomerRequestAgentResult,
  CustomerRequestRouteConfirmationInput,
} from './agent-contract'

export type ConfirmCustomerRequestInput = CustomerRequestRouteConfirmationInput & Readonly<{
  requestRef: string
}>

const confirmRouteSourceAction = sourceAction<ConfirmCustomerRequestInput, CustomerRequestAgentResult>(
  'customerRequestApplication:confirmRoute',
)

export async function confirmCustomerRequestThroughSource(
  input: ConfirmCustomerRequestInput,
): Promise<CustomerRequestAgentResult> {
  return callSourceAction(confirmRouteSourceAction, input)
}
