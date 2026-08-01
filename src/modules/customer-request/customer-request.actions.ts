import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'

import {
  customerRequestAgentResultSchema,
  customerRequestCancellationInputSchema,
  customerRequestConnectedAssistantsResultSchema,
  customerRequestEvidenceResultSchema,
  customerRequestProblemInputSchema,
  customerRequestProblemReplyInputSchema,
  customerRequestProblemResultSchema,
  customerRequestProblemStatusChangeSchema,
  customerRequestRepeatPermissionAllowInputSchema,
  customerRequestRepeatPermissionInspectInputSchema,
  customerRequestRepeatPermissionResultSchema,
  customerRequestRepeatPermissionUseInputSchema,
  customerRequestRepeatPermissionWithdrawInputSchema,
  customerRequestRouteActionInputSchema,
  customerRequestRouteConfirmationInputSchema,
} from './agent-contract'
import {
  cancelCustomerRequestThroughSource,
  confirmCustomerRequestThroughSource,
  runCustomerRequestThroughSource,
  inspectCustomerRequestEvidenceThroughSource,
  listCustomerRequestAssistantsThroughSource,
  reportCustomerRequestProblemThroughSource,
  replyCustomerRequestProblemThroughSource,
  allowCustomerRequestRepeatPermissionThroughSource,
  executeCustomerRequestRepeatPermissionThroughSource,
  inspectCustomerRequestRepeatPermissionThroughSource,
  withdrawCustomerRequestRepeatPermissionThroughSource,
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
  effect: {
    class: 'external_state_change',
    reversible: false,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'approve_each',
  },
  surfaces: ['ui', 'http', 'agentJson'],
  run: async ({ data }) => confirmCustomerRequestThroughSource(data),
})

const routeActionInputSchema = customerRequestRouteActionInputSchema.extend({
  requestRef: z.string().trim().min(1).max(200),
}).strict()

const cancellationActionInputSchema = customerRequestCancellationInputSchema.extend({
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
  effect: {
    class: 'external_state_change',
    reversible: false,
    recipientKind: 'provider_system',
    dataClasses: ['customer_request'],
    spendExposure: 'unbounded',
    approval: 'approve_each',
  },
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
  schema: cancellationActionInputSchema,
  outputSchema: customerRequestAgentResultSchema,
  parameters: [
    ...routeActionParameters,
    {
      name: 'mode', type: 'string',
      description: 'Stop the active business too, or let it finish and stop before the next business.',
      required: false,
    },
  ],
  readOnly: false,
  effect: {
    class: 'external_state_change',
    reversible: false,
    recipientKind: 'provider_system',
    dataClasses: ['customer_request'],
    spendExposure: 'none',
    approval: 'approve_each',
  },
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
  effect: {
    class: 'external_state_change',
    reversible: false,
    recipientKind: 'none',
    dataClasses: ['query_text'],
    spendExposure: 'none',
    approval: 'approve_each',
  },
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
  effect: {
    class: 'external_state_change',
    reversible: false,
    recipientKind: 'none',
    dataClasses: ['query_text'],
    spendExposure: 'none',
    approval: 'approve_each',
  },
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
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['ui', 'http', 'agentJson'],
  run: async ({ data }) => inspectCustomerRequestEvidenceThroughSource(data),
})

const repeatPermissionAllowActionInputSchema = customerRequestRepeatPermissionAllowInputSchema.extend({
  requestRef: z.string().trim().min(1).max(200),
}).strict()

export const customerRequestListConnectedAssistantsAction = defineAction({
  id: 'customerRequest.listConnectedAssistants',
  name: 'Read repeat-permission workspace',
  summary: 'List eligible connected assistants and durable repeat-permission receipts for this Request.',
  boundaries: [
    'Returns only assistants already connected to the authenticated Request owner.',
    'Returns bounded customer-safe active and withdrawn permission receipts so a fresh client can resume.',
    'Does not reveal credential material or grant any permission.',
    'Empty assistant or permission lists are explicit and do not change the Request.',
  ],
  schema: z.strictObject({ requestRef: z.string().trim().min(1).max(200) }),
  outputSchema: customerRequestConnectedAssistantsResultSchema,
  parameters: [
    { name: 'requestRef', type: 'string', description: 'The existing Customer Request.', required: true },
  ],
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['ui', 'http', 'agentJson'],
  run: async ({ data }) => listCustomerRequestAssistantsThroughSource(data),
})

export const customerRequestAllowRepeatPermissionAction = defineAction({
  id: 'customerRequest.allowRepeatPermission',
  name: 'Allow bounded repeat use of a Customer Request option',
  summary: 'Allow one named assistant credential to reuse one current low-risk option within exact limits.',
  boundaries: [
    'Does not start work, contact a business, book, charge, dispatch, or fulfil anything.',
    'AE derives each per-use spend and information limit from the exact current option.',
    'Changed options, expired permission, exhausted limits, withdrawal, or consequential effects require confirmation.',
  ],
  schema: repeatPermissionAllowActionInputSchema,
  outputSchema: customerRequestRepeatPermissionResultSchema,
  parameters: [
    { name: 'requestRef', type: 'string', description: 'The existing Customer Request to continue.', required: true },
    { name: 'revision', type: 'number', description: 'The exact Request revision shown with the option.', required: true },
    { name: 'routeRef', type: 'string', description: 'The exact displayed option.', required: true },
    { name: 'delegatedCredentialId', type: 'string', description: 'The already authorized assistant credential.', required: true },
    { name: 'occurrences', type: 'number', description: 'The maximum number of uses.', required: true },
    { name: 'cumulativeSpend', type: 'object', description: 'The total ISO-currency spend ceiling across all uses.', required: true },
    { name: 'validUntil', type: 'number', description: 'When the repeat permission expires.', required: true },
    { name: 'idempotencyKey', type: 'string', description: 'A stable retry key for this permission.', required: true },
  ],
  readOnly: false,
  effect: {
    class: 'external_state_change',
    reversible: true,
    recipientKind: 'none',
    dataClasses: ['assistant_identity'],
    spendExposure: 'bounded',
    approval: 'approve_each',
  },
  surfaces: ['ui', 'http', 'agentJson'],
  run: async ({ data }) => allowCustomerRequestRepeatPermissionThroughSource(data),
})

