import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'

import {
  customerRequestAgentResultSchema,
  customerRequestRouteConfirmationInputSchema,
} from './agent-contract'
import { confirmCustomerRequestThroughSource } from './customer-request.functions'

const confirmationActionInputSchema = customerRequestRouteConfirmationInputSchema.extend({
  requestRef: z.string().trim().min(1).max(200),
}).strict()

const parameters: readonly ActionParameter[] = [
  { name: 'requestRef', type: 'string', description: 'The existing Customer Request to continue.', required: true },
  { name: 'revision', type: 'number', description: 'The exact Request revision shown with the option.', required: true },
  { name: 'routeRef', type: 'string', description: 'The exact displayed option being confirmed.', required: true },
  { name: 'idempotencyKey', type: 'string', description: 'A stable retry key for this confirmation.', required: true },
]

export const customerRequestConfirmAction = defineAction({
  id: 'customerRequest.confirm',
  name: 'Confirm a Customer Request option',
  summary: 'Confirm one exact current option and receive a bounded confirmation receipt.',
  boundaries: [
    'Does not start, book, charge, dispatch, contact, or fulfil anything.',
    'The caller supplies only the displayed option reference; AE derives the authority limits from the current option.',
    'A stale, expired, changed, or differently replayed option is not confirmed.',
  ],
  schema: confirmationActionInputSchema,
  outputSchema: customerRequestAgentResultSchema,
  parameters,
  readOnly: false,
  surfaces: ['ui', 'http', 'agentJson'],
  run: async ({ data }) => confirmCustomerRequestThroughSource(data),
})
