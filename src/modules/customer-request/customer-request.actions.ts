import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'

import {
  customerRequestAgentResultSchema,
  customerRequestEvidenceResultSchema,
  customerRequestProblemInputSchema,
  customerRequestProblemReplyInputSchema,
  customerRequestProblemResultSchema,
  customerRequestProblemStatusChangeSchema,
  customerRequestRouteActionInputSchema,
  customerRequestRouteConfirmationInputSchema,
} from './agent-contract'
import {
  cancelCustomerRequestThroughSource,
  confirmCustomerRequestThroughSource,
  runCustomerRequestThroughSource,
  inspectCustomerRequestEvidenceThroughSource,
  reportCustomerRequestProblemThroughSource,
  replyCustomerRequestProblemThroughSource,
} from './customer-request.functions'

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

const routeActionInputSchema = customerRequestRouteActionInputSchema.extend({
  requestRef: z.string().trim().min(1).max(200),
}).strict()

const routeActionParameters: readonly ActionParameter[] = [
  { name: 'requestRef', type: 'string', description: 'The confirmed Customer Request to continue.', required: true },
  { name: 'idempotencyKey', type: 'string', description: 'A stable retry key for this operation.', required: true },
]

export const customerRequestRunAction = defineAction({
  id: 'customerRequest.run',
  name: 'Start a confirmed Customer Request',
  summary: 'Start or safely resume the exact option already confirmed for this Request.',
  boundaries: [
    'Does not let the caller choose businesses, steps, costs, data recipients, or execution mechanics.',
    'Only the current unexpired confirmation can start.',
    'Repeating the same operation key does not duplicate the work.',
  ],
  schema: routeActionInputSchema,
  outputSchema: customerRequestAgentResultSchema,
  parameters: routeActionParameters,
  readOnly: false,
  surfaces: ['ui', 'http', 'agentJson'],
  run: async ({ data }) => runCustomerRequestThroughSource(data),
})

export const customerRequestCancelAction = defineAction({
  id: 'customerRequest.cancel',
  name: 'Stop a Customer Request',
  summary: 'Stop the current Request before another business step begins when that remains safe.',
  boundaries: [
    'Does not claim to reverse a business action that may already have happened.',
    'AE reports when it is too late to stop safely.',
    'Repeating the same operation key does not duplicate the cancellation.',
  ],
  schema: routeActionInputSchema,
  outputSchema: customerRequestAgentResultSchema,
  parameters: routeActionParameters,
  readOnly: false,
  surfaces: ['ui', 'http', 'agentJson'],
  run: async ({ data }) => cancelCustomerRequestThroughSource(data),
})

const problemInputSchema = customerRequestProblemInputSchema.extend({
  requestRef: z.string().trim().min(1).max(200),
}).strict()

export const customerRequestReportProblemAction = defineAction({
  id: 'customerRequest.reportProblem',
  name: 'Report a problem with a Customer Request',
  summary: 'Attach a customer-reported problem to the current Request and receive a durable receipt.',
  boundaries: [
    'Does not change or retry the work.',
    'AE derives the current activity and caller identity from the Request.',
    'A receipt confirms reporting, not resolution.',
  ],
  schema: problemInputSchema,
  outputSchema: customerRequestProblemResultSchema,
  parameters: [
    ...routeActionParameters,
    { name: 'category', type: 'enum', description: 'The customer-visible problem category.', required: true, enum: ['incorrect_result', 'unexpected_cost', 'duplicate_charge_or_effect', 'privacy_concern', 'could_not_stop', 'other'] },
    { name: 'summary', type: 'string', description: 'A short description of what went wrong.', required: true },
    { name: 'affectedStep', type: 'number', description: 'The customer-selected step this report is about.', required: false },
    { name: 'evidenceReceiptRefs', type: 'string', description: 'JSON array of existing AE evidence receipt references selected from that step.', required: false },
    { name: 'visibility', type: 'enum', description: 'Whether the report stays with the customer and AE or may be shared with the affected business.', required: false, enum: ['customer_and_ae_only', 'share_with_affected_business'] },
  ],
  readOnly: false,
  surfaces: ['ui', 'http', 'agentJson'],
  run: async ({ data }) => customerRequestProblemResultSchema.parse(
    await reportCustomerRequestProblemThroughSource(data),
  ),
})

const problemReplyInputSchema = customerRequestProblemReplyInputSchema.extend({
  requestRef: z.string().trim().min(1).max(200),
  reportRef: z.string().trim().min(1).max(300),
}).strict()

export const customerRequestReplyProblemAction = defineAction({
  id: 'customerRequest.replyProblem',
  name: 'Reply to a Customer Request problem',
  summary: 'Add requested customer information to one exact reported problem.',
  boundaries: [
    'Only the customer who owns the Request can reply.',
    'A reply does not retry work, decide responsibility, or authorize a remedy.',
    'Stale or differently replayed replies fail closed.',
  ],
  schema: problemReplyInputSchema,
  outputSchema: customerRequestProblemStatusChangeSchema,
  parameters: [
    { name: 'requestRef', type: 'string', description: 'The existing Customer Request.', required: true },
    { name: 'reportRef', type: 'string', description: 'The exact reported problem awaiting information.', required: true },
    { name: 'expectedVersion', type: 'number', description: 'The latest problem version shown to the customer.', required: true },
    { name: 'idempotencyKey', type: 'string', description: 'A stable retry key for this reply.', required: true },
    { name: 'message', type: 'string', description: 'The requested customer information.', required: true },
  ],
  readOnly: false,
  surfaces: ['ui', 'http', 'agentJson'],
  run: async ({ data }) => customerRequestProblemStatusChangeSchema.parse(
    await replyCustomerRequestProblemThroughSource(data),
  ),
})

const evidenceInputSchema = z.strictObject({ requestRef: z.string().trim().min(1).max(200) })

export const customerRequestInspectEvidenceAction = defineAction({
  id: 'customerRequest.inspectEvidence',
  name: 'Export Customer Request evidence',
  summary: 'Return a customer-safe receipt of the observed steps and result for this Request.',
  boundaries: [
    'Returns observed evidence only and never manufactures completion.',
    'Does not expose credentials, transport payloads, or routing internals.',
    'Does not retry or change the Request.',
  ],
  schema: evidenceInputSchema,
  outputSchema: customerRequestEvidenceResultSchema,
  parameters: [{ name: 'requestRef', type: 'string', description: 'The Customer Request to inspect.', required: true }],
  readOnly: true,
  surfaces: ['ui', 'http', 'agentJson'],
  run: async ({ data }) => inspectCustomerRequestEvidenceThroughSource(data),
})
