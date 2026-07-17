import { z } from 'zod'

import {
  CUSTOMER_REQUEST_AGENT_ENTRYPOINT,
  CUSTOMER_REQUEST_NAVIGATION_RELATION_VALUES,
  CUSTOMER_REQUEST_STATE_VALUES,
  customerRequestAgentResultSchema,
  customerRequestCancellationInputSchema,
  customerRequestFactInputSchema,
  customerRequestMessageInputSchema,
  customerRequestOptionsInputSchema,
  customerRequestProblemInputSchema,
  customerRequestRouteActionInputSchema,
  customerRequestRouteConfirmationInputSchema,
  customerRequestSubmitInputSchema,
} from '@/modules/customer-request/agent-contract'
import { CUSTOMER_REQUEST_PUBLIC_COMPREHENSION } from '@/modules/customer-request/public-comprehension'

export const CUSTOMER_REQUEST_CONTRACT_SCHEMA_VERSION = 'customer-request-contract:v1' as const

const operations = {
  submit: operation('POST', '/api/v1/requests', customerRequestSubmitInputSchema),
  inspectRequest: { method: 'GET' as const, path: '/api/v1/requests/{requestRef}' },
  answerClarification: operation('POST', '/api/v1/requests/{requestRef}/facts', customerRequestFactInputSchema),
  changeRequest: operation('POST', '/api/v1/requests/{requestRef}/messages', customerRequestMessageInputSchema),
  prepareOptions: operation('POST', '/api/v1/requests/{requestRef}/options', customerRequestOptionsInputSchema),
  confirmOption: operation('POST', '/api/v1/requests/{requestRef}/confirmation', customerRequestRouteConfirmationInputSchema),
  startConfirmedOption: operation('POST', '/api/v1/requests/{requestRef}/run', customerRequestRouteActionInputSchema),
  cancel: operation('POST', '/api/v1/requests/{requestRef}/cancellation', customerRequestCancellationInputSchema),
  reportProblem: operation('POST', '/api/v1/requests/{requestRef}/problems', customerRequestProblemInputSchema),
  inspectEvidence: { method: 'GET' as const, path: '/api/v1/requests/{requestRef}/evidence' },
} as const

export function buildCustomerRequestContractSchema() {
  return {
    kind: 'customer_request_contract' as const,
    schemaVersion: CUSTOMER_REQUEST_CONTRACT_SCHEMA_VERSION,
    entrypoint: CUSTOMER_REQUEST_AGENT_ENTRYPOINT,
    lifecycleStates: CUSTOMER_REQUEST_STATE_VALUES,
    navigationRelations: CUSTOMER_REQUEST_NAVIGATION_RELATION_VALUES,
    continuation: {
      source: 'latest_response.navigation.actions' as const,
      rule: 'follow_exactly_one_matching_relation' as const,
      inputRule: 'replace_placeholders_only' as const,
      rejectUnadvertisedFields: true as const,
    },
    authority: {
      confirmationStartsWork: false as const,
      startingRequiresConfirmation: true as const,
      callerMayConstructLimitsOrEffects: false as const,
    },
    operations,
    resultSchema: z.toJSONSchema(customerRequestAgentResultSchema, { io: 'output' }),
    claimBoundary: CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.sandboxBoundary,
  }
}

function operation(method: 'POST', path: string, inputSchema: z.ZodType) {
  return { method, path, inputSchema: z.toJSONSchema(inputSchema, { io: 'input' }) }
}