const repeatPermissionUseActionInputSchema = customerRequestRepeatPermissionUseInputSchema.extend({
  requestRef: z.string().trim().min(1).max(200),
  permissionRef: z.string().trim().min(1).max(300),
}).strict()

export const customerRequestUseRepeatPermissionAction = defineAction({
  id: 'customerRequest.useRepeatPermission',
  name: 'Use bounded repeat permission',
  summary: 'Use one active repeat permission for the same exact current option.',
  boundaries: [
    'Every use still creates one exact current confirmation receipt before work can start.',
    'The caller cannot widen the option, spend, recipients, purposes, effects, expiry, or fallback.',
    'Withdrawal, expiry, changed options, and exhausted limits fail closed.',
  ],
  schema: repeatPermissionUseActionInputSchema,
  outputSchema: customerRequestAgentResultSchema,
  parameters: [
    { name: 'requestRef', type: 'string', description: 'The existing Customer Request to continue.', required: true },
    { name: 'revision', type: 'number', description: 'The exact Request revision shown with the option.', required: true },
    { name: 'routeRef', type: 'string', description: 'The exact displayed option.', required: true },
    { name: 'permissionRef', type: 'string', description: 'The opaque repeat-permission reference.', required: true },
    { name: 'delegatedCredentialId', type: 'string', description: 'The credential named by the permission.', required: true },
    { name: 'idempotencyKey', type: 'string', description: 'A stable retry key for this use.', required: true },
  ],
  readOnly: false,
  effect: {
    class: 'external_state_change',
    reversible: false,
    recipientKind: 'none',
    dataClasses: ['assistant_identity'],
    spendExposure: 'bounded',
    approval: 'approve_each',
  },
  surfaces: ['ui', 'http', 'agentJson'],
  run: async ({ data }) => customerRequestAgentResultSchema.parse(
    await executeCustomerRequestRepeatPermissionThroughSource(data),
  ),
})

const repeatPermissionInspectActionInputSchema = customerRequestRepeatPermissionInspectInputSchema.extend({
  requestRef: z.string().trim().min(1).max(200),
  permissionRef: z.string().trim().min(1).max(300),
}).strict()

export const customerRequestInspectRepeatPermissionAction = defineAction({
  id: 'customerRequest.inspectRepeatPermission',
  name: 'Inspect repeat permission',
  summary: 'Read the current limits and status of one repeat permission.',
  boundaries: [
    'Does not use, renew, widen, or withdraw the permission.',
    'Returns an opaque customer receipt rather than routing or mandate internals.',
    'A missing or unrelated permission is not disclosed.',
  ],
  schema: repeatPermissionInspectActionInputSchema,
  outputSchema: customerRequestRepeatPermissionResultSchema,
  parameters: [
    { name: 'requestRef', type: 'string', description: 'The Customer Request that owns the permission.', required: true },
    { name: 'permissionRef', type: 'string', description: 'The opaque repeat-permission reference.', required: true },
    { name: 'routeRef', type: 'string', description: 'The displayed option bound to the permission.', required: true },
  ],
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['ui', 'http', 'agentJson'],
  run: async ({ data }) => inspectCustomerRequestRepeatPermissionThroughSource(data),
})

const repeatPermissionWithdrawActionInputSchema = customerRequestRepeatPermissionWithdrawInputSchema.extend({
  requestRef: z.string().trim().min(1).max(200),
  permissionRef: z.string().trim().min(1).max(300),
}).strict()

export const customerRequestWithdrawRepeatPermissionAction = defineAction({
  id: 'customerRequest.withdrawRepeatPermission',
  name: 'Withdraw repeat permission',
  summary: 'Prevent any future use of one repeat permission.',
  boundaries: [
    'Withdrawal is durable and does not renew or replace the permission.',
    'It prevents future uses but does not reverse work already authorized by an exact confirmation.',
    'Repeating the same withdrawal key returns the same receipt.',
  ],
  schema: repeatPermissionWithdrawActionInputSchema,
  outputSchema: customerRequestRepeatPermissionResultSchema,
  parameters: [
    { name: 'requestRef', type: 'string', description: 'The Customer Request that owns the permission.', required: true },
    { name: 'permissionRef', type: 'string', description: 'The opaque repeat-permission reference.', required: true },
    { name: 'routeRef', type: 'string', description: 'The displayed option bound to the permission.', required: true },
    { name: 'idempotencyKey', type: 'string', description: 'A stable retry key for withdrawal.', required: true },
  ],
  readOnly: false,
  effect: {
    class: 'external_state_change',
    reversible: false,
    recipientKind: 'none',
    dataClasses: ['assistant_identity'],
    spendExposure: 'none',
    approval: 'approve_each',
  },
  surfaces: ['ui', 'http', 'agentJson'],
  run: async ({ data }) => withdrawCustomerRequestRepeatPermissionThroughSource(data),
})
